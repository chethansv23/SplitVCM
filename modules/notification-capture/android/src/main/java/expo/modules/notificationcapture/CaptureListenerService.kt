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
      if (message.hidden) {
        // Android replaced the text (it treats the notification as containing
        // a code), so there is nothing to read.
        store.count("hidden")
        store.recordSkipped(sbn.packageName, title, message.text)
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
  // has a stable key and older messages aren't queued again. `hidden` means
  // Android replaced all of its text with a placeholder.
  private data class Message(val text: String, val time: Long, val dedupeKey: String, val hidden: Boolean = false)

  private fun isHidden(text: String) = HIDDEN.containsMatchIn(text)

  // A notification can bundle several messages: Google Messages lists a
  // conversation's SMS as MessagingStyle messages, and Gmail lists several
  // emails as inbox lines. Several visible messages are separate alerts;
  // joining them would let a loan offer borrow "spent" from another message.
  //
  // A single message is read from every text field and the fields are joined.
  // Android can hide the text in some fields ("Sensitive notification content
  // hidden") while another field still has it, so no one field is trusted.
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
    val visibleStyled = styled.filterNot { isHidden(it.text) }
    if (visibleStyled.size > 1) return visibleStyled

    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
      ?.map { it.toString() }
      ?.filter { it.isNotBlank() && !isHidden(it) }
      .orEmpty()
    if (lines.size > 1) {
      return lines.map { Message(it, sbn.postTime, "$pkg|line|${it.hashCode()}") }
    }

    val parts = linkedSetOf<String>()
    listOfNotNull(
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
      extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
      lines.firstOrNull(),
      visibleStyled.firstOrNull()?.text,
      notification.tickerText?.toString(),
    ).filter { it.isNotBlank() && !isHidden(it) }.forEach { parts.add(it) }
    val text = parts.joinToString("\n")

    if (text.isEmpty()) {
      // Every field was hidden (or empty). Report it instead of dropping it silently.
      val placeholder = listOfNotNull(
        extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
        styled.firstOrNull()?.text,
      ).firstOrNull { it.isNotBlank() }.orEmpty()
      return listOf(Message(placeholder, sbn.postTime, "${sbn.key}|${notification.`when`}|hidden", hidden = isHidden(placeholder)))
    }

    // One SMS keeps the same key across re-posts; otherwise the notification's
    // own key and timestamp identify it (a new SMS gets a new timestamp).
    val single = visibleStyled.singleOrNull()
    return if (single != null) {
      listOf(Message(text, single.time, "$pkg|msg|${single.time}|${single.text.hashCode()}"))
    } else {
      listOf(Message(text, sbn.postTime, "${sbn.key}|${notification.`when`}|${text.hashCode()}"))
    }
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    CaptureStore(applicationContext).count("disconnected")
    requestRebind(ComponentName(this, CaptureListenerService::class.java))
  }

  companion object {
    // This filter decides what reaches the app, so it errs on the side of
    // keeping: a missed real spend is worse than an extra alert to review.
    // An amount in any common currency…
    private val AMOUNT = Regex("(rs\\.?|inr|₹|usd|eur|gbp|aed|sgd|€|£)\\s*[\\d,]+", RegexOption.IGNORE_CASE)
    // …plus a word banks use for a spend…
    private val KEYWORD = Regex(
      "\\b(spent|spend|debited|debit|deducted|charged|paid|payment|purchase|txn|trxn|transaction|used|using|swiped|billed|made|processed|successful|credited|refund|reversal|reversed|sent|withdrawn)\\b",
      RegexOption.IGNORE_CASE
    )
    // …or a mention of a card, account or UPI.
    private val CONTEXT = Regex("(card\\b|\\bcc\\b|\\ba/c\\b|\\bacct\\b|\\baccount\\b|\\bupi\\b)", RegexOption.IGNORE_CASE)

    // Placeholders Android shows instead of hidden notification text.
    private val HIDDEN = Regex("(sensitive notification content hidden|notification content hidden|contents? hidden)", RegexOption.IGNORE_CASE)

    fun looksLikeTransaction(text: String): Boolean =
      AMOUNT.containsMatchIn(text) && (KEYWORD.containsMatchIn(text) || CONTEXT.containsMatchIn(text))
  }
}
