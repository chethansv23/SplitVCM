import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useEffect, useState } from "react";
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

const Stack = createStackNavigator();

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
      <Stack.Navigator>
        <Stack.Screen name="Groups" component={GroupsScreen} />
        <Stack.Screen name="Create Group" component={CreateGroupScreen} />
        <Stack.Screen name="Group Details" component={GroupDetailsScreen} />
      </Stack.Navigator>

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
