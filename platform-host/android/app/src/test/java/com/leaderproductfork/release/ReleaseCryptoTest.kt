package com.leaderproduct.app.fork.release
import org.junit.Assert.*
import org.junit.Test
class ReleaseCryptoTest {
  private fun hex(value: String) = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
  @Test fun rfc8032VectorAndTampering() {
    val key=hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
    val signature=hex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
    assertTrue(ReleaseCrypto.verify(key,byteArrayOf(),signature))
    assertFalse(ReleaseCrypto.verify(key,byteArrayOf(1),signature))
    assertFalse(ReleaseCrypto.verify(key,byteArrayOf(),signature.copyOf(63)))
    assertFalse(ReleaseCrypto.verify(key.copyOf(31),byteArrayOf(),signature))
  }
  @Test fun standardSha256() { assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",ReleaseCrypto.sha256("abc".toByteArray())) }
}
