package com.leaderproduct.app.fork.network

import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.io.ByteArrayOutputStream

/** Independent client: no redirects, cookies, ambient auth, cache or implicit request retry. */
object HttpExchange {
  private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
    .retryOnConnectionFailure(false).cache(null).connectTimeout(10,TimeUnit.SECONDS)
    .readTimeout(15,TimeUnit.SECONDS).writeTimeout(15,TimeUnit.SECONDS).build()
  fun createCall(url: String, method: String, token: String?, body: String?, binary: Boolean, timeoutMillis: Long = if(binary) 60000 else 15000): Call {
    require(method in listOf("GET","POST","PUT","DELETE","PATCH"))
    require(method != "GET" || body == null)
    require(!binary || (method == "GET" && body == null && token != null))
    require(token == null || token.matches(Regex("[A-Za-z0-9._~=-]{1,8192}")))
    require(body == null || body.toByteArray(Charsets.UTF_8).size <= 2*1024*1024)
    require(timeoutMillis in 10..120000)
    val builder=Request.Builder().url(url).header("Accept",if(binary) "application/octet-stream" else "application/json")
    val target=builder.build().url
    require(target.username.isEmpty() && target.password.isEmpty() && target.fragment == null)
    require(target.isHttps || target.host in listOf("127.0.0.1","localhost","::1"))
    if(token != null) builder.header("Authorization","Bearer $token")
    val payload=if(body != null || method in listOf("POST","PUT","PATCH")) (body ?: "").toRequestBody("application/json; charset=utf-8".toMediaType()) else null
    val call=client.newCall(builder.method(method,payload).build())
    // Absolute deadline includes time spent in the bridge's bounded executor queue.
    call.timeout().deadline(timeoutMillis,TimeUnit.MILLISECONDS)
    return call
  }
  fun execute(call: Call, cancelled: AtomicBoolean, binary: Boolean): Pair<Int, ByteArray> {
    check(!cancelled.get());call.timeout().throwIfReached()
    return call.execute().use { response ->
      check(!cancelled.get());val status=response.code
      check(status !in 300..399) { "Redirect refused" }
      if(binary && status != 200) return@use Pair(status,ByteArray(0))
      val limit=if(binary) 12*1024*1024 else 2*1024*1024
      check((response.body?.contentLength() ?: 0) <= limit) { "Response too large" }
      val output=ByteArrayOutputStream()
      response.body?.byteStream()?.use { stream ->
        val buffer=ByteArray(8192)
        while(true){check(!cancelled.get());val count=stream.read(buffer);if(count<0)break;check(output.size()+count<=limit){"Response too large"};output.write(buffer,0,count)}
      }
      check(!cancelled.get());Pair(status,output.toByteArray())
    }
  }
}
