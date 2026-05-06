import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";

const DEMO_PROJECTS = [
  { id: "demo-1", name: "LED Blink ESP32", board: "ESP32 Dev Module" },
  { id: "demo-2", name: "DHT22 Sensor", board: "Arduino Uno" },
  { id: "demo-3", name: "MQTT Client", board: "ESP8266 NodeMCU" },
];

export default function Dashboard() {
  const [projects] = useState(DEMO_PROJECTS);

  return (
    <View style={s.container}>
      <Text style={s.heading}>Your Projects</Text>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => router.push(`/editor/${item.id}` as never)}
          >
            <View style={s.cardLeft}>
              <Text style={s.cardName}>{item.name}</Text>
              <Text style={s.cardBoard}>{item.board}</Text>
            </View>
            <Text style={s.openBtn}>Open →</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b", padding: 16 },
  heading: { color: "#fafafa", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  card: {
    backgroundColor: "#18181b",
    borderRadius: 10,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  cardLeft: { flex: 1 },
  cardName: { color: "#e4e4e7", fontWeight: "600", fontSize: 15 },
  cardBoard: { color: "#71717a", fontSize: 12, marginTop: 2 },
  openBtn: { color: "#3b82f6", fontSize: 13, fontWeight: "600" },
});
