package com.leaderproduct.app.fork.release

import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
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
  private val executor = ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(16))
  private val files = ReleaseFiles(root, ::writeAtomic)
  override fun getName() = "LeaderReleaseStorage"
  private fun syncDirectory(directory: File) {
    require(directory.isDirectory)
    val descriptor = Os.open(directory.absolutePath,OsConstants.O_RDONLY,0)
    try { Os.fsync(descriptor) } finally { Os.close(descriptor) }
  }
  private fun ensureDirectory(directory: File) {
    if(directory.isDirectory) return
    val parent = directory.parentFile ?: error("Missing private parent")
    ensureDirectory(parent)
    check(directory.mkdir() || directory.isDirectory)
    syncDirectory(parent)
  }
  private fun writeAtomic(file: File, bytes: ByteArray) {
    ensureDirectory(file.parentFile!!)
    val atomic = AtomicFile(file); val stream = atomic.startWrite()
    try { stream.write(bytes); atomic.finishWrite(stream) }
    catch(error: Exception) { atomic.failWrite(stream); throw error }
    // AtomicFile synchronizes file contents; also persist the directory entry after rename.
    syncDirectory(file.parentFile!!)
  }
  private fun pointer(company: String, user: String) = File(root,"pointers/${ReleaseFiles.part(company)}/${ReleaseFiles.part(user)}.json")
  private fun state(company: String, user: String): JSONObject {
    val atomic = AtomicFile(pointer(company,user))
    val bytes = try { atomic.readFully() } catch (_: FileNotFoundException) { return JSONObject() }
    require(bytes.size <= 2 * 1024 * 1024)
    return JSONObject(bytes.toString(Charsets.UTF_8))
  }
  private fun value(state: JSONObject, field: String): String? = if(state.has(field)) state.getString(field) else null
  private fun work(promise: Promise, block: () -> Any?) {
    try { executor.execute { try { promise.resolve(block()) } catch(error: Exception) { promise.reject("RELEASE_STORAGE_FAILED","Private release storage failed",error) } } }
    catch(error: Exception) { promise.reject("RELEASE_STORAGE_BUSY","Private release storage unavailable",error) }
  }
  @ReactMethod fun current(company: String, user: String, promise: Promise) = work(promise) { value(state(company,user),"current") }
  @ReactMethod fun lastGood(company: String, user: String, promise: Promise) = work(promise) { value(state(company,user),"lkg") }
  @ReactMethod fun cachedFile(company: String, user: String, hash: String, promise: Promise) = work(promise) {
    files.cached(company,user,hash)?.let { Base64.encodeToString(it,Base64.NO_WRAP) }
  }
  @ReactMethod fun stage(namespace: String, hash: String, encoded: String, promise: Promise) = work(promise) {
    require(encoded.length <= 16 * 1024 * 1024)
    files.stage(namespace,hash,Base64.decode(encoded,Base64.NO_WRAP)); null
  }
  @ReactMethod fun discard(namespace: String, promise: Promise) = work(promise) { files.discard(namespace); null }
  @ReactMethod fun commit(expected: String?, next: String, namespace: String, promise: Promise) = work(promise) {
    require(next.toByteArray(Charsets.UTF_8).size <= 1024 * 1024)
    val activation = JSONObject(next); val company = activation.getString("company"); val user = activation.getString("user")
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
    if(expected != null) record.put("lkg",expected)
    // One atomic record commits both code and prepared-data-generation pointers, with prior LKG.
    writeAtomic(pointer(company,user),record.toString().toByteArray(Charsets.UTF_8))
    try { files.discard(namespace) } catch (_: Exception) { /* Orphan staging is safe after commit. */ }
    null
  }
  override fun invalidate() { executor.shutdownNow(); super.invalidate() }
}
