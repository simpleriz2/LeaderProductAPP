package com.leaderproduct.app.fork.network
import com.facebook.react.bridge.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Bounded JSON API transport. Redirects are refused before credentials can be forwarded. */
class LeaderHttpModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private data class RequestState(val connection: HttpURLConnection, val cancelled: AtomicBoolean = AtomicBoolean(false))
  private val requests = ConcurrentHashMap<String, RequestState>()
  private val executor = ThreadPoolExecutor(2, 2, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(32))
  override fun getName() = "LeaderHttp"
  @ReactMethod
  fun request(id: String, url: String, method: String, token: String, body: String?, promise: Promise) {
    var state: RequestState? = null
    try {
      require(id.matches(Regex("[A-Za-z0-9._-]{1,128}")))
      require(method == "GET" || method == "POST")
      require(token.matches(Regex("[A-Za-z0-9._~=-]{1,8192}")))
      require(body == null || body.toByteArray(Charsets.UTF_8).size <= 2 * 1024 * 1024)
      val target = URL(url)
      require(target.userInfo == null && target.ref == null)
      require(target.protocol == "https" || (target.protocol == "http" && target.host in listOf("127.0.0.1", "localhost", "[::1]")))
      val connection = target.openConnection() as HttpURLConnection
      state = RequestState(connection)
      require(requests.putIfAbsent(id, state) == null)
      val owned = state
      executor.execute {
        try {
          check(!owned.cancelled.get())
          connection.instanceFollowRedirects = false
          connection.connectTimeout = 10000
          connection.readTimeout = 15000
          connection.requestMethod = method
          connection.setRequestProperty("Authorization", "Bearer $token")
          connection.setRequestProperty("Accept", "application/json")
          if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
          }
          check(!owned.cancelled.get())
          val status = connection.responseCode
          check(status !in 300..399) { "Redirect refused" }
          val stream = if (status >= 400) connection.errorStream else connection.inputStream
          val output = java.io.ByteArrayOutputStream()
          stream?.use {
            val buffer = ByteArray(8192)
            while (true) {
              check(!owned.cancelled.get())
              val count = it.read(buffer)
              if (count < 0) break
              check(output.size() + count <= 2 * 1024 * 1024) { "Response too large" }
              output.write(buffer, 0, count)
            }
          }
          check(!owned.cancelled.get())
          promise.resolve(Arguments.createMap().apply { putInt("status", status); putString("body", output.toString("UTF-8")) })
        } catch (error: Exception) { promise.reject("SERVICE_REQUEST_FAILED", "Service request failed or was cancelled", error) }
        finally { requests.remove(id, owned); connection.disconnect() }
      }
    } catch (error: Exception) {
      state?.let { requests.remove(id, it); it.connection.disconnect() }
      promise.reject("SERVICE_REQUEST_REJECTED", "Service request could not be started", error)
    }
  }
  @ReactMethod
  fun cancel(id: String) { requests[id]?.let { it.cancelled.set(true); it.connection.disconnect() } }
  override fun invalidate() {
    requests.values.forEach { it.cancelled.set(true); it.connection.disconnect() }
    requests.clear()
    executor.shutdownNow()
    super.invalidate()
  }
}
