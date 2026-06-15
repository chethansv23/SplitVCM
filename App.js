import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as LocalAuthentication from "expo-local-authentication";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

const Tab = createBottomTabNavigator();
const GroupsStack = createStackNavigator();
const CashbackStack = createStackNavigator();

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
    </CashbackStack.Navigator>
  );
}

// Main App
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  useEffect(() => {
    const authenticate = async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isBiometricSupported =
        await LocalAuthentication.supportedAuthenticationTypesAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const authResult = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock with Fingerprint or PIN",
          fallbackLabel: "Enter PIN",
        });
        setIsAuthenticated(authResult.success);
      } else {
        // Prompt for PIN (stored in AsyncStorage)
        const storedPin = (await AsyncStorage.getItem("userPin")) || 2305;
        if (storedPin) {
          setIsPinModalVisible(true); // Show PIN modal if PIN is stored
        }
      }
      setIsLoading(false);
    };

    authenticate();
  }, []);

  const handlePinSubmit = async () => {
    const storedPin = await AsyncStorage.getItem("userPin");
    if (pin === storedPin) {
      setIsAuthenticated(true);
      setIsPinModalVisible(false); // Hide PIN modal
    } else {
      alert("Incorrect PIN, please try again.");
      setPin(""); // Reset PIN field
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading...</Text>
      </View>
    );
  }
  if (!isAuthenticated) {
    return (
      <View style={styles.error}>
        <Text>Authentication failed! Please restart the app.</Text>
      </View>
    );
  }
  return (
    <NavigationContainer>
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
      {/* PIN Modal */}
      <Modal
        visible={isPinModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPinModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Enter PIN</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              secureTextEntry={true}
              keyboardType="numeric"
              placeholder="Enter your PIN"
            />
            <TouchableOpacity style={styles.button} onPress={handlePinSubmit}>
              <Text style={styles.buttonText}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: "red" }]}
              onPress={() => setIsPinModalVisible(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  error: {
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
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    height: 40,
    borderColor: "#ccc",
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  button: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
});
