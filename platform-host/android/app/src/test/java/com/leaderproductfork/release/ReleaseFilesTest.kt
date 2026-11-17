package com.leaderproduct.app.fork.release
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test
class ReleaseFilesTest {
  private fun fixture(block: (ReleaseFiles) -> Unit) {
    val root = Files.createTempDirectory("lp2-release-files-").toFile()
    try { block(ReleaseFiles(root) { file, bytes -> file.parentFile!!.mkdirs(); file.writeBytes(bytes) }) }
    finally { root.deleteRecursively() }
  }
  @Test fun bytesArePrivateAndPromotedOnlyFromMatchingNamespace() = fixture { files ->
    val bytes = "trusted chunk".toByteArray(); val hash = ReleaseCrypto.sha256(bytes)
    files.stage("alpha/alice/set-1/attempt-1",hash,bytes)
    assertNull(files.cached("alpha","alice",hash))
    assertThrows(IllegalArgumentException::class.java) { files.promote("alpha/alice/set-1/attempt-1","beta","bob","set-1",listOf(hash)) }
    files.promote("alpha/alice/set-1/attempt-1","alpha","alice","set-1",listOf(hash))
    assertArrayEquals(bytes,files.cached("alpha","alice",hash)); assertNull(files.cached("beta","bob",hash))
    files.discard("alpha/alice/set-1/attempt-1");assertArrayEquals(bytes,files.cached("alpha","alice",hash))
  }
  @Test fun tamperedIncompleteAndEscapedFilesCannotPromote() = fixture { files ->
    val hash = ReleaseCrypto.sha256("expected".toByteArray())
    assertThrows(IllegalArgumentException::class.java) { files.stage("alpha/alice/set-1/attempt-1",hash,"changed".toByteArray()) }
    assertThrows(Exception::class.java) { files.promote("alpha/alice/set-1/attempt-1","alpha","alice","set-1",listOf(hash)) }
    for(value in listOf("../other","..","/absolute","a/b","")) assertThrows(IllegalArgumentException::class.java) { files.cached(value,"alice",hash) }
    assertThrows(IllegalArgumentException::class.java) { files.discard("alpha/alice/set-1/../../other") }
  }
  @Test fun corruptCacheIsARecoverableMissWithoutCrossTenantFallback() = fixture { files ->
    val bytes = "trusted".toByteArray();val hash=ReleaseCrypto.sha256(bytes)
    files.stage("alpha/alice/set-1/attempt-1",hash,bytes);files.promote("alpha/alice/set-1/attempt-1","alpha","alice","set-1",listOf(hash))
    files.blob("alpha","alice",hash).writeText("corrupt");assertNull(files.cached("alpha","alice",hash))
  }
  @Test fun executableMaterializationRequiresPrivateVerifiedBytesAndExactSize() = fixture { files ->
    val bytes="trusted executable".toByteArray();val hash=ReleaseCrypto.sha256(bytes)
    assertThrows(Exception::class.java){files.executionFile("alpha","alice",hash,bytes.size)}
    files.stage("alpha/alice/set-1/attempt-1",hash,bytes);files.promote("alpha/alice/set-1/attempt-1","alpha","alice","set-1",listOf(hash))
    assertThrows(Exception::class.java){files.executionFile("beta","bob",hash,bytes.size)}
    assertThrows(Exception::class.java){files.executionFile("alpha","alice",hash,bytes.size+1)}
    val executable=files.executionFile("alpha","alice",hash,bytes.size)
    assertTrue(executable.absolutePath.endsWith("/execution/alpha/alice/$hash.bundle"));assertArrayEquals(bytes,executable.readBytes())
    executable.writeText("corrupt derived copy");assertArrayEquals(bytes,files.executionFile("alpha","alice",hash,bytes.size).readBytes())
    files.blob("alpha","alice",hash).writeText("corrupted source")
    assertThrows(Exception::class.java){files.executionFile("alpha","alice",hash,bytes.size)}
    assertArrayEquals(bytes,executable.readBytes())
  }

}
