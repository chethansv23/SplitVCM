import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Alert, AppState, ScrollView, Share, Text, View } from "react-native";

import NotificationCapture from "../../modules/notification-capture";
import { Banner, Btn, Chips, Field, Section, Toggle, ui } from "../../components/cashback/ui";
import { exportBackup, parseBackup } from "../../src/cashback/backup";
import { explainCapture } from "../../src/cashback/captureDiagnostics";
import { ingestPastedAlert, processCapturedNotifications, syncCaptureConfig } from "../../src/cashback/capture";
import { deleteAllCapturedText } from "../../src/cashback/inbox";
import { readExpenseGroups, updateState, useCashbackState, writeExpenseGroups } from "../../src/cashback/store";

const SOURCES = [
  { value: "com.google.android.apps.messaging", label: "SMS" },
  { value: "com.google.android.gm", label: "Email" },
  { value: "com.bank.app", label: "Bank app" },
];

const summaryText = (s) =>
  `Added automatically: ${s.assigned}\nSent to review: ${s.review}\nDuplicates merged: ${s.duplicate}\nNot a transaction: ${s.ignored}`;

export default function CaptureSettings({ navigation }) {
  const state = useCashbackState();
  const available = NotificationCapture.isAvailable();
  const [status, setStatus] = useState({ granted: false, battery: true, blocked: [], diagnostics: null });
  const [newPackage, setNewPackage] = useState("");
  const [pasted, setPasted] = useState("");
  const [pastedSource, setPastedSource] = useState(SOURCES[0].value);
  const [includeText, setIncludeText] = useState(false);
  const [importJson, setImportJson] = useState("");

  const refresh = useCallback(() => {
    if (!available) return;
    setStatus({
      granted: NotificationCapture.isPermissionGranted(),
      battery: NotificationCapture.isIgnoringBatteryOptimizations(),
      blocked: NotificationCapture.getBlockedPackages(),
      diagnostics: NotificationCapture.getDiagnostics(),
    });
  }, [available]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // Returning from Android settings brings the app back to the foreground.
      const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
      return () => sub.remove();
    }, [refresh])
  );

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  const { settings } = state;

  const setSettings = async (patch) => {
    await updateState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    await syncCaptureConfig();
  };

  const enableCapture = (on) => {
    if (!on) return setSettings({ captureEnabled: false });
    Alert.alert(
      "Allow transaction capture?",
      "SplitVCM will read notifications from the apps in your allowed list (SMS, email, bank apps). " +
        "Only alerts that look like card transactions are kept, on this phone only. " +
        "Nothing is uploaded. You can turn this off here or in Android's notification-access settings at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "I agree",
          onPress: () => setSettings({ captureEnabled: true, consentAcceptedAt: new Date().toISOString() }),
        },
      ]
    );
  };

  const allowPackage = (pkg) => {
    const p = pkg.trim();
    if (!p || settings.allowedPackages.includes(p)) return;
    setSettings({ allowedPackages: [...settings.allowedPackages, p] });
    setNewPackage("");
  };

  const processNow = async () => {
    const r = await processCapturedNotifications();
    refresh();
    const head = available
      ? `Read from the phone's capture queue: ${r.fromQueue}`
      : "Not running the development build, so nothing can be captured. See Capture status below.";
    Alert.alert("Captured alerts processed", `${head}\n\n${summaryText(r)}\n\nWaiting for review: ${r.pending}`);
  };

  const testPaste = async () => {
    if (!pasted.trim()) return Alert.alert("Paste an alert first");
    const s = await ingestPastedAlert(pasted.trim(), pastedSource);
    setPasted("");
    Alert.alert("Result", summaryText(s), [
      { text: "OK" },
      s.review ? { text: "Open review", onPress: () => navigation.navigate("ReviewInbox") } : null,
    ].filter(Boolean));
  };

  const exportData = async () => {
    const expenseGroups = await readExpenseGroups();
    const json = exportBackup({ ...state, expenseGroups }, { includeCapturedText: includeText });
    await Share.share({ title: "SplitVCM backup", message: json });
  };

  const importData = () => {
    let data;
    try {
      data = parseBackup(importJson);
    } catch (e) {
      return Alert.alert("Import failed", e.message);
    }
    Alert.alert(
      "Replace all data?",
      `This replaces your cards, ${data.groups.length} cashback group(s), and ${data.expenseGroups.length} expense group(s) with the backup.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: async () => {
            await writeExpenseGroups(data.expenseGroups);
            await updateState((s) => ({
              groups: data.groups,
              templates: data.templates,
              candidates: data.candidates,
              settings: { ...s.settings, ...data.settings },
            }));
            await syncCaptureConfig();
            setImportJson("");
            Alert.alert("Imported");
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
      <Section title="Android transaction capture">
        {!available ? (
          <Banner kind="warning">
            Capture needs the SplitVCM Android development build (it cannot run in Expo Go, iOS, or web).
            You can still test the parser with "Paste an alert" below.
          </Banner>
        ) : null}
        <Toggle
          label="Capture transaction alerts"
          hint={settings.consentAcceptedAt ? `Consent given ${settings.consentAcceptedAt.slice(0, 10)}` : "Requires your consent"}
          value={settings.captureEnabled}
          onValueChange={enableCapture}
        />
        {available && settings.captureEnabled ? (
          <View>
            <Text style={ui.strong}>Setup steps</Text>
            <Text style={ui.small}>
              1. Sideloaded APK on Android 13+: open App info → ⋮ menu → "Allow restricted settings" first.
            </Text>
            <Btn small kind="secondary" title="Open App info" onPress={NotificationCapture.openAppDetailsSettings} style={{ alignSelf: "flex-start", marginVertical: 4 }} />
            <Text style={ui.small}>
              2. Notification access: {status.granted ? "✅ granted" : "❌ not granted — enable SplitVCM"}
            </Text>
            <Btn small kind="secondary" title="Open notification access" onPress={NotificationCapture.openNotificationAccessSettings} style={{ alignSelf: "flex-start", marginVertical: 4 }} />
            <Text style={ui.small}>
              3. Battery optimisation: {status.battery ? "✅ unrestricted" : "⚠️ restricted — some phones stop the listener; set SplitVCM to Unrestricted/Don't optimise"}
            </Text>
            <Btn small kind="secondary" title="Open battery settings" onPress={NotificationCapture.openBatteryOptimizationSettings} style={{ alignSelf: "flex-start", marginVertical: 4 }} />
            {status.granted ? (
              <Btn small kind="secondary" title="Reconnect listener" onPress={NotificationCapture.requestRebind} style={{ alignSelf: "flex-start", marginVertical: 4 }} />
            ) : null}
          </View>
        ) : null}
        <Btn title="Process captured alerts now" onPress={processNow} />
      </Section>

      <Section
        title="Capture status"
        right={<Btn small kind="secondary" title="Refresh" onPress={refresh} />}
      >
        {(() => {
          const r = explainCapture({ available, granted: status.granted, settings, diagnostics: status.diagnostics });
          return (
            <>
              {r.steps.map((step) => (
                <Text key={step.label} style={{ marginVertical: 2 }}>
                  {step.ok ? "✅" : "❌"} {step.label}
                </Text>
              ))}
              <Banner kind={r.steps.some((s) => !s.ok && s.fix) ? "warning" : "info"}>{r.verdict}</Banner>
            </>
          );
        })()}
        {available ? (
          <Btn
            small
            kind="secondary"
            title="Reset counters"
            style={{ alignSelf: "flex-start" }}
            onPress={() => {
              NotificationCapture.resetDiagnostics();
              refresh();
            }}
          />
        ) : null}
      </Section>

      <Section title="Allowed apps">
        <Text style={ui.small}>Only notifications from these app packages are read.</Text>
        {settings.allowedPackages.map((p) => (
          <View key={p} style={[ui.between, { paddingVertical: 4 }]}>
            <Text style={{ flex: 1 }}>{p}</Text>
            <Btn small kind="danger" title="Remove" onPress={() => setSettings({ allowedPackages: settings.allowedPackages.filter((x) => x !== p) })} />
          </View>
        ))}
        {status.blocked.filter((p) => !settings.allowedPackages.includes(p)).length > 0 && (
          <>
            <Text style={[ui.strong, { marginTop: 8 }]}>Transaction-like alerts seen from (not allowed):</Text>
            {status.blocked
              .filter((p) => !settings.allowedPackages.includes(p))
              .map((p) => (
                <View key={p} style={[ui.between, { paddingVertical: 4 }]}>
                  <Text style={{ flex: 1 }}>{p}</Text>
                  <Btn small title="Allow" onPress={() => allowPackage(p)} />
                </View>
              ))}
          </>
        )}
        <Field value={newPackage} onChangeText={setNewPackage} placeholder="com.example.bank" autoCapitalize="none" style={{ marginTop: 8 }} />
        <Btn small kind="secondary" title="Add package" onPress={() => allowPackage(newPackage)} style={{ alignSelf: "flex-start" }} />
      </Section>

      <Section title="Rules">
        <Toggle
          label="Include cash withdrawals"
          value={settings.includeCashWithdrawals}
          onValueChange={(v) => setSettings({ includeCashWithdrawals: v })}
        />
        <Toggle
          label="Include bank-account debits"
          hint="Off: only card spends are captured; savings-account UPI/debit alerts are dropped"
          value={settings.includeBankAccountDebits}
          onValueChange={(v) => setSettings({ includeBankAccountDebits: v })}
        />
        <Field
          label="Duplicate window (minutes)"
          value={String(settings.duplicateWindowMinutes)}
          onChangeText={(v) => setSettings({ duplicateWindowMinutes: Math.max(1, parseInt(v, 10) || 1) })}
          keyboardType="number-pad"
        />
      </Section>

      <Section title="Paste an alert to test">
        <Field value={pasted} onChangeText={setPasted} multiline placeholder="Paste an SMS or notification text" style={{ minHeight: 80 }} />
        <Chips value={pastedSource} onChange={setPastedSource} options={SOURCES} />
        <Btn title="Run through capture" onPress={testPaste} />
      </Section>

      <Section title="Privacy">
        <Field
          label="Delete captured text this many days after review"
          value={String(settings.rawTextRetentionDays)}
          onChangeText={(v) => setSettings({ rawTextRetentionDays: Math.max(1, parseInt(v, 10) || 1) })}
          keyboardType="number-pad"
        />
        <Btn
          kind="danger"
          title="Delete all captured text now"
          onPress={() =>
            Alert.alert("Delete captured text", "Remove the original text of every captured alert? Transactions are kept.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => updateState(deleteAllCapturedText) },
            ])
          }
        />
        <Text style={[ui.small, { marginTop: 6 }]}>
          Data stays on this phone. Android cloud backup is disabled for SplitVCM, so use Export below to move data to a new phone.
        </Text>
      </Section>

      <Section title="Backup">
        <Toggle label="Include captured alert text" value={includeText} onValueChange={setIncludeText} />
        <Btn title="Export all data (JSON)" onPress={exportData} />
        <Field label="Import: paste backup JSON" value={importJson} onChangeText={setImportJson} multiline style={{ minHeight: 80 }} />
        <Btn kind="secondary" title="Import" onPress={importData} />
      </Section>
    </ScrollView>
  );
}
