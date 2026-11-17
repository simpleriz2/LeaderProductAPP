package com.leaderproduct.app.fork.database
import com.leaderproduct.app.fork.platform.ByteBudget

import com.facebook.react.bridge.*
import java.io.File
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Fixed subject-data operations only. This bridge never accepts arbitrary SQL. */
class LeaderDatabaseModule(context: ReactApplicationContext):ReactContextBaseJavaModule(context){
  companion object {
    // Serial across React-context reloads in this app process; no separate-process worker claim.
    private val executor=ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(32))
    private val budget=ByteBudget(16L*1024*1024)
    private const val MAX_INPUT=16*1024*1024
  }
  private val engine=SubjectDatabase(File(context.filesDir,"lp2-domain-data"))
  @Volatile private var accepting=true
  override fun getName()="LeaderDatabase"
  @ReactMethod fun request(operation:String,encodedScope:String,encodedInput:String,promise:Promise){
    var reserved=0L;var acquired=false
    try{
      check(accepting);require(encodedScope.length<=1024&&encodedInput.length<=MAX_INPUT)
      reserved=encodedInput.toByteArray(Charsets.UTF_8).size.toLong();require(reserved<=MAX_INPUT)
      check(budget.acquire(reserved)){"Database byte budget busy"};acquired=true
      val weight=reserved
      executor.execute{try{
        check(accepting);val result=engine.request(operation,encodedScope,encodedInput)
        if(reactApplicationContext.hasActiveReactInstance())promise.resolve(result)
      }catch(error:Exception){if(reactApplicationContext.hasActiveReactInstance())promise.reject("DATA_OPERATION_FAILED","Private database operation failed",error)}finally{budget.release(weight)}}
    }catch(error:Exception){if(acquired)budget.release(reserved);if(reactApplicationContext.hasActiveReactInstance())promise.reject("DATA_OPERATION_REJECTED","Private database unavailable/busy",error)}
  }
  override fun invalidate(){accepting=false;super.invalidate()}
}
