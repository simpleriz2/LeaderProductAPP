package com.leaderproduct.app.fork.release
import android.app.Application
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[24,35],application=Application::class)
class BootstrapPointerTest{
 private fun activation()=JSONObject().put("company","alpha").put("user","alice").put("dataGeneration","data-1").put("release",JSONObject().put("company","alpha").put("id","set-1").put("artifacts",JSONArray())).put("signed",JSONObject().put("keyId","fixture").put("payload","fixture-payload").put("signature","fixture-signature")).toString()
 @Test fun existingMalformedRecordNeverMeansFirstInstallation(){
  for(raw in listOf("{}","{\"storageFormat\":2}","{\"current\":null}","{\"current\":\"null\"}"))assertThrows(Exception::class.java){BootstrapPointer.record(raw,"alpha","alice")}
  val raw=JSONObject().put("storageFormat",2).put("current",activation()).toString();assertEquals(activation(),BootstrapPointer.record(raw,"alpha","alice").getString("current"));assertThrows(Exception::class.java){BootstrapPointer.record(raw,"beta","bob")}
 }
 @Test fun unconfirmedLegacyCheckpointIsIgnoredButActiveDataReferenceIsRetained(){
  val old=JSONObject().put("current",activation()).put("lkg",activation());val upgraded=BootstrapPointer.record(old.toString(),"alpha","alice");assertFalse(upgraded.has("lkg"));assertEquals(activation(),upgraded.getString("current"))
  old.put("storageFormat",999);assertThrows(Exception::class.java){BootstrapPointer.record(old.toString(),"alpha","alice")}
 }
}
