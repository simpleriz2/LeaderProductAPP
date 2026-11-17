package com.leaderproduct.app.fork.storage
import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import java.io.File
object DurableFiles {
  fun syncDirectory(directory: File) {
    require(directory.isDirectory)
    val descriptor=Os.open(directory.absolutePath,OsConstants.O_RDONLY,0)
    try{Os.fsync(descriptor)}finally{Os.close(descriptor)}
  }
  fun ensureDirectory(directory: File) {
    if(directory.isDirectory)return
    val parent=directory.parentFile?:error("Missing private parent");ensureDirectory(parent)
    check(directory.mkdir()||directory.isDirectory);syncDirectory(parent)
  }
  fun write(file: File, block: (java.io.FileOutputStream)->Unit) {
    ensureDirectory(file.parentFile!!);val atomic=AtomicFile(file);val stream=atomic.startWrite()
    try{block(stream);atomic.finishWrite(stream)}catch(error:Exception){atomic.failWrite(stream);throw error}
    syncDirectory(file.parentFile!!)
  }
  fun writeBytes(file: File, bytes: ByteArray)=write(file){it.write(bytes)}
  fun copy(source: File, target: File)=write(target){output->source.inputStream().use{it.copyTo(output)}}
}
