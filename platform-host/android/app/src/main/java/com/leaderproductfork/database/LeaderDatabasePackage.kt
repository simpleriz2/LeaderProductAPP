package com.leaderproduct.app.fork.database
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
class LeaderDatabasePackage:ReactPackage{
  override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(LeaderDatabaseModule(context))
  override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
