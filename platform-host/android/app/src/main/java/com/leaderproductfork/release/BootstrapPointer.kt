package com.leaderproduct.app.fork.release
import org.json.JSONObject
/** A malformed existing pointer is NOT a first installation. This performs structure, not signature verification. */
internal object BootstrapPointer{
  private fun string(value:JSONObject,key:String)=value.get(key) as? String?:error("Corrupt bootstrap field")
  fun activation(raw:String,company:String,user:String){
    require(raw.toByteArray(Charsets.UTF_8).size<=1024*1024)
    val value=JSONObject(raw);require(string(value,"company")==company&&string(value,"user")==user)
    ReleaseFiles.part(string(value,"dataGeneration"));val release=value.getJSONObject("release");require(string(release,"company")==company);ReleaseFiles.part(string(release,"id"));release.getJSONArray("artifacts")
    val signed=value.getJSONObject("signed");ReleaseFiles.part(string(signed,"keyId"));require(string(signed,"payload").toByteArray(Charsets.UTF_8).size<=256*1024);string(signed,"signature")
  }
  fun record(raw:String,company:String,user:String):JSONObject{
    val record=JSONObject(raw);require(!record.has("storageFormat")||(record.get("storageFormat") is Number&&(record.get("storageFormat") as Number).toDouble()==2.0)){"Unsupported bootstrap storage format"}
    activation(string(record,"current"),company,user)
    if(!record.has("storageFormat"))record.remove("lkg")
    if(record.has("lkg"))string(record,"lkg")
    return record
  }
}
