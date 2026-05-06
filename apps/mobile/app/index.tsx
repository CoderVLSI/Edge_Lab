import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
} from "react-native";
import { router } from "expo-router";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? "";

const BOARDS = [
  { id: "uno", name: "Arduino Uno" },
  { id: "mega", name: "Arduino Mega 2560" },
  { id: "nano", name: "Arduino Nano" },
  { id: "esp32", name: "ESP32 Dev Module" },
  { id: "esp8266", name: "ESP8266 NodeMCU" },
  { id: "esp32s3", name: "ESP32-S3 Dev Module" },
];

interface Project {
  id: string;
  name: string;
  board_type: string;
}

function authHeaders() {
  return API_TOKEN
    ? { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBoard, setNewBoard] = useState("esp32");
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data: Project[] = await res.json();
        setProjects(data);
      }
    } catch {
      // Server unreachable — show demo projects so the UI is not blank
      setProjects([
        { id: "demo-1", name: "LED Blink ESP32", board_type: "esp32" },
        { id: "demo-2", name: "DHT22 Sensor", board_type: "uno" },
        { id: "demo-3", name: "MQTT Client", board_type: "esp8266" },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: newName.trim(), boardType: newBoard }),
      });
      if (res.ok) {
        const project: Project = await res.json();
        setCreateModal(false);
        setNewName("");
        router.push(`/editor/${project.id}` as never);
      } else {
        Alert.alert("Error", "Could not create project.");
      }
    } catch (e) {
      Alert.alert("Error", `Network error: ${String(e)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.heading}>Projects</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => setCreateModal(true)}>
          <Text style={s.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#f59e0b" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: 10, paddingTop: 4 }}
          ListEmptyComponent={
            <Text style={s.empty}>No projects yet. Tap + New to create one.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/editor/${item.id}` as never)}
            >
              <View style={s.cardLeft}>
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardBoard}>
                  {BOARDS.find((b) => b.id === item.board_type)?.name ?? item.board_type}
                </Text>
              </View>
              <Text style={s.openBtn}>Open →</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Create project modal ── */}
      <Modal visible={createModal} transparent animationType="slide">
        <Pressable style={s.backdrop} onPress={() => setCreateModal(false)}>
          <Pressable>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>New Project</Text>

              <Text style={s.label}>Project Name</Text>
              <TextInput
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="My Firmware"
                placeholderTextColor="#52525b"
                autoFocus
              />

              <Text style={s.label}>Board</Text>
              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                {BOARDS.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[s.boardOpt, newBoard === b.id && s.boardOptActive]}
                    onPress={() => setNewBoard(b.id)}
                  >
                    <Text style={[s.boardOptText, newBoard === b.id && { color: "#f59e0b" }]}>
                      {b.name}
                    </Text>
                    {newBoard === b.id && <Text style={{ color: "#f59e0b", fontSize: 14 }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[s.createBtn, (!newName.trim() || creating) && s.createBtnDisabled]}
                onPress={createProject}
                disabled={!newName.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator color="#09090b" />
                ) : (
                  <Text style={s.createBtnText}>Create Project</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b", padding: 16 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  heading: { color: "#fafafa", fontSize: 20, fontWeight: "700", flex: 1 },
  newBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: "#f59e0b" },
  newBtnText: { color: "#09090b", fontWeight: "700", fontSize: 13 },
  empty: { color: "#52525b", textAlign: "center", marginTop: 40, fontSize: 14 },
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
  openBtn: { color: "#f59e0b", fontSize: 13, fontWeight: "600" },
  // Modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#18181b",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
  },
  sheetTitle: { color: "#e4e4e7", fontSize: 18, fontWeight: "700", marginBottom: 16 },
  label: { color: "#71717a", fontSize: 12, marginBottom: 6, marginTop: 12 },
  input: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#09090b",
    paddingHorizontal: 12,
    color: "#e4e4e7",
    fontSize: 14,
  },
  boardOpt: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 2,
  },
  boardOptActive: { backgroundColor: "rgba(245,158,11,0.08)" },
  boardOptText: { color: "#a1a1aa", fontSize: 14, flex: 1 },
  createBtn: {
    marginTop: 20,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: "#09090b", fontWeight: "700", fontSize: 15 },
});
