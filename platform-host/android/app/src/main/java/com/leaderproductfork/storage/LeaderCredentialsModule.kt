package com.leaderproduct.app.fork.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Fork-private last-confirmed session. Errors never fall back to plaintext storage. */
class LeaderCredentialsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val preferences = context.getSharedPreferences("lp2-confirmed-session", Context.MODE_PRIVATE)
  private val alias = "lp2-confirmed-session-v1"
  override fun getName() = "LeaderCredentials"

  private fun key(create: Boolean): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = store.getKey(alias, null)
    if (existing is SecretKey) return existing
    check(create) { "Session encryption key unavailable" }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true).build())
    return generator.generateKey()
  }

  @ReactMethod
  fun readSession(promise: Promise) {
    try {
      val encoded = preferences.getString("session", null)
      if (encoded == null) { promise.resolve(null); return }
      val parts = encoded.split(":")
      check(parts.size == 3 && parts[0] == "v1") { "Invalid session envelope" }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP)))
      cipher.updateAAD(alias.toByteArray(Charsets.UTF_8))
      promise.resolve(String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), Charsets.UTF_8))
    } catch (error: Exception) { promise.reject("SESSION_READ_FAILED", "Secure session unavailable", error) }
  }

  @ReactMethod
  fun writeSession(value: String, promise: Promise) {
    try {
      require(value.toByteArray(Charsets.UTF_8).size <= 65536) { "Session too large" }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key(true))
      cipher.updateAAD(alias.toByteArray(Charsets.UTF_8))
      val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
      val envelope = "v1:${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(encrypted, Base64.NO_WRAP)}"
      check(preferences.edit().putString("session", envelope).commit()) { "Session write failed" }
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("SESSION_WRITE_FAILED", "Secure session could not be saved", error) }
  }

  @ReactMethod
  fun clearSession(promise: Promise) {
    try {
      // This key belongs ONLY to authorization, never to drafts/outbox/business data.
      // Deleting it invalidates the cached envelope even if preference removal fails.
      var keyDeleted = false
      try {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(alias)) store.deleteEntry(alias)
        keyDeleted = true
      } catch (_: Exception) { /* Still try removing the envelope. */ }
      val preferencesCleared = preferences.edit().remove("session").commit()
      check(keyDeleted || preferencesCleared) { "Session invalidation failed" }
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("SESSION_CLEAR_FAILED", "Secure session could not be cleared", error) }
  }
}
