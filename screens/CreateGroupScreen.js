import React, { useState } from "react";
import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function CreateGroupScreen({ route, navigation }) {
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState([]);
  const [newMember, setNewMember] = useState("");

  const handleAddMember = () => {
    if (newMember.trim()) {
      setMembers([...members, newMember]);
      setNewMember("");
    }
  };

  const handleSaveGroup = () => {
    const newGroup = { name: groupName, members, items: [] };
    route.params.onSave(newGroup);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <TextInput
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
