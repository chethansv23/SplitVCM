import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import CreateGroupScreen from "./screens/CreateGroupScreen";
import GroupDetailsScreen from "./screens/GroupDetailsScreen";
import GroupsScreen from "./screens/GroupsScreen";

import CashbackGroupDetails from "./screens/CashbackGroupDetails";
import CashbackGroupsScreen from "./screens/CashbackScreen";
import CreateCashbackGroup from "./screens/CreateCashbackGroup";
import CaptureSettings from "./screens/cashback/CaptureSettings";
import CardTemplatesScreen from "./screens/cashback/CardTemplatesScreen";
import CategoryEditor from "./screens/cashback/CategoryEditor";
import ReviewInbox from "./screens/cashback/ReviewInbox";
import TemplateEditor from "./screens/cashback/TemplateEditor";
import TrackCardScreen from "./screens/cashback/TrackCardScreen";
import TransactionEditor from "./screens/cashback/TransactionEditor";

import { hasPin, setPin, validatePinSetup, verifyPin } from "./src/auth/pin";
import { processCapturedNotifications, syncCaptureConfig } from "./src/cashback/capture";

const Tab = createBottomTabNavigator();
const GroupsStack = createNativeStackNavigator();
const CashbackStack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000;

// Groups stack
function GroupsStackScreen() {
  return (
    <GroupsStack.Navigator>
      <GroupsStack.Screen
        name="GroupsMain"
        component={GroupsScreen}
        options={{ title: "My Groups" }}
      />
      <GroupsStack.Screen name="Create Group" component={CreateGroupScreen} />
      <GroupsStack.Screen name="Group Details" component={GroupDetailsScreen} />
    </GroupsStack.Navigator>
  );
}

// Cashback stack
function CashbackStackScreen() {
  return (
    <CashbackStack.Navigator>
      <CashbackStack.Screen
        name="CashbackMain"
        component={CashbackGroupsScreen}
        options={{ title: "My Cashback" }}
      />
      <CashbackStack.Screen
        name="CreateCashbackGroup"
        component={CreateCashbackGroup}
        options={{ title: "Create Cashback Group" }}
      />
      <CashbackStack.Screen
        name="CashbackGroupDetails"
        component={CashbackGroupDetails}
        options={{ title: "Cashback Group Details" }}
      />
      <CashbackStack.Screen name="TransactionEditor" component={TransactionEditor} options={{ title: "Edit Transaction" }} />
      <CashbackStack.Screen name="CategoryEditor" component={CategoryEditor} options={{ title: "Category" }} />
      <CashbackStack.Screen name="CardTemplates" component={CardTemplatesScreen} options={{ title: "Cards & Cycles" }} />
      <CashbackStack.Screen name="TemplateEditor" component={TemplateEditor} options={{ title: "Card" }} />
      <CashbackStack.Screen name="ReviewInbox" component={ReviewInbox} options={{ title: "Needs Review" }} />
      <CashbackStack.Screen name="TrackCard" component={TrackCardScreen} options={{ title: "Track Card" }} />
      <CashbackStack.Screen name="CaptureSettings" component={CaptureSettings} options={{ title: "Capture & Privacy" }} />
    </CashbackStack.Navigator>
  );
}

// Main App
export default function App() {
  // loading → setup (first run, choose a PIN) | locked → unlocked
  const [phase, setPhase] = useState("loading");
  const [pin, setPinInput] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const attempts = useRef(0);
  const lockedUntil = useRef(0);

  const tryBiometrics = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock SplitVCM",
      fallbackLabel: "Enter PIN",
    });
    if (result.success) setPhase("unlocked");
  }, []);

  useEffect(() => {
    const start = async () => {
      if (!(await hasPin())) return setPhase("setup");
      const biometric =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      setCanUseBiometrics(biometric);
      setPhase("locked");
      if (biometric) await tryBiometrics();
    };
    start();
  }, [tryBiometrics]);

  // After unlocking, and whenever the app returns to the foreground: pull
  // captured alerts from the native queue, auto-assign clear ones, and ask
  // about the rest. The prompt never blocks the app.
  // The prompt shows once when the app opens, then again only when new
  // alerts arrive that need review (not on every return from settings).
  const syncCaptured = useCallback(async (onOpen) => {
    try {
      await syncCaptureConfig();
      const { pending, review } = await processCapturedNotifications();
      if (pending > 0 && (onOpen || review > 0)) setReviewCount(pending);
    } catch (e) {
      console.warn("Capture sync failed", e);
    }
  }, []);

  useEffect(() => {
    if (phase !== "unlocked") return;
    syncCaptured(true);
    const sub = AppState.addEventListener("change", (s) => s === "active" && syncCaptured(false));
    return () => sub.remove();
  }, [phase, syncCaptured]);

  const handleSetup = async () => {
    const problem = validatePinSetup(pin, confirmPin);
    if (problem) return setError(problem);
    await setPin(pin);
    setPinInput("");
    setConfirmPin("");
    setError("");
    setPhase("unlocked");
  };

  const handleUnlock = async () => {
    if (Date.now() < lockedUntil.current) {
      return setError("Too many attempts. Try again in a few seconds.");
    }
    if (await verifyPin(pin)) {
      attempts.current = 0;
      setPinInput("");
      setError("");
      return setPhase("unlocked");
    }
    attempts.current += 1;
    if (attempts.current >= MAX_ATTEMPTS) {
      attempts.current = 0;
      lockedUntil.current = Date.now() + LOCKOUT_MS;
      setError("Too many attempts. Locked for 30 seconds.");
    } else {
      setError("Incorrect PIN, please try again.");
    }
    setPinInput("");
  };

  const openReview = () => {
    setReviewCount(0);
    if (navigationRef.isReady()) {
      navigationRef.navigate("Cashback", { screen: "ReviewInbox" });
    }
  };

  if (phase === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading...</Text>
      </View>
    );
  }

  if (phase === "setup" || phase === "locked") {
    const setup = phase === "setup";
    return (
      <View style={styles.modalBackground}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{setup ? "Choose a PIN" : "Enter PIN"}</Text>
          {setup && (
            <Text style={styles.hint}>4–6 digits. Used when fingerprint unlock is unavailable.</Text>
          )}
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPinInput}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            placeholder={setup ? "New PIN" : "Enter your PIN"}
            placeholderTextColor="#888"
          />
          {setup && (
            <TextInput
              style={styles.input}
              value={confirmPin}
              onChangeText={setConfirmPin}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              placeholder="Confirm PIN"
              placeholderTextColor="#888"
            />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={setup ? handleSetup : handleUnlock}>
            <Text style={styles.buttonText}>{setup ? "Save PIN" : "Unlock"}</Text>
          </TouchableOpacity>
          {!setup && canUseBiometrics && (
            <TouchableOpacity style={[styles.button, styles.secondary]} onPress={tryBiometrics}>
              <Text style={[styles.buttonText, { color: "#333" }]}>Use fingerprint</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "Groups") iconName = "people";
            else if (route.name === "Cashback") iconName = "cash";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen
          name="Groups"
          component={GroupsStackScreen}
          options={{ headerShown: false }}
        />
        <Tab.Screen
          name="Cashback"
          component={CashbackStackScreen}
          options={{ headerShown: false }}
        />
      </Tab.Navigator>

      {/* Needs review prompt: shown only when some alerts could not be assigned automatically. */}
      <Modal
        visible={reviewCount > 0}
        animationType="fade"
        transparent
        onRequestClose={() => setReviewCount(0)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Needs review</Text>
            <Text style={styles.hint}>
              {reviewCount} captured transaction{reviewCount === 1 ? "" : "s"} could not be
              assigned automatically.
            </Text>
            <TouchableOpacity style={styles.button} onPress={openReview}>
              <Text style={styles.buttonText}>Review now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setReviewCount(0)}>
              <Text style={[styles.buttonText, { color: "#333" }]}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    width: 300,
  },
  modalTitle: {
    fontSize: 18,
    marginBottom: 12,
    textAlign: "center",
  },
  hint: {
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  error: {
    color: "#dc3545",
    marginBottom: 10,
    textAlign: "center",
  },
  input: {
    height: 40,
    borderColor: "#ccc",
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 10,
    color: "#000",
  },
  button: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    alignItems: "center",
  },
  secondary: {
    backgroundColor: "#e9ecef",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
});
