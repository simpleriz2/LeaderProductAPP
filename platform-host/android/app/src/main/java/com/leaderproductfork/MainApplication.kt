package com.leaderproduct.app.fork

import android.app.Application
import com.leaderproduct.app.fork.database.LeaderDatabasePackage
import com.leaderproduct.app.fork.platform.LeaderHostPackage
import com.leaderproduct.app.fork.release.LeaderReleasePackage
import com.leaderproduct.app.fork.network.LeaderHttpPackage
import com.leaderproduct.app.fork.storage.LeaderCredentialsPackage
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(LeaderCredentialsPackage())
          add(LeaderHttpPackage())
          add(LeaderReleasePackage())
          add(LeaderHostPackage())
          add(LeaderDatabasePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
