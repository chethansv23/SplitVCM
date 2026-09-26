package expo.modules.notificationcapture

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationCaptureModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun startSettings(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  override fun definition() = ModuleDefinition {
    Name("NotificationCapture")

    Function("isPermissionGranted") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    Function("openNotificationAccessSettings") {
      startSettings(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    // Sideloaded apps on Android 13+ need "Allow restricted settings" from
    // App info before notification access can be granted.
    Function("openAppDetailsSettings") {
      startSettings(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.parse("package:${context.packageName}"))
      )
    }

    Function("isIgnoringBatteryOptimizations") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("openBatteryOptimizationSettings") {
      startSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    Function("requestRebind") {
      NotificationListenerService.requestRebind(
        ComponentName(context, CaptureListenerService::class.java)
      )
    }

    Function("configure") { enabled: Boolean, allowedPackages: List<String> ->
      CaptureStore(context).configure(enabled, allowedPackages)
    }

    AsyncFunction("drainQueue") {
      CaptureStore(context).drain()
    }

    Function("getBlockedPackages") {
      CaptureStore(context).blockedPackages()
    }

    Function("getDiagnostics") {
      CaptureStore(context).diagnostics()
    }

    Function("resetDiagnostics") {
      CaptureStore(context).resetDiagnostics()
    }
  }
}
