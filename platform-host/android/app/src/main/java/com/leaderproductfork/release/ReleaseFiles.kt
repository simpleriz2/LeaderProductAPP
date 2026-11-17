package com.leaderproduct.app.fork.release

import java.io.File

/** Private content store. Names are identifiers/digests, never downloaded relative paths. */
class ReleaseFiles(private val root: File, private val writeAtomic: (File, ByteArray) -> Unit) {
  companion object {
    const val MAX_BYTES = 12 * 1024 * 1024
    fun part(value: String): String {
      require(Regex("[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}").matches(value)) { "Invalid namespace" }
      return value
    }
    fun digest(value: String): String {
      require(Regex("[a-f0-9]{64}").matches(value)) { "Invalid digest" }
      return value
    }
    fun namespace(value: String): List<String> {
      val parts = value.split('/')
      require(parts.size == 4)
      parts.forEach { part(it) }
      return parts
    }
  }
  private fun staging(namespace: String): File {
    namespace(namespace)
    return File(root, "staging/${ReleaseCrypto.sha256(namespace.toByteArray(Charsets.UTF_8))}")
  }
  fun blob(company: String, user: String, hash: String) = File(root, "blobs/${part(company)}/${part(user)}/${digest(hash)}")
  private fun verified(file: File, hash: String): ByteArray {
    require(file.length() <= MAX_BYTES)
    val bytes = file.readBytes()
    require(bytes.size <= MAX_BYTES && ReleaseCrypto.sha256(bytes) == digest(hash)) { "Cached digest mismatch" }
    return bytes
  }
  fun cached(company: String, user: String, hash: String): ByteArray? {
    val file = blob(company,user,hash)
    if(!file.exists()) return null
    if(file.length() > MAX_BYTES) return null
    val bytes = file.readBytes()
    return if(bytes.size <= MAX_BYTES && ReleaseCrypto.sha256(bytes) == digest(hash)) bytes else null
  }
  /** Materialize ONLY digest-verified private bytes for Re.Pack's absolute-file evaluator. */
  fun executionFile(company:String,user:String,hash:String,size:Int):File{
    require(size in 0..MAX_BYTES)
    val bytes=cached(company,user,hash)?:error("Missing verified executable")
    require(bytes.size==size){"Executable size mismatch"}
    val target=File(root,"execution/${part(company)}/${part(user)}/${digest(hash)}.bundle")
    val reusable=try{target.exists()&&verified(target,hash).contentEquals(bytes)}catch(_:Exception){false}
    if(!reusable)writeAtomic(target,bytes)
    require(verified(target,hash).size==size)
    return target
  }
  fun stage(namespace: String, hash: String, bytes: ByteArray) {
    require(bytes.size <= MAX_BYTES && ReleaseCrypto.sha256(bytes) == digest(hash))
    writeAtomic(File(staging(namespace),hash),bytes)
  }
  fun promote(namespace: String, company: String, user: String, release: String, hashes: List<String>) {
    val parts = namespace(namespace)
    require(parts.take(3) == listOf(part(company),part(user),part(release))) { "Cross-namespace commit" }
    require(hashes.size <= 4096)
    for(hash in hashes.distinct()) writeAtomic(blob(company,user,hash),verified(File(staging(namespace),digest(hash)),hash))
  }
  fun discard(namespace: String) {
    val dir = staging(namespace)
    if(dir.exists()) check(dir.deleteRecursively()) { "Staging cleanup failed" }
  }
}
