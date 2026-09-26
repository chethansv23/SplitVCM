package expo.modules.notificationcapture

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

// Receives every posted notification once the user grants notification
// access. Only allowlisted apps whose text looks like a transaction alert are
// queued; parsing and assignment happen in JS.
class CaptureListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    super.onListenerConnected()
    CaptureStore(applicationContext).count("connected")
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val store = CaptureStore(applicationContext)
    if (sbn.packageName == packageName) return
    val notification = sbn.notification ?: return
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    store.count("posted")
    if (!store.isEnabled()) {
      store.count("disabled")
      return
    }

    val extras = notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
    if (!looksLikeTransaction("$title $text")) {
      store.count("notTransaction")
      return
    }

    if (!store.isAllowed(sbn.packageName)) {
      store.recordBlocked(sbn.packageName)
      store.count("blocked")
      return
    }
    // Apps re-post the same notification when it updates (read, grouped);
    // the notification's key and timestamp stay the same, so skip those.
    // A new SMS with identical text has a new timestamp and is kept.
    val dedupeKey = "${sbn.key}|${notification.`when`}|${(title + text).hashCode()}"
    if (store.enqueue(sbn.packageName, title, text, sbn.postTime, dedupeKey)) {
      store.count("queued")
    } else {
      store.count("repeat")
    }
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    CaptureStore(applicationContext).count("disconnected")
    requestRebind(ComponentName(this, CaptureListenerService::class.java))
  }

  companion object {
    private val AMOUNT = Regex("(rs\\.?|inr|₹)\\s*[\\d,]+", RegexOption.IGNORE_CASE)
    private val KEYWORD = Regex(
      "\\b(spent|debited|charged|paid|purchase|txn|transaction|used|credited|refund|reversal|sent|withdrawn)\\b",
      RegexOption.IGNORE_CASE
    )

    fun looksLikeTransaction(text: String): Boolean =
      AMOUNT.containsMatchIn(text) && KEYWORD.containsMatchIn(text)
  }
}
