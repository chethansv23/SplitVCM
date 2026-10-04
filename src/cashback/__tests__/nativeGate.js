// Runs the Android listener's quick filter in tests, using the regexes read
// straight from CaptureListenerService.kt, so the native gate is tested
// exactly as it ships.
const fs = require("fs");
const path = require("path");

const KT = path.join(
  __dirname,
  "../../../modules/notification-capture/android/src/main/java/expo/modules/notificationcapture/CaptureListenerService.kt"
);

// Kotlin string literal → regex source: "\\d" in Kotlin is the regex \d.
const unescapeKotlin = (s) => s.replace(/\\\\/g, "\\").replace(/\\"/g, '"').replace(/\\\$/g, "$");

const readPattern = (source, name) => {
  const m = new RegExp(`private val ${name} = Regex\\(\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(source);
  if (!m) throw new Error(`Pattern ${name} not found in CaptureListenerService.kt`);
  return new RegExp(unescapeKotlin(m[1]), "i");
};

const source = fs.readFileSync(KT, "utf8");
const PATTERNS = {};
for (const name of ["AMOUNT", "KEYWORD", "CONTEXT", "HIDDEN"]) {
  try {
    PATTERNS[name] = readPattern(source, name);
  } catch {
    PATTERNS[name] = null;
  }
}

// Mirrors CaptureListenerService.looksLikeTransaction. If the Kotlin
// function's shape changes, update this too (a test checks the source).
const looksLikeTransaction = (text) =>
  PATTERNS.AMOUNT.test(text) && (PATTERNS.KEYWORD.test(text) || (PATTERNS.CONTEXT ? PATTERNS.CONTEXT.test(text) : false));

module.exports = { PATTERNS, looksLikeTransaction, source };
