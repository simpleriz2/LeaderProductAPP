package com.leaderproduct.app.fork.database
import com.leaderproduct.app.fork.platform.ByteBudget
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
class ByteBudgetTest{
 @Test fun oversizeAndBusyRequestsDoNotCorruptTheRemainingBudget(){val budget=ByteBudget(10);assertFalse(budget.acquire(11));assertTrue(budget.acquire(7));assertFalse(budget.acquire(4));budget.release(7);assertTrue(budget.acquire(10));budget.release(10);assertThrows(IllegalArgumentException::class.java){budget.release(1)}}
 @Test fun concurrentReservationsNeverExceedTheBound(){val budget=ByteBudget(3);val active=AtomicInteger(0);val peak=AtomicInteger(0);val pool=Executors.newFixedThreadPool(4)
  val tasks=(1..4).map{pool.submit{repeat(500){if(budget.acquire(1)){val count=active.incrementAndGet();peak.updateAndGet{old->maxOf(old,count)};Thread.yield();active.decrementAndGet();budget.release(1)}}}}
  tasks.forEach{it.get(5,TimeUnit.SECONDS)};pool.shutdown();assertTrue(peak.get()<=3);assertEquals(0,active.get());assertTrue(budget.acquire(3));budget.release(3)
 }
}
