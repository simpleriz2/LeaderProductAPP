package com.leaderproduct.app.fork.network

import java.net.HttpURLConnection
import java.util.concurrent.atomic.AtomicBoolean
import java.io.ByteArrayOutputStream

/** Real JVM HTTP implementation used by Android's bounded bridge. No redirects or shared cache. */
object HttpExchange {
  fun execute(connection: HttpURLConnection, method: String, token: String, body: String?, cancelled: AtomicBoolean, binary: Boolean): Pair<Int, ByteArray> {
    require(method in listOf("GET", "POST", "PUT", "DELETE"))
    require(method != "GET" || body == null)
    check(!cancelled.get())
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.connectTimeout = 10000
    connection.readTimeout = 15000
    connection.requestMethod = method
    connection.setRequestProperty("Authorization", "Bearer $token")
    connection.setRequestProperty("Accept", if(binary) "application/octet-stream" else "application/json")
    if(body != null) {
      connection.doOutput = true; connection.setRequestProperty("Content-Type","application/json")
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    }
    check(!cancelled.get())
    val status = connection.responseCode
    check(status !in 300..399) { "Redirect refused" }
    if(binary && status != 200) return Pair(status,ByteArray(0))
    val limit = if(binary) 12 * 1024 * 1024 else 2 * 1024 * 1024
    check(connection.contentLengthLong <= limit) { "Response too large" }
    val stream = if(status >= 400) connection.errorStream else connection.inputStream
    val output = ByteArrayOutputStream()
    stream?.use {
      val buffer = ByteArray(8192)
      while(true) {
        check(!cancelled.get()); val count = it.read(buffer); if(count < 0) break
        check(output.size() + count <= limit) { "Response too large" }; output.write(buffer,0,count)
      }
    }
    check(!cancelled.get()); return Pair(status,output.toByteArray())
  }
}
