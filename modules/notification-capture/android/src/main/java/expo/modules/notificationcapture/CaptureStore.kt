package expo.modules.notificationcapture

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

// Native-side queue, kept in its own SharedPreferences file so the listener
// service never writes to the app's AsyncStorage database. JS drains it.
class CaptureStore(context: Context) {
  private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isEnabled(): Boolean = prefs.getBoolean(KEY_ENABLED, false)

  fun isAllowed(packageName: String): Boolean =
    prefs.getStringSet(KEY_ALLOWED, emptySet())?.contains(packageName) == true

  fun configure(enabled: Boolean, allowed: List<String>) {
    prefs.edit()
      .putBoolean(KEY_ENABLED, enabled)
      .putStringSet(KEY_ALLOWED, allowed.toSet())
      .apply()
    if (!enabled) synchronized(LOCK) { prefs.edit().remove(KEY_QUEUE).apply() }
  }

  // Returns false when this exact notification was already queued.
  fun enqueue(sourceApp: String, title: String, text: String, postedAt: Long, dedupeKey: String): Boolean {
    synchronized(LOCK) {
      val recent = JSONArray(prefs.getString(KEY_RECENT, "[]"))
      for (i in 0 until recent.length()) if (recent.getString(i) == dedupeKey) return false
      recent.put(dedupeKey)
      while (recent.length() > MAX_RECENT) recent.remove(0)

      val queue = JSONArray(prefs.getString(KEY_QUEUE, "[]"))
      queue.put(
        JSONObject()
          .put("id", UUID.randomUUID().toString())
          .put("sourceApp", sourceApp)
          .put("title", title)
          .put("text", text)
          .put("postedAt", postedAt)
      )
      while (queue.length() > MAX_QUEUE) queue.remove(0)
      prefs.edit().putString(KEY_QUEUE, queue.toString()).putString(KEY_RECENT, recent.toString()).apply()
      return true
    }
  }

  fun drain(): String = synchronized(LOCK) {
    val queue = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
    prefs.edit().remove(KEY_QUEUE).commit()
    queue
  }

  // Counters shown on the Capture & Privacy screen, to see where an alert
  // stopped: never seen, not transaction-like, app not allowed, or queued.
  fun count(event: String) {
    prefs.edit()
      .putInt("count_$event", prefs.getInt("count_$event", 0) + 1)
      .putLong("last_$event", System.currentTimeMillis())
      .apply()
  }

  fun diagnostics(): Map<String, Any?> {
    val out = mutableMapOf<String, Any?>()
    for (event in EVENTS) {
      out["${event}Count"] = prefs.getInt("count_$event", 0)
      val last = prefs.getLong("last_$event", 0L)
      out["${event}At"] = if (last == 0L) null else last.toDouble()
    }
    out["enabled"] = isEnabled()
    out["queueLength"] = JSONArray(prefs.getString(KEY_QUEUE, "[]")).length()
    out["allowedPackages"] = prefs.getStringSet(KEY_ALLOWED, emptySet())?.sorted() ?: emptyList<String>()
    return out
  }

  fun resetDiagnostics() {
    val edit = prefs.edit()
    for (event in EVENTS) edit.remove("count_$event").remove("last_$event")
    edit.remove(KEY_RECENT).remove(KEY_SKIPPED).apply()
  }

  // Keeps the last few texts from allowed apps that were not treated as a
  // transaction, so Capture status can show what Android actually handed
  // over. Runs of 5+ digits are masked so OTPs and references aren't kept.
  fun recordSkipped(sourceApp: String, title: String, text: String) {
    synchronized(LOCK) {
      val list = JSONArray(prefs.getString(KEY_SKIPPED, "[]"))
      val masked = text.replace(Regex("\\d{5,}"), "•••••")
      list.put(
        JSONObject()
          .put("sourceApp", sourceApp)
          .put("title", title.take(40))
          .put("text", masked.take(160))
          .put("length", text.length)
          .put("at", System.currentTimeMillis().toDouble())
      )
      while (list.length() > MAX_SKIPPED) list.remove(0)
      prefs.edit().putString(KEY_SKIPPED, list.toString()).apply()
    }
  }

  fun recentSkipped(): String = prefs.getString(KEY_SKIPPED, "[]") ?: "[]"

  fun recordBlocked(packageName: String) {
    val blocked = prefs.getStringSet(KEY_BLOCKED, emptySet())?.toMutableSet() ?: mutableSetOf()
    if (blocked.add(packageName)) prefs.edit().putStringSet(KEY_BLOCKED, blocked).apply()
  }

  fun blockedPackages(): List<String> =
    prefs.getStringSet(KEY_BLOCKED, emptySet())?.sorted() ?: emptyList()

  companion object {
    private const val PREFS = "splitvcm_capture"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_ALLOWED = "allowedPackages"
    private const val KEY_QUEUE = "queue"
    private const val KEY_RECENT = "recentKeys"
    private const val KEY_BLOCKED = "blockedPackages"
    private const val KEY_SKIPPED = "recentSkipped"
    private const val MAX_SKIPPED = 3
    // Kept until the app is opened; generous because the filter keeps extra
    // alerts rather than risk missing a real spend.
    private const val MAX_QUEUE = 2000
    private const val MAX_RECENT = 100
    private val LOCK = Any()
    val EVENTS = listOf("connected", "disconnected", "posted", "disabled", "otherApp", "hidden", "notTransaction", "blocked", "queued", "repeat")
  }
}
