package com.leaderproduct.app.fork.release
import com.google.crypto.tink.subtle.Ed25519Verify
import java.security.GeneralSecurityException
import java.security.MessageDigest
/** Raw Ed25519, exact payload bytes. Trust roots are supplied only by the host's pinned keyring. */
object ReleaseCrypto {
  fun verify(publicKey: ByteArray, payload: ByteArray, signature: ByteArray): Boolean {
    if (publicKey.size != 32 || signature.size != 64) return false
    return try { Ed25519Verify(publicKey).verify(signature, payload); true } catch (_: GeneralSecurityException) { false }
  }
  fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
