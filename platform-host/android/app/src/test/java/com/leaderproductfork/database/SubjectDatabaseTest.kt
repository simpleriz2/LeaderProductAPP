package com.leaderproduct.app.fork.database
import android.app.Application
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.nio.channels.FileChannel
import android.database.sqlite.SQLiteDatabase
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[24,35],application=Application::class)
class SubjectDatabaseTest{
 // Robolectric ShadowLinux cannot open directories on API35. The production Android fsync port is NOT replaced.
 private val jvmFiles=object:SubjectDataFiles{
  override fun syncDirectory(directory:File){FileChannel.open(directory.toPath(),StandardOpenOption.READ).use{it.force(true)}}
  override fun ensureDirectory(directory:File){if(directory.isDirectory)return;ensureDirectory(directory.parentFile!!);Files.createDirectory(directory.toPath());syncDirectory(directory.parentFile!!)}
  override fun copy(source:File,target:File){Files.copy(source.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING);FileChannel.open(target.toPath(),StandardOpenOption.WRITE).use{it.force(true)};syncDirectory(target.parentFile!!)}
 }

 private fun scope(company:String="alpha",user:String="alice",generation:String="gen-1")=JSONObject().put("company",company).put("user",user).put("generation",generation)
 private fun change(collection:String,id:String,payload:String,revision:Long?=null)=JSONObject().put("collection",collection).put("id",id).put("expectedRevision",revision?:JSONObject.NULL).put("payload",payload)
 private fun batch(schema:Int=1,target:Int?=null,vararg changes:JSONObject)=JSONObject().put("module","orders").put("expectedSchema",schema).put("changes",JSONArray(changes.toList())).apply{if(target!=null)put("targetSchema",target)}
 private fun run(engine:SubjectDatabase,operation:String,owner:JSONObject,input:Any=JSONObject.NULL)=engine.request(operation,owner.toString(),input.toString())
 private fun fixture(block:(SubjectDatabase,File)->Unit){val root=Files.createTempDirectory("lp2-android-sqlite-").toFile();try{val engine=SubjectDatabase(root,jvmFiles);run(engine,"fork",scope());run(engine,"write",scope(),batch(0,1));block(engine,root)}finally{root.deleteRecursively()}}
 @Test fun draftAndOutboxAreAtomicAndFailedRevisionRollsBackAllChanges()=fixture{engine,_->
  run(engine,"write",scope(),batch(1,null,change("drafts","draft","{\"text\":\"unsent\"}"),change("outbox","pending","{\"receipt\":\"matching\"}")))
  assertThrows(Exception::class.java){run(engine,"write",scope(),batch(1,null,change("drafts","draft","{\"text\":\"must rollback\"}",1),change("outbox","pending","{\"receipt\":\"conflict\"}",999)))}
  val incomplete=change("drafts","draft","{}",1);incomplete.remove("payload")
  assertThrows(Exception::class.java){run(engine,"write",scope(),batch(1,null,incomplete))}
  val read=JSONObject().put("module","orders").put("schema",1).put("collection","drafts").put("id","draft")
  val row=JSONObject(run(engine,"read",scope(),read));assertEquals(1,row.getInt("revision"));assertEquals("unsent",JSONObject(row.getString("payload")).getString("text"))
  assertThrows(Exception::class.java){run(engine,"query",scope(),JSONObject().put("sql","DELETE FROM records"))}
 }
 @Test fun tenantUserAndCopiedGenerationStayIsolated()=fixture{engine,_->
  run(engine,"write",scope(),batch(1,null,change("drafts","draft","{\"text\":\"preserved\"}")))
  val copy=scope(generation="gen-2");run(engine,"fork",copy,scope());run(engine,"write",copy,batch(1,2,change("drafts","draft","{\"text\":\"new copy\"}",1)))
  val read=JSONObject().put("module","orders").put("schema",1).put("collection","drafts").put("id","draft")
  assertEquals("preserved",JSONObject(JSONObject(run(engine,"read",scope(),read)).getString("payload")).getString("text"))
  assertThrows(Exception::class.java){run(engine,"read",copy,read)}
  for(other in listOf(scope(company="beta",user="bob"),scope(user="another-user"))){run(engine,"fork",other);run(engine,"write",other,batch(0,1));assertEquals("null",run(engine,"read",other,read));assertThrows(Exception::class.java){run(engine,"fork",scope(other.getString("company"),other.getString("user"),"stolen-copy"),scope())}}
 }
 @Test fun corruptAndUnknownPhysicalDatabasesArePreservedWithoutEmptyFallback()=fixture{engine,root->
  val bad=File(root,"alpha/alice/corrupt.sqlite");bad.writeText("corrupt original fixture")
  assertThrows(Exception::class.java){run(engine,"schema",scope(generation="corrupt"),JSONObject().put("module","orders"))};assertTrue(bad.exists());assertEquals("corrupt original fixture",bad.readText())
  run(engine,"fork",scope(generation="future"),scope());val future=File(root,"alpha/alice/future.sqlite")
  SQLiteDatabase.openDatabase(future.absolutePath,null,SQLiteDatabase.OPEN_READWRITE).use{it.version=999}
  assertThrows(Exception::class.java){run(engine,"schema",scope(generation="future"),JSONObject().put("module","orders"))};assertTrue(future.exists())
  assertThrows(Exception::class.java){run(engine,"schema",scope(generation="missing"),JSONObject().put("module","orders"))};assertFalse(File(root,"alpha/alice/missing.sqlite").exists())
 }
 @Test fun lostBootstrapPointerCannotCreateAnEmptyReplacement()=fixture{engine,root->
  run(engine,"write",scope(),batch(1,null,change("drafts","draft","{\"text\":\"retained\"}")))
  val missing=scope(generation="empty-reset")
  assertThrows(Exception::class.java){run(engine,"fork",missing)}
  assertFalse(File(root,"alpha/alice/empty-reset.sqlite").exists())
  val read=JSONObject().put("module","orders").put("schema",1).put("collection","drafts").put("id","draft")
  assertEquals("retained",JSONObject(JSONObject(run(engine,"read",scope(),read)).getString("payload")).getString("text"))
 }

}
