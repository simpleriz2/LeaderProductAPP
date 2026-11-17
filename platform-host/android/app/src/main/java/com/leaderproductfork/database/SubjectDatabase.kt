package com.leaderproduct.app.fork.database
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteDatabaseCorruptException
import com.leaderproduct.app.fork.storage.DurableFiles
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
/** Android SQLite engine shared by the bridge and native-SQLite integration tests. */
internal interface SubjectDataFiles{
  fun ensureDirectory(directory:File)
  fun syncDirectory(directory:File)
  fun copy(source:File,target:File)
}
internal object AndroidSubjectDataFiles:SubjectDataFiles{
  override fun ensureDirectory(directory:File)=DurableFiles.ensureDirectory(directory)
  override fun syncDirectory(directory:File)=DurableFiles.syncDirectory(directory)
  override fun copy(source:File,target:File)=DurableFiles.copy(source,target)
}
internal class SubjectDatabase(private val root:File,private val files:SubjectDataFiles=AndroidSubjectDataFiles){
  companion object{private val preserveCorruption=DatabaseErrorHandler{throw SQLiteDatabaseCorruptException("Subject database corrupt; file preserved for recovery")}}
  private data class Scope(val company:String,val user:String,val generation:String)
  private fun string(value:JSONObject,name:String)=value.get(name) as? String?:error("String required")
  private fun part(value:String):String{require(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,127}").matches(value));return value}
  private fun record(value:String):String{require(value.isNotEmpty()&&value.toByteArray(Charsets.UTF_8).size<=512&&value.none{it.code<32}&&Charsets.UTF_8.newEncoder().canEncode(value));return value}
  private fun number(value:Any?):Long{require(value is Number);val result=value.toDouble();require(result.isFinite()&&result>=0&&result<=9007199254740991.0&&result%1.0==0.0);return result.toLong()}
  private fun scope(value:JSONObject)=Scope(part(string(value,"company")),part(string(value,"user")),part(string(value,"generation")))
  private fun file(scope:Scope)=File(root,"${scope.company}/${scope.user}/${scope.generation}.sqlite")
  private fun open(scope:Scope):SQLiteDatabase{
    val path=file(scope);require(path.isFile&&path.length()>0){"Missing data generation"}
    val db=SQLiteDatabase.openDatabase(path.absolutePath,null,SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING,preserveCorruption)
    try{require(db.version==1){"Unknown physical database version"};db.execSQL("PRAGMA synchronous=FULL");return db}catch(error:Exception){db.close();throw error}
  }
  private fun<T> transaction(scope:Scope,block:(SQLiteDatabase)->T):T{
    val db=open(scope)
    try{db.beginTransactionNonExclusive();try{val result=block(db);db.setTransactionSuccessful();return result}finally{db.endTransaction()}}finally{db.close()}
  }
  private fun version(db:SQLiteDatabase,module:String):Long=db.rawQuery("SELECT version FROM module_schema WHERE module=?",arrayOf(part(module))).use{if(it.moveToFirst())it.getLong(0)else 0L}
  private fun schema(db:SQLiteDatabase,module:String,expected:Long){check(version(db,module)==expected){"Module schema mismatch"}}
  private fun row(db:SQLiteDatabase,module:String,collection:String,id:String):JSONObject?=db.rawQuery("SELECT id,revision,payload FROM records WHERE module=? AND collection=? AND id=?",arrayOf(module,collection,id)).use{if(!it.moveToFirst())null else JSONObject().put("id",it.getString(0)).put("revision",it.getLong(1)).put("payload",it.getString(2))}
  private fun fork(source:Scope?,target:Scope){
    require(source==null||(source.company==target.company&&source.user==target.user)){"Cross-account data copy"}
    val destination=file(target);files.ensureDirectory(destination.parentFile!!);check(destination.createNewFile()){ "Generation already exists" }
    if(source!=null){
      val db=open(source)
      try{db.rawQuery("PRAGMA quick_check",null).use{check(it.moveToFirst()&&it.getString(0)=="ok")};db.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)",null).use{check(it.moveToFirst()&&it.getInt(0)==0){"Source checkpoint busy"}}}finally{db.close()}
      files.copy(file(source),destination)
    }else{
      val db=SQLiteDatabase.openDatabase(destination.absolutePath,null,SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING,preserveCorruption)
      try{db.execSQL("PRAGMA synchronous=FULL");db.beginTransactionNonExclusive();try{
        db.execSQL("CREATE TABLE module_schema(module TEXT PRIMARY KEY,version INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE records(module TEXT NOT NULL,collection TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL,PRIMARY KEY(module,collection,id))")
        db.version=1;db.setTransactionSuccessful()
      }finally{db.endTransaction()}}finally{db.close()}
      files.syncDirectory(destination.parentFile!!)
    }
  }
  private fun write(db:SQLiteDatabase,input:JSONObject):JSONArray{
    val module=part(string(input,"module"));val expected=number(input.get("expectedSchema"));schema(db,module,expected)
    val target=if(input.has("targetSchema"))number(input.get("targetSchema"))else null
    require(target==null||target==expected+1);require(expected>0||target!=null)
    val changes=input.getJSONArray("changes");require(changes.length()<=512);val seen=HashSet<String>();val receipts=JSONArray();var bytes=0
    for(i in 0 until changes.length()){
      val change=changes.getJSONObject(i);require(change.has("expectedRevision")&&change.has("payload")){"Missing mutation fields"};val collection=part(string(change,"collection"));val id=record(string(change,"id"));require(seen.add(JSONArray().put(collection).put(id).toString())){"Duplicate record mutation"}
      val revision=if(change.isNull("expectedRevision"))null else number(change.get("expectedRevision")).also{require(it>0)}
      val previous=row(db,module,collection,id);check(previous?.getLong("revision")==revision){"Record revision conflict"}
      val receipt=JSONObject().put("collection",collection).put("id",id)
      if(change.isNull("payload")){
        require(revision!=null);db.execSQL("DELETE FROM records WHERE module=? AND collection=? AND id=?",arrayOf(module,collection,id));receipt.put("revision",JSONObject.NULL)
      }else{
        val payload=string(change,"payload");val length=payload.toByteArray(Charsets.UTF_8).size;require(length<=2*1024*1024);bytes+=length;require(bytes<=8*1024*1024)
        val json=JSONTokener(payload);json.nextValue();require(json.nextClean()==0.toChar()){"Invalid JSON payload"}
        val next=(revision?:0L)+1;require(next<=9007199254740991L)
        // UPDATE/INSERT works on every supported Android SQLite version (no modern UPSERT dependency).
        if(previous==null)db.execSQL("INSERT INTO records(module,collection,id,revision,payload) VALUES(?,?,?,?,?)",arrayOf(module,collection,id,next,payload))
        else db.execSQL("UPDATE records SET revision=?,payload=? WHERE module=? AND collection=? AND id=?",arrayOf(next,payload,module,collection,id))
        receipt.put("revision",next)
      };receipts.put(receipt)
    }
    if(target!=null){if(expected==0L)db.execSQL("INSERT INTO module_schema(module,version) VALUES(?,?)",arrayOf(module,target))else db.execSQL("UPDATE module_schema SET version=? WHERE module=?",arrayOf(target,module))}
    return receipts
  }
  private fun execute(operation:String,owner:Scope,input:Any):Any?{
    val body=input as? JSONObject
    return when(operation){
      "close"->null // Connections are scoped to each operation and always closed in finally.
      "fork"->{val source=if(input===JSONObject.NULL)null else scope(body?:error("Invalid source"));fork(source,owner);null}
      "schema"->transaction(owner){version(it,part(string(body!!,"module")))}
      "read"->transaction(owner){db->val module=part(string(body!!,"module"));schema(db,module,number(body.get("schema")));row(db,module,part(string(body,"collection")),record(string(body,"id")))}
      "list"->transaction(owner){db->
        val module=part(string(body!!,"module"));val collection=part(string(body,"collection"));schema(db,module,number(body.get("schema")));val limit=number(body.get("limit"));require(limit in 1..256)
        val after=if(body.has("after"))record(string(body,"after"))else null
        val sql=if(after==null)"SELECT id,revision,payload FROM records WHERE module=? AND collection=? ORDER BY id COLLATE BINARY LIMIT ?"else "SELECT id,revision,payload FROM records WHERE module=? AND collection=? AND id>? ORDER BY id COLLATE BINARY LIMIT ?"
        val args=if(after==null)arrayOf(module,collection,limit.toString())else arrayOf(module,collection,after,limit.toString());val result=JSONArray();var bytes=0
        db.rawQuery(sql,args).use{while(it.moveToNext()){val payload=it.getString(2);bytes+=payload.toByteArray(Charsets.UTF_8).size;require(bytes<=4*1024*1024){"Data page too large"};result.put(JSONObject().put("id",it.getString(0)).put("revision",it.getLong(1)).put("payload",payload))}};result
      }
      "write"->transaction(owner){write(it,body?:error("Invalid batch"))}
      "verify"->transaction(owner){db->db.rawQuery("PRAGMA quick_check",null).use{check(it.moveToFirst()&&it.getString(0)=="ok")};val schemas=body?:error("Invalid schemas");for(module in schemas.keys())schema(db,part(module),number(schemas.get(module)));null}
      else->error("Unknown database operation")
    }
  }

  fun request(operation:String,encodedScope:String,encodedInput:String):String{
    val owner=scope(JSONObject(encodedScope));val input=JSONTokener(encodedInput).nextValue();val output=execute(operation,owner,input)
    val result=when(output){null->"null";is JSONObject,is JSONArray->output.toString();is Number->output.toString();else->error("Invalid database result")}
    require(result.toByteArray(Charsets.UTF_8).size<=8*1024*1024){"Database response too large"};return result
  }
}
