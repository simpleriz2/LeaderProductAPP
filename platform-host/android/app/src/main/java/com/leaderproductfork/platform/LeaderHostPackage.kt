package com.leaderproduct.app.fork.platform
import com.leaderproduct.app.fork.BuildConfig
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactMethod
import java.util.UUID
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.uimanager.ViewManager
class LeaderHostInfo(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LeaderHostInfo"
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun randomUUID(): String = UUID.randomUUID().toString()
  @ReactMethod
  fun reload(promise: Promise) {
    val host = (reactApplicationContext.applicationContext as? ReactApplication)?.reactHost
    if (host == null) { promise.reject("HOST_UNAVAILABLE", "Native runtime unavailable"); return }
    // The old JS runtime cannot await its own destruction. Resolve scheduling only.
    promise.resolve(null)
    UiThreadUtil.runOnUiThread { host.reload("Leader Product fork coherent release restart") }
  }
  override fun getConstants(): Map<String,Any> = mapOf("runtime" to BuildConfig.LP2_RUNTIME_ID,"nativeFingerprint" to BuildConfig.LP2_NATIVE_FINGERPRINT,"hostVersion" to BuildConfig.VERSION_CODE,"capabilitiesJson" to BuildConfig.LP2_CAPABILITIES_JSON)
}
class LeaderHostPackage : ReactPackage {
  override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(LeaderHostInfo(context))
  override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
