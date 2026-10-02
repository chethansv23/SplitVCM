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

    val title = notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val messages = messagesOf(sbn, notification)
    val allowed = store.isAllowed(sbn.packageName)
    for (message in messages) {
      val looksLikeSpend = looksLikeTransaction("$title ${message.text}")
      if (!allowed) {
        if (looksLikeSpend) {
          // A spend alert from an app that isn't allowed: suggest adding it.
          store.recordBlocked(sbn.packageName)
          store.count("blocked")
        } else {
          store.count("otherApp")
        }
        continue
      }
      if (!looksLikeSpend) {
        store.count("notTransaction")
        store.recordSkipped(sbn.packageName, title, message.text)
        continue
      }
      if (store.enqueue(sbn.packageName, title, message.text, message.time, message.dedupeKey)) {
        store.count("queued")
      } else {
        store.count("repeat")
      }
    }
  }

  // One message inside a notification. Apps re-post a notification whenever
  // it changes (a new SMS in the conversation, marked read), so each message
  // has a stable key and older messages aren't queued again.
  private data class Message(val text: String, val time: Long, val dedupeKey: String)

  // A notification can bundle several messages: Google Messages lists a
  // conversation's SMS as MessagingStyle messages, and Gmail lists several
  // emails as inbox lines. Each is a separate alert; joining them would let a
  // loan offer borrow "spent" from another message.
  private fun messagesOf(sbn: StatusBarNotification, notification: Notification): List<Message> {
    val extras = notification.extras
    val pkg = sbn.packageName

    @Suppress("DEPRECATION")
    val styled = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
      ?.mapNotNull { it as? android.os.Bundle }
      ?.mapNotNull { b ->
        val text = b.getCharSequence("text")?.toString()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
        val time = b.getLong("time").takeIf { it > 0 } ?: sbn.postTime
        Message(text, time, "$pkg|msg|$time|${text.hashCode()}")
      }
      .orEmpty()
    if (styled.isNotEmpty()) return styled

    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
      ?.map { it.toString() }
      ?.filter { it.isNotBlank() }
      .orEmpty()
    if (lines.size > 1) {
      return lines.map { Message(it, sbn.postTime, "$pkg|line|${it.hashCode()}") }
    }

    val single = listOfNotNull(
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
      extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
      lines.firstOrNull(),
      notification.tickerText?.toString(),
    ).firstOrNull { it.isNotBlank() }.orEmpty()
    // The same notification re-posted keeps its key and timestamp; a new SMS
    // with identical text gets a new timestamp and is kept.
    return listOf(Message(single, sbn.postTime, "${sbn.key}|${notification.`when`}|${single.hashCode()}"))
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
