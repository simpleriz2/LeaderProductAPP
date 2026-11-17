package com.leaderproduct.app.fork.network
import java.net.ServerSocket
import java.net.InetAddress
import java.net.URL
import java.net.HttpURLConnection
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
          val reader=client.getInputStream().bufferedReader();val requestLine=reader.readLine().split(' ');val route=requestLine[1]
          val headers=ArrayList<String>();while(true){val line=reader.readLine()?:break;if(line.isEmpty())break;headers.add(line)}
          val output=client.getOutputStream()
          when(route){
            "/mutation" -> {
              check(requestLine[0] in listOf("PUT","DELETE"));check(headers.any{it.equals("Authorization: Bearer fixture-scoped",true)})
              val length=headers.firstOrNull{it.startsWith("Content-Length:",true)}?.substringAfter(":")?.trim()?.toInt()?:0
              val body=CharArray(length);var offset=0;while(offset<length){val n=reader.read(body,offset,length-offset);check(n>0);offset+=n}
              check(String(body)==if(requestLine[0]=="PUT") "{\"description\":null}" else "")
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
    val connection=URL(url).openConnection() as HttpURLConnection
    try{return HttpExchange.execute(connection,"GET","fixture-scoped",null,AtomicBoolean(false),binary)}finally{connection.disconnect()}
  }
  @Test fun binaryBytesAndNoRedirectCredentialLeakOverRealLoopback(){
    Fixture().use { server ->
      val result=call(server.origin+"/bytes");assertEquals(200,result.first);assertArrayEquals(byteArrayOf(0,-1,1,-128),result.second)
      assertThrows(IllegalStateException::class.java){call(server.origin+"/redirect")};assertEquals(0,server.leaked.get())
    }
  }
  @Test fun explicitMutationsReachRealServerWithoutChangingVerbOrNullBody(){
    Fixture().use { server -> for(method in listOf("PUT","DELETE")){
      val connection=URL(server.origin+"/mutation").openConnection() as HttpURLConnection
      try{val result=HttpExchange.execute(connection,method,"fixture-scoped",if(method=="PUT") "{\"description\":null}" else null,AtomicBoolean(false),false);assertEquals(204,result.first);assertEquals(0,result.second.size)}finally{connection.disconnect()}
    }}
  }
  @Test fun streamedOversizeAndAlreadyCancelledRequestsAreRejected(){
    Fixture().use{server->assertThrows(IllegalStateException::class.java){call(server.origin+"/large",false)}}
    val cancelled=URL("http://127.0.0.1:1/not-called").openConnection() as HttpURLConnection
    try{assertThrows(IllegalStateException::class.java){HttpExchange.execute(cancelled,"GET","fixture",null,AtomicBoolean(true),true)}}finally{cancelled.disconnect()}
  }
}
