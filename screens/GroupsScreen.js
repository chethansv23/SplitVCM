import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native"; // Import useFocusEffect
import React, { useState } from "react";
import { Button, FlatList, StyleSheet, Text, View } from "react-native";

export default function GroupsScreen({ navigation }) {
  const [groups, setGroups] = useState([]);

  // Function to load groups from AsyncStorage
  const loadGroups = async () => {
    try {
      const storedGroups = await AsyncStorage.getItem("groups");
      if (storedGroups) {
        setGroups(JSON.parse(storedGroups));
      } else {
        setGroups([]);
      }
    } catch (error) {
      console.error("Failed to load groups:", error);
    }
  };

  // Reload groups whenever the screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadGroups();
    }, [])
  );

  const handleCreateGroup = () => {
    navigation.navigate("Create Group");
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <Text
            style={styles.groupItem}
            onPress={() =>
              navigation.navigate("Group Details", { group: item })
            }
          >
            {item.name}
            {item.isSettled && (
              <Text style={{ color: "green", marginLeft: 5 }}>
                {" Settled"}
              </Text>
            )}
          </Text>
        )}
        ListEmptyComponent={<Text>No groups created yet.</Text>}
      />
      <Button title="Create Group" onPress={handleCreateGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  groupItem: {
    fontSize: 18,
    padding: 8,
    backgroundColor: "#f0f0f0",
    marginVertical: 4,
  },
});
