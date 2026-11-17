package com.leaderproduct.app.fork.release

import android.util.AtomicFile
import com.leaderproduct.app.fork.storage.DurableFiles
import com.leaderproduct.app.fork.platform.ByteBudget
import android.util.Base64
import com.facebook.react.bridge.*
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Single-process bootstrap storage, independent from every business database. */
class LeaderReleaseStorageModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val root = File(context.filesDir, "lp2-release-store")
  companion object{
    private val executor=ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(16))
    private val budget=ByteBudget(16L*1024*1024)
  }
  @Volatile private var accepting=true
  private val files = ReleaseFiles(root, ::writeAtomic)
  override fun getName() = "LeaderReleaseStorage"
  private fun writeAtomic(file: File, bytes: ByteArray)=DurableFiles.writeBytes(file,bytes)
  private fun pointer(company: String, user: String) = File(root,"pointers/${ReleaseFiles.part(company)}/${ReleaseFiles.part(user)}.json")
  private fun state(company: String, user: String): JSONObject? {
    val atomic = AtomicFile(pointer(company,user))
    val bytes = try { atomic.readFully() } catch (error: FileNotFoundException) {
      if(atomic.baseFile.exists()||File(atomic.baseFile.path+".bak").exists())throw error
      return null
    }
    require(bytes.size <= 2 * 1024 * 1024)
    return BootstrapPointer.record(bytes.toString(Charsets.UTF_8),company,user)
  }
  private fun writePointer(file: File, record: JSONObject) {
    val bytes = record.put("storageFormat",2).toString().toByteArray(Charsets.UTF_8)
    require(bytes.size <= 2 * 1024 * 1024)
    writeAtomic(file,bytes)
  }
  private fun value(state: JSONObject?, field: String): String? = state?.let { if(it.has(field)) it.getString(field) else null }
  private fun work(promise:Promise,weight:Long=0,block:()->Any?){
    var acquired=false
    try{
      check(accepting);check(budget.acquire(weight)){"Release storage byte budget busy"};acquired=true
      executor.execute{try{check(accepting);val result=block();if(reactApplicationContext.hasActiveReactInstance())promise.resolve(result)}
        catch(error:Exception){if(reactApplicationContext.hasActiveReactInstance())promise.reject("RELEASE_STORAGE_FAILED","Private release storage failed",error)}
        finally{budget.release(weight)}}
    }catch(error:Exception){if(acquired)budget.release(weight);if(reactApplicationContext.hasActiveReactInstance())promise.reject("RELEASE_STORAGE_BUSY","Private release storage unavailable",error)}
  }
  @ReactMethod fun current(company: String, user: String, promise: Promise) = work(promise) { value(state(company,user),"current") }
  @ReactMethod fun lastGood(company: String, user: String, promise: Promise) = work(promise) { value(state(company,user),"lkg") }
  @ReactMethod fun cachedFile(company: String, user: String, hash: String, promise: Promise) = work(promise) {
    files.cached(company,user,hash)?.let { Base64.encodeToString(it,Base64.NO_WRAP) }
  }
  @ReactMethod fun verifiedFile(company:String,user:String,hash:String,size:Double,promise:Promise)=work(promise){
    require(size.isFinite()&&size==size.toInt().toDouble())
    "file://"+files.executionFile(company,user,hash,size.toInt()).absolutePath
  }
  @ReactMethod fun stage(namespace: String, hash: String, encoded: String, promise: Promise) = work(promise,encoded.length.toLong()) {
    require(encoded.length <= 16 * 1024 * 1024)
    files.stage(namespace,hash,Base64.decode(encoded,Base64.NO_WRAP)); null
  }
  @ReactMethod fun discard(namespace: String, promise: Promise) = work(promise) { files.discard(namespace); null }
  @ReactMethod fun commit(expected: String?, next: String, namespace: String, promise: Promise) = work(promise,(expected?.length?:0).toLong()+next.length) {
    require(next.toByteArray(Charsets.UTF_8).size <= 1024 * 1024)
    val activation = JSONObject(next); val company = activation.getString("company"); val user = activation.getString("user")
    BootstrapPointer.activation(next,company,user)
    val release = activation.getJSONObject("release"); require(release.getString("company") == company)
    ReleaseFiles.part(activation.getString("dataGeneration"))
    val previous = state(company,user)
    check(value(previous,"current") == expected) { "Concurrent activation" }
    val hashes = ArrayList<String>(); val artifacts = release.getJSONArray("artifacts"); require(artifacts.length() <= 128)
    for(i in 0 until artifacts.length()) {
      val artifact = artifacts.getJSONObject(i); hashes.add(artifact.getString("digest"))
      val assets = artifact.getJSONArray("assets"); require(assets.length() <= 512)
      for(j in 0 until assets.length()) hashes.add(assets.getJSONObject(j).getString("digest"))
    }
    files.promote(namespace,company,user,release.getString("id"),hashes)
    val record = JSONObject().put("current",next)
    value(previous,"lkg")?.let { record.put("lkg",it) }
    // One atomic record commits both code and prepared-data-generation pointers, with prior LKG.
    writePointer(pointer(company,user),record)
    try { files.discard(namespace) } catch (_: Exception) { /* Orphan staging is safe after commit. */ }
    null
  }
  @ReactMethod fun confirmHealthy(expected: String, promise: Promise) = work(promise,expected.length.toLong()) {
    require(expected.toByteArray(Charsets.UTF_8).size <= 1024 * 1024)
    val activation = JSONObject(expected);val company=activation.getString("company");val user=activation.getString("user")
    BootstrapPointer.activation(expected,company,user)
    val previous=state(company,user)
    check(value(previous,"current")==expected) { "Concurrent health confirmation" }
    writePointer(pointer(company,user),JSONObject().put("current",expected).put("lkg",expected))
    null
  }
  override fun invalidate() { accepting=false;super.invalidate() }
}
