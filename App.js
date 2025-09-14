import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import React from "react";

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
    </NavigationContainer>
  );
}
