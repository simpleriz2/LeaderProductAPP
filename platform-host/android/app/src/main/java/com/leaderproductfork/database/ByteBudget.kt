package com.leaderproduct.app.fork.database
import java.util.concurrent.atomic.AtomicLong
/** A byte bound supplements the task-count bound; large queued bridge strings cannot accumulate unchecked. */
class ByteBudget(private val maximum:Long){
  private val held=AtomicLong(0)
  fun acquire(bytes:Long):Boolean{if(bytes<0||bytes>maximum)return false;while(true){val previous=held.get();if(previous+bytes>maximum)return false;if(held.compareAndSet(previous,previous+bytes))return true}}
  fun release(bytes:Long){require(bytes>=0);while(true){val previous=held.get();require(previous>=bytes);if(held.compareAndSet(previous,previous-bytes))return}}
}
