package com.leaderproduct.app.fork.network
import java.net.ServerSocket
import java.net.InetAddress
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test
class HttpExchangeTest {
  // Raw loopback HTTP avoids any Android mock server or dependency on unavailable JDK modules.
  private class Fixture : Closeable {
    private val socket=ServerSocket(0,8,InetAddress.getByName("127.0.0.1"))
    val origin="http://127.0.0.1:${socket.localPort}";val leaked=AtomicInteger(0)
    private val failure=AtomicReference<Throwable?>(null)
    private val worker=Thread {
      while(!socket.isClosed) try {
        socket.accept().use { client ->
          val input=client.getInputStream()
          fun line():String{val bytes=ByteArrayOutputStream();while(true){val byte=input.read();if(byte<0||byte==10)break;if(byte!=13)bytes.write(byte)};return bytes.toString("UTF-8")}
          val requestLine=line().split(' ');val route=requestLine[1]
          val headers=ArrayList<String>();while(true){val header=line();if(header.isEmpty())break;headers.add(header)}
          val length=headers.firstOrNull{it.startsWith("Content-Length:",true)}?.substringAfter(":")?.trim()?.toInt()?:0
          val body=input.readNBytes(length).toString(Charsets.UTF_8)
          val output=client.getOutputStream()
          when(route){
            "/public" -> {
              check(headers.none{it.startsWith("Authorization:",true)})
              check(requestLine[0]=="POST" && body=="{\"user\":\"тест\",\"password\":\"fixture-only\"}")
              output.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".toByteArray())
            }
            "/stall" -> {
              output.write("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n1\r\nx\r\n".toByteArray());output.flush()
              while(!socket.isClosed){Thread.sleep(10);output.write("1\r\nx\r\n".toByteArray());output.flush()}
            }
            "/mutation" -> {
              check(requestLine[0] in listOf("PUT","DELETE","PATCH"));check(headers.any{it.equals("Authorization: Bearer fixture-scoped",true)})
              check(body==if(requestLine[0] in listOf("PUT","PATCH")) "{\"description\":null}" else "")
              output.write("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            }
            "/redirect" -> output.write("HTTP/1.1 302 Found\r\nLocation: $origin/target\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            "/target" -> {leaked.incrementAndGet();output.write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())}
            "/bytes" -> {
              check(headers.any{it.equals("Authorization: Bearer fixture-scoped",true)})
              output.write("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n".toByteArray());output.write(byteArrayOf(0,-1,1,-128))
            }
            "/large" -> {
              val bytes=ByteArray(2*1024*1024+1)
              output.write("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${bytes.size.toString(16)}\r\n".toByteArray());output.write(bytes);output.write("\r\n0\r\n\r\n".toByteArray())
            }
          }
          output.flush()
        }
      }catch(_:IOException){/* Closing a deliberately rejected response/server is expected. */}
      catch(error:Throwable){failure.set(error);break}
    }.apply{isDaemon=true;start()}
    override fun close(){socket.close();worker.join(1000);failure.get()?.let{throw AssertionError("Fixture failed",it)}}
  }
  private fun call(url:String,binary:Boolean=true):Pair<Int,ByteArray>{
    val call=HttpExchange.createCall(url,"GET","fixture-scoped",null,binary)
    try{return HttpExchange.execute(call,AtomicBoolean(false),binary)}finally{call.cancel()}
  }
  @Test fun binaryBytesAndNoRedirectCredentialLeakOverRealLoopback(){
    Fixture().use { server ->
      val result=call(server.origin+"/bytes");assertEquals(200,result.first);assertArrayEquals(byteArrayOf(0,-1,1,-128),result.second)
      assertThrows(IllegalStateException::class.java){call(server.origin+"/redirect")};assertEquals(0,server.leaked.get())
    }
  }
  @Test fun explicitMutationsReachRealServerWithoutChangingVerbOrNullBody(){
    Fixture().use { server -> for(method in listOf("PUT","DELETE","PATCH")){
      val call=HttpExchange.createCall(server.origin+"/mutation",method,"fixture-scoped",if(method in listOf("PUT","PATCH")) "{\"description\":null}" else null,false)
      try{val result=HttpExchange.execute(call,AtomicBoolean(false),false);assertEquals(204,result.first);assertEquals(0,result.second.size)}finally{call.cancel()}
    }}
  }
  @Test fun publicHasNoBearerAndFullCallDeadlineCancelsDrippingBody(){
    Fixture().use { server ->
      val publicCall=HttpExchange.createCall(server.origin+"/public","POST",null,"{\"user\":\"тест\",\"password\":\"fixture-only\"}",false)
      try{assertEquals(200,HttpExchange.execute(publicCall,AtomicBoolean(false),false).first)}finally{publicCall.cancel()}
      val stalled=HttpExchange.createCall(server.origin+"/stall","GET","fixture-scoped",null,false,100)
      val start=System.nanoTime()
      try{assertThrows(IOException::class.java){HttpExchange.execute(stalled,AtomicBoolean(false),false)}}finally{stalled.cancel()}
      assertTrue("Deadline must bound the whole streaming call",(System.nanoTime()-start)/1000000<2000)
    }
  }
  @Test fun streamedOversizeAndAlreadyCancelledRequestsAreRejected(){
    Fixture().use{server->assertThrows(IllegalStateException::class.java){call(server.origin+"/large",false)}}
    val cancelled=HttpExchange.createCall("http://127.0.0.1:1/not-called","GET","fixture",null,true)
    try{assertThrows(IllegalStateException::class.java){HttpExchange.execute(cancelled,AtomicBoolean(true),true)}}finally{cancelled.cancel()}
  }
}
