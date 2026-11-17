package com.leaderproduct.app.fork.network
import com.facebook.react.bridge.*
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Bounded JSON and binary API transport. Redirects are refused before credentials can be forwarded. */
class LeaderHttpModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private data class RequestState(val connection: HttpURLConnection, val cancelled: AtomicBoolean = AtomicBoolean(false))
  private val requests = ConcurrentHashMap<String, RequestState>()
  private val executor = ThreadPoolExecutor(2, 2, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(32))
  override fun getName() = "LeaderHttp"
  @ReactMethod
  fun request(id: String, url: String, method: String, token: String, body: String?, promise: Promise) {
    start(id,url,method,token,body,false,promise)
  }
  @ReactMethod
  fun requestBytes(id: String, url: String, token: String, promise: Promise) {
    start(id,url,"GET",token,null,true,promise)
  }
  private fun start(id: String, url: String, method: String, token: String, body: String?, binary: Boolean, promise: Promise) {
    var state: RequestState? = null
    try {
      require(id.matches(Regex("[A-Za-z0-9._-]{1,128}")))
      require(method in listOf("GET", "POST", "PUT", "DELETE"))
      require(method != "GET" || body == null)
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
          val (status, bytes) = HttpExchange.execute(connection,method,token,body,owned.cancelled,binary)
          promise.resolve(Arguments.createMap().apply {
            putInt("status",status)
            putString("body",if(binary) Base64.encodeToString(bytes,Base64.NO_WRAP) else bytes.toString(Charsets.UTF_8))
          })
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
