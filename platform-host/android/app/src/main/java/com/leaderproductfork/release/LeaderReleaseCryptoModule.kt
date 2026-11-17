package com.leaderproduct.app.fork.release
import android.util.Base64
import com.facebook.react.bridge.*
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
class LeaderReleaseCryptoModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = ThreadPoolExecutor(2, 2, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(16))
  override fun getName() = "LeaderReleaseCrypto"
  private fun work(promise: Promise, block: () -> Any) {
    try { executor.execute { try { promise.resolve(block()) } catch (error: Exception) { promise.reject("RELEASE_CRYPTO_FAILED", "Release verification failed", error) } } }
    catch (error: Exception) { promise.reject("RELEASE_CRYPTO_BUSY", "Release verification unavailable", error) }
  }
  @ReactMethod
  fun verify(publicKey: String, payload: String, signature: String, promise: Promise) = work(promise) {
    require(payload.toByteArray(Charsets.UTF_8).size <= 256 * 1024)
    require(publicKey.length <= 64 && signature.length <= 128)
    ReleaseCrypto.verify(Base64.decode(publicKey,Base64.NO_WRAP),payload.toByteArray(Charsets.UTF_8),Base64.decode(signature,Base64.NO_WRAP))
  }
  @ReactMethod
  fun sha256(encoded: String, promise: Promise) = work(promise) {
    // Byte-array bridge is bounded. Large/streaming artifact files need the storage adapter.
    require(encoded.length <= 16 * 1024 * 1024)
    ReleaseCrypto.sha256(Base64.decode(encoded,Base64.NO_WRAP))
  }
  override fun invalidate() { executor.shutdownNow(); super.invalidate() }
}
