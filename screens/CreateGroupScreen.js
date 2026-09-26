import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function CreateGroupScreen({ navigation }) {
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState([]);
  const [newMember, setNewMember] = useState("");

  const handleAddMember = () => {
    const name = newMember.trim();
    if (!name) return;
    if (members.some((m) => m.toLowerCase() === name.toLowerCase())) {
      Alert.alert("Duplicate member", `${name} is already in this group.`);
      return;
    }
    setMembers([...members, name]);
    setNewMember("");
  };

  // Saves straight to storage (the list reloads on focus), instead of
  // passing a callback through navigation params, which React Navigation
  // warns about because params must be serialisable.
  const handleSaveGroup = async () => {
    const name = groupName.trim();
    if (!name) return Alert.alert("Enter a group name");
    if (members.length === 0) return Alert.alert("Add at least one member");
    const stored = JSON.parse((await AsyncStorage.getItem("groups")) || "[]");
    // Groups are looked up by name, so names must be unique.
    if (stored.some((g) => g.name.trim().toLowerCase() === name.toLowerCase())) {
      return Alert.alert("Name in use", "Choose a different group name.");
    }
    await AsyncStorage.setItem(
      "groups",
      JSON.stringify([...stored, { name, members, items: [] }])
    );
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholderTextColor="#888"
        placeholder="Group Name"
        value={groupName}
        onChangeText={setGroupName}
        style={styles.input}
      />
      <FlatList
        data={members}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => <Text style={styles.member}>{item}</Text>}
      />
      <TextInput
        placeholderTextColor="#888"
        placeholder="Add Member"
        value={newMember}
        onChangeText={setNewMember}
        style={styles.input}
      />
      <Button title="Add Member" onPress={handleAddMember} />
      <Button title="Save Group" onPress={handleSaveGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  input: {
    color: "#000",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    marginVertical: 8,
  },
  member: {
    fontSize: 16,
    padding: 8,
    backgroundColor: "#e0e0e0",
    marginVertical: 4,
  },
});
