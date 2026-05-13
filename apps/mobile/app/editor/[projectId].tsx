/**
 * Edge Lab — Mobile Editor
 * Fully offline: files stored in AsyncStorage, AI calls go directly to Anthropic.
 * No backend required.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

// ── Storage keys ──────────────────────────────────────────────────────────────
const FILES_KEY    = (id: string) => `edge-lab:files:${id}`;
const SETTINGS_KEY = "edge-lab:settings";
const AUTH_KEY     = "edge-lab:auth";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProjectFile { id: string; path: string; content: string; }
interface Settings    { anthropicApiKey: string; backendUrl: string; }
interface AuthData    { token: string; email: string; }
interface AgentImage  { mediaType: string; data: string; preview: string; }
interface AgentMessage { role: "user" | "assistant"; text: string; images?: { preview: string }[]; }

// ── Constants ─────────────────────────────────────────────────────────────────
const BOARDS = [
  { id: "uno",     name: "Arduino Uno",        platform: "arduino" },
  { id: "mega",    name: "Arduino Mega 2560",   platform: "arduino" },
  { id: "nano",    name: "Arduino Nano",        platform: "arduino" },
  { id: "esp32",   name: "ESP32 Dev Module",    platform: "espressif" },
  { id: "esp8266", name: "ESP8266 NodeMCU",     platform: "espressif" },
  { id: "esp32s3", name: "ESP32-S3 Dev Module", platform: "espressif" },
] as const;
type Board = (typeof BOARDS)[number];
type BottomTab = "terminal" | "serial";

// ── Demo files (used on first open) ──────────────────────────────────────────
const DEMO_FILES: ProjectFile[] = [
  {
    id: "main.cpp",
    path: "main.cpp",
    content: `#include <Arduino.h>\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_BUILTIN, OUTPUT);\n  Serial.println("Edge Lab — Ready!");\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(500);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(500);\n  Serial.println("Blink");\n}`,
  },
  {
    id: "config.h",
    path: "config.h",
    content: `#pragma once\n\n#define LED_PIN     LED_BUILTIN\n#define BLINK_DELAY 500\n#define DEVICE_NAME "EdgeLab"\n`,
  },
  {
    id: "platformio.ini",
    path: "platformio.ini",
    content: `[env:esp32dev]\nplatform = espressif32\nboard = esp32dev\nframework = arduino\nmonitor_speed = 115200\n`,
  },
  {
    id: "README.md",
    path: "README.md",
    content: `# My ESP32 Project\n\nBuilt with Edge Lab — AI-powered embedded IDE.\n\n## Getting Started\nEdit main.cpp and ask the AI agent for help.\n`,
  },
];

// ── Storage helpers ───────────────────────────────────────────────────────────
async function getSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return { backendUrl: "", ...JSON.parse(raw) as Settings };
  } catch { /* ignore */ }
  return { anthropicApiKey: "", backendUrl: "" };
}

async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

async function getAuth(): Promise<AuthData | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) as AuthData : null;
  } catch { return null; }
}

async function saveAuth(data: AuthData | null): Promise<void> {
  if (data) await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(data));
  else await AsyncStorage.removeItem(AUTH_KEY);
}

/** Try to login via backend and persist the JWT. */
async function loginBackend(backendUrl: string, email: string, password: string): Promise<AuthData> {
  const res = await fetch(`${backendUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json() as { token?: string; error?: string };
  if (!res.ok || !data.token) throw new Error(data.error ?? "Login failed");
  return { token: data.token, email };
}

/** Sync local files to backend (upsert each file). */
async function syncFilesToBackend(backendUrl: string, token: string, projectId: string, files: ProjectFile[]): Promise<void> {
  for (const f of files) {
    await fetch(`${backendUrl}/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: f.path, content: f.content }),
    });
  }
}

/** Call the backend agent (streaming SSE). */
async function callBackendAgent(
  backendUrl: string,
  token: string,
  projectId: string,
  messages: { role: "user" | "assistant"; content: string | object[] }[],
  apiKey: string,
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch(`${backendUrl}/api/agent/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(apiKey ? { "X-ANTHROPIC_API_KEY": apiKey } : {}),
    },
    body: JSON.stringify({ messages, provider: "anthropic", model: "claude-sonnet-4-5", projectId }),
  });
  if (!res.ok || !res.body) throw new Error(`Backend error ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const raw = part.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const ev = JSON.parse(raw) as { type: string; text?: string; message?: string };
        if (ev.type === "text" && ev.text) onChunk(ev.text);
        if (ev.type === "error" && ev.message) onChunk(`\n${ev.message}`);
      } catch { /* skip */ }
    }
  }
}

async function getFiles(projectId: string): Promise<ProjectFile[]> {
  try {
    const raw = await AsyncStorage.getItem(FILES_KEY(projectId));
    if (raw) {
      const files = JSON.parse(raw) as ProjectFile[];
      if (files.length > 0) return files;
    }
  } catch { /* ignore */ }
  // First open — seed with demo files
  await AsyncStorage.setItem(FILES_KEY(projectId), JSON.stringify(DEMO_FILES));
  return DEMO_FILES;
}

async function persistFiles(projectId: string, files: ProjectFile[]): Promise<void> {
  await AsyncStorage.setItem(FILES_KEY(projectId), JSON.stringify(files));
}

// ── CodeMirror WebView HTML ───────────────────────────────────────────────────
function buildEditorHtml(content: string, lang: string): string {
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/properties/properties.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/markdown/markdown.min.js"></script>
<style>
  html, body { margin: 0; background: #282a36; height: 100%; }
  .CodeMirror { height: 100vh; font-size: 13px; font-family: 'Courier New', monospace; }
</style>
</head>
<body>
<textarea id="ed">${escaped}</textarea>
<script>
  var ed = CodeMirror.fromTextArea(document.getElementById('ed'), {
    mode: '${lang}',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
  });
  var _skip = false;
  ed.on('change', function() {
    if (_skip) { _skip = false; return; }
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'change', content: ed.getValue() })
    );
  });
  function recv(raw) {
    try {
      var m = JSON.parse(raw);
      if (m.type === 'set' && ed.getValue() !== m.content) {
        _skip = true;
        ed.setValue(m.content);
      }
    } catch(e) {}
  }
  document.addEventListener('message', function(e) { recv(e.data); });
  window.addEventListener('message', function(e) { recv(e.data); });
</script>
</body>
</html>`;
}

// ── Direct Anthropic API call (no backend) ────────────────────────────────────
async function callClaude(
  apiKey: string,
  messages: { role: "user" | "assistant"; content: string | object[] }[],
  system: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
  const data = await res.json() as { content: { type: string; text: string }[] };
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("") || "No response.";
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  // Files
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const webViewRef = useRef<WebView>(null);

  // Settings
  const [settings, setSettings] = useState<Settings>({ anthropicApiKey: "", backendUrl: "" });
  const [settingsModal, setSettingsModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [backendUrlInput, setBackendUrlInput] = useState("");
  // Auth
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [loginModal, setLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Board
  const [board, setBoard] = useState<Board>(BOARDS[3]);
  const [boardModal, setBoardModal] = useState(false);

  // Bottom panel
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [buildLog, setBuildLog] = useState<string[]>(["// Build output will appear here"]);
  const terminalRef = useRef<ScrollView>(null);

  // Agent
  const [agentVisible, setAgentVisible] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentImages, setAgentImages] = useState<AgentImage[]>([]);
  const agentScrollRef = useRef<ScrollView>(null);

  // ── Load on mount ──
  useEffect(() => {
    (async () => {
      const [fs, sett, authData] = await Promise.all([
        getFiles(projectId),
        getSettings(),
        getAuth(),
      ]);
      setFiles(fs);
      setSelectedFile(fs[0] ?? null);
      setEditorContent(fs[0]?.content ?? "");
      setSettings(sett);
      setApiKeyInput(sett.anthropicApiKey);
      setBackendUrlInput(sett.backendUrl ?? "");
      if (authData) setAuth(authData);
      // Prompt for API key on first open if not set
      if (!sett.anthropicApiKey && !authData) setSettingsModal(true);
    })();
  }, [projectId]);

  // ── File selection ──
  const selectFile = (file: ProjectFile) => {
    if (file.id === selectedFile?.id) return;
    setSelectedFile(file);
    setEditorContent(file.content);
    setIsDirty(false);
    webViewRef.current?.postMessage(JSON.stringify({ type: "set", content: file.content }));
  };

  // ── Save ──
  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    const updated = files.map((f) =>
      f.id === selectedFile.id ? { ...f, content: editorContent } : f
    );
    setFiles(updated);
    setIsDirty(false);
    await persistFiles(projectId, updated);
    setBuildLog((l) => [...l, `✓ Saved ${selectedFile.path}`]);
  }, [selectedFile, editorContent, files, projectId]);

  // ── New file ──
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  const newFile = () => { setNewFileName(""); setNewFileModal(true); };

  const confirmNewFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    const f: ProjectFile = { id: name, path: name, content: "" };
    const updated = [...files, f];
    setFiles(updated);
    await persistFiles(projectId, updated);
    setNewFileModal(false);
    selectFile(f);
  };

  // ── Build (mobile stub — show helpful message) ──
  const runBuild = () => {
    setBottomTab("terminal");
    setBuildLog([
      "// Mobile cannot compile firmware directly.",
      "// Use the AI agent to review your code,",
      "// then flash via the Edge Lab desktop app.",
      "",
      "// Tip: ask the AI agent to check your code for errors!",
    ]);
    setTimeout(() => terminalRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ── Settings save ──
  const saveSettingsModal = async () => {
    const s: Settings = { anthropicApiKey: apiKeyInput.trim(), backendUrl: backendUrlInput.trim() };
    setSettings(s);
    await saveSettings(s);
    setSettingsModal(false);
  };

  // ── Backend login ──
  const doLogin = async () => {
    setLoginError("");
    try {
      const backendUrl = settings.backendUrl || backendUrlInput.trim();
      if (!backendUrl) { setLoginError("Set Backend URL in Settings first"); return; }
      const data = await loginBackend(backendUrl, loginEmail.trim(), loginPassword);
      setAuth(data);
      await saveAuth(data);
      // Sync local files to backend
      await syncFilesToBackend(backendUrl, data.token, projectId as string, files);
      setBuildLog(l => [...l, `✓ Synced ${files.length} file(s) to backend`]);
      setLoginModal(false);
    } catch (e) { setLoginError(String(e)); }
  };

  // ── Image picker ──
  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const imgs: AgentImage[] = result.assets
        .filter((a) => a.base64)
        .map((a) => ({ mediaType: a.mimeType ?? "image/jpeg", data: a.base64!, preview: a.uri }));
      setAgentImages((p) => [...p, ...imgs].slice(0, 4));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]?.base64) {
      const a = result.assets[0];
      setAgentImages((p) => [
        ...p,
        { mediaType: a.mimeType ?? "image/jpeg", data: a.base64!, preview: a.uri },
      ].slice(0, 4));
    }
  };

  // ── Agent send — uses backend (streaming) when authed, else direct Anthropic ──
  const sendAgent = useCallback(async () => {
    const text = agentInput.trim();
    if ((!text && !agentImages.length) || agentRunning) return;

    const hasBackend = !!(auth && settings.backendUrl);
    if (!hasBackend && !settings.anthropicApiKey) {
      setSettingsModal(true);
      return;
    }

    const imgs = [...agentImages];
    setAgentInput("");
    setAgentImages([]);
    setAgentRunning(true);

    const userMsg: AgentMessage = {
      role: "user",
      text: text || "(image attached)",
      images: imgs.map((i) => ({ preview: i.preview })),
    };
    const placeholder: AgentMessage = { role: "assistant", text: "Thinking…" };
    setAgentMessages((prev) => [...prev, userMsg, placeholder]);

    // Build message history
    const history = [...agentMessages, userMsg].map((m): { role: "user" | "assistant"; content: string | object[] } => {
      if (m.role === "assistant") return { role: "assistant", content: m.text };
      const msgImgs = imgs.length > 0 && m === userMsg ? imgs : [];
      if (!msgImgs.length) return { role: "user", content: m.text };
      return {
        role: "user",
        content: [
          { type: "text", text: m.text || "Look at this image:" },
          ...msgImgs.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data },
          })),
        ],
      };
    });

    const system = [
      `You are an expert embedded systems engineer helping with firmware development.`,
      `Board: ${board.name} (${board.platform})`,
      selectedFile ? `Current file: ${selectedFile.path}\n\`\`\`\n${editorContent.slice(0, 3000)}\n\`\`\`` : "",
      `Keep responses concise and code-focused. Use markdown for code blocks.`,
    ].filter(Boolean).join("\n\n");

    try {
      if (hasBackend) {
        // ── Streaming via backend agent ──────────────────────────────────────
        let accumulated = "";
        await callBackendAgent(
          settings.backendUrl,
          auth!.token,
          projectId as string,
          history,
          settings.anthropicApiKey,
          (chunk) => {
            accumulated += chunk;
            setAgentMessages((prev) =>
              prev.map((m, i) => i === prev.length - 1 ? { ...m, text: accumulated } : m)
            );
          }
        );
      } else {
        // ── Direct Anthropic fallback ─────────────────────────────────────────
        const response = await callClaude(settings.anthropicApiKey, history, system);
        setAgentMessages((prev) =>
          prev.map((m, i) => i === prev.length - 1 ? { ...m, text: response } : m)
        );
      }
    } catch (e) {
      const errMsg = String(e).includes("401")
        ? "Invalid API key. Tap ⚙ to update it."
        : `Error: ${String(e)}`;
      setAgentMessages((prev) =>
        prev.map((m, i) => i === prev.length - 1 ? { ...m, text: errMsg } : m)
      );
    } finally {
      setAgentRunning(false);
      setTimeout(() => agentScrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [agentInput, agentImages, agentRunning, agentMessages, settings, auth, board, selectedFile, editorContent, projectId]);

  const lang = selectedFile?.path.endsWith(".py")
    ? "python"
    : selectedFile?.path.endsWith(".md")
    ? "markdown"
    : selectedFile?.path.endsWith(".ini") || selectedFile?.path.endsWith(".toml")
    ? "text/x-ini"
    : "text/x-c++src";

  return (
    <View style={s.container}>

      {/* ── Toolbar ── */}
      <View style={s.toolbar}>
        <TouchableOpacity style={s.boardBtn} onPress={() => setBoardModal(true)}>
          <Text style={s.boardBtnText} numberOfLines={1}>{board.name}</Text>
          <Text style={s.chevron}>▾</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {isDirty && (
          <TouchableOpacity style={s.toolBtn} onPress={saveFile}>
            <Text style={[s.toolBtnText, { color: "#f59e0b" }]}>Save</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.toolBtn} onPress={newFile}>
          <Text style={s.toolBtnText}>+ File</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.toolBtn} onPress={runBuild}>
          <Text style={[s.toolBtnText, { color: "#4ade80" }]}>▶</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.toolBtn} onPress={() => setSettingsModal(true)}>
          <Text style={s.toolBtnText}>⚙</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.agentBtn} onPress={() => setAgentVisible(true)}>
          <Text style={s.agentBtnText}>⚡ AI</Text>
        </TouchableOpacity>
      </View>

      {/* ── File tabs ── */}
      <FlatList
        horizontal
        data={files}
        keyExtractor={(f) => f.id}
        style={s.tabs}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.tab, item.id === selectedFile?.id && s.tabActive]}
            onPress={() => selectFile(item)}
          >
            <Text style={[s.tabText, item.id === selectedFile?.id && s.tabTextActive]}>
              {item.path}{item.id === selectedFile?.id && isDirty ? " •" : ""}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* ── Editor ── */}
      <View style={{ flex: 1 }}>
        {selectedFile ? (
          <WebView
            ref={webViewRef}
            source={{ html: buildEditorHtml(editorContent, lang) }}
            style={{ flex: 1 }}
            scrollEnabled={false}
            originWhitelist={["*"]}
            onMessage={(e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data) as { type: string; content: string };
                if (msg.type === "change") { setEditorContent(msg.content); setIsDirty(true); }
              } catch { /* ignore */ }
            }}
          />
        ) : (
          <View style={s.emptyEditor}>
            <Text style={s.emptyEditorText}>Select a file to edit</Text>
          </View>
        )}
      </View>

      {/* ── Bottom panel ── */}
      <View style={s.bottomPanel}>
        <View style={s.bottomTabBar}>
          {(["terminal", "serial"] as BottomTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.bottomTab, bottomTab === t && s.bottomTabActive]}
              onPress={() => setBottomTab(t)}
            >
              <Text style={[s.bottomTabText, bottomTab === t && s.bottomTabTextActive]}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {bottomTab === "terminal" && (
          <ScrollView ref={terminalRef} style={s.outputPane} contentContainerStyle={{ padding: 8 }}>
            {buildLog.map((l, i) => (
              <Text key={i} style={[s.outputLine,
                l.startsWith("✓") ? s.colorSuccess :
                l.startsWith("✗") || /error/i.test(l) ? s.colorError : null]}>
                {l}
              </Text>
            ))}
          </ScrollView>
        )}

        {bottomTab === "serial" && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <Text style={s.outputPlaceholder}>// Serial monitor requires USB hardware.</Text>
            <Text style={[s.outputPlaceholder, { marginTop: 6 }]}>// Use Edge Lab desktop for flashing.</Text>
          </View>
        )}
      </View>

      {/* ── New file modal ── */}
      <Modal visible={newFileModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setNewFileModal(false)}>
          <Pressable>
            <View style={[s.modalSheet, { paddingBottom: 24 }]}>
              <Text style={s.modalTitle}>New File</Text>
              <TextInput
                style={s.input}
                value={newFileName}
                onChangeText={setNewFileName}
                placeholder="e.g. sensors.h"
                placeholderTextColor="#52525b"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={confirmNewFile}
              />
              <TouchableOpacity
                style={[s.createBtn, !newFileName.trim() && s.createBtnDisabled]}
                onPress={confirmNewFile}
                disabled={!newFileName.trim()}
              >
                <Text style={s.createBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Board modal ── */}
      <Modal visible={boardModal} transparent animationType="slide">
        <Pressable style={s.modalBackdrop} onPress={() => setBoardModal(false)}>
          <Pressable>
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Select Board</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {BOARDS.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[s.boardItem, b.id === board.id && s.boardItemSelected]}
                    onPress={() => { setBoard(b); setBoardModal(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.boardItemName, b.id === board.id && { color: "#f59e0b" }]}>{b.name}</Text>
                      <Text style={s.boardItemPlatform}>{b.platform}</Text>
                    </View>
                    {b.id === board.id && <Text style={{ color: "#f59e0b", fontSize: 16 }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Settings modal ── */}
      <Modal visible={settingsModal} transparent animationType="slide">
        <Pressable style={s.modalBackdrop} onPress={() => setSettingsModal(false)}>
          <Pressable>
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>⚙ Settings</Text>

              <Text style={s.label}>Anthropic API Key</Text>
              <Text style={s.hint}>Direct Claude calls from your device (no backend needed).</Text>
              <TextInput
                style={[s.input, { fontFamily: "monospace", fontSize: 12 }]}
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
                placeholder="sk-ant-..."
                placeholderTextColor="#52525b"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              <Text style={[s.label, { marginTop: 14 }]}>Backend URL (optional)</Text>
              <Text style={s.hint}>Point to your Edge Lab backend for full agent tools + file sync.</Text>
              <TextInput
                style={[s.input, { fontFamily: "monospace", fontSize: 12 }]}
                value={backendUrlInput}
                onChangeText={setBackendUrlInput}
                placeholder="http://192.168.x.x:4000"
                placeholderTextColor="#52525b"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              {/* Sign-in button when backend URL is set */}
              {backendUrlInput.trim() && !auth && (
                <TouchableOpacity
                  style={[s.createBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#e0a020", marginTop: 8 }]}
                  onPress={() => { saveSettingsModal(); setLoginModal(true); }}
                >
                  <Text style={[s.createBtnText, { color: "#e0a020" }]}>Sign In to Backend →</Text>
                </TouchableOpacity>
              )}
              {auth && (
                <View style={{ padding: 8, borderRadius: 4, backgroundColor: "#14532d22", borderWidth: 1, borderColor: "#4ec9b044", marginTop: 8 }}>
                  <Text style={{ color: "#4ec9b0", fontFamily: "monospace", fontSize: 11 }}>✓ Signed in as {auth.email}</Text>
                  <TouchableOpacity onPress={() => { setAuth(null); saveAuth(null); }}>
                    <Text style={{ color: "#71717a", fontSize: 10, marginTop: 4 }}>Sign out</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={[s.createBtn, { marginTop: 16 }]} onPress={saveSettingsModal}>
                <Text style={s.createBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.createBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3f3f46", marginTop: 8 }]}
                onPress={() => setSettingsModal(false)}
              >
                <Text style={[s.createBtnText, { color: "#71717a" }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Login modal ── */}
      <Modal visible={loginModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setLoginModal(false)}>
          <Pressable>
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Sign In to Backend</Text>
              {loginError ? <Text style={{ color: "#f44747", fontSize: 11, marginBottom: 8, fontFamily: "monospace" }}>{loginError}</Text> : null}
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} value={loginEmail} onChangeText={setLoginEmail} placeholder="you@example.com" placeholderTextColor="#52525b" autoCapitalize="none" keyboardType="email-address" />
              <Text style={[s.label, { marginTop: 10 }]}>Password</Text>
              <TextInput style={s.input} value={loginPassword} onChangeText={setLoginPassword} placeholder="••••••••" placeholderTextColor="#52525b" secureTextEntry />
              <TouchableOpacity style={[s.createBtn, { marginTop: 14 }]} onPress={doLogin}>
                <Text style={s.createBtnText}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.createBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3f3f46", marginTop: 8 }]} onPress={() => setLoginModal(false)}>
                <Text style={[s.createBtnText, { color: "#71717a" }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── AI Agent modal ── */}
      <Modal visible={agentVisible} transparent animationType="slide">
        <View style={s.agentBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.agentModal}>

            <View style={s.agentHeader}>
              <Text style={s.agentTitle}>⚡ AI <Text style={{ color: "#f59e0b" }}>AGENT</Text></Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => setSettingsModal(true)} style={s.agentCloseBtn}>
                  <Text style={s.agentCloseBtnText}>⚙ Key</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAgentVisible(false)} style={s.agentCloseBtn}>
                  <Text style={s.agentCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Status bar */}
            {auth ? (
              <View style={{ backgroundColor: "#14532d22", borderBottomWidth: 1, borderColor: "#4ec9b033", padding: 6, paddingHorizontal: 12 }}>
                <Text style={{ color: "#4ec9b0", fontSize: 10, fontFamily: "monospace" }}>
                  ✓ Backend agent — {auth.email} · tools: bash, files, git, pio, serial
                </Text>
              </View>
            ) : !settings.anthropicApiKey ? (
              <TouchableOpacity style={s.apiKeyWarning} onPress={() => setSettingsModal(true)}>
                <Text style={s.apiKeyWarningText}>⚠ No API key — tap to add your Anthropic key</Text>
              </TouchableOpacity>
            ) : null}

            <ScrollView
              ref={agentScrollRef}
              style={s.agentMessages}
              contentContainerStyle={{ padding: 12, gap: 10 }}
            >
              {agentMessages.length === 0 ? (
                <View style={s.agentEmpty}>
                  <Text style={s.agentEmptyText}>Ask me to write code, fix bugs, or explain how to wire your circuit.</Text>
                  <Text style={[s.agentEmptyText, { marginTop: 8 }]}>📷 Attach a photo of your schematic or error message!</Text>
                  <Text style={[s.agentEmptyText, { marginTop: 8, color: "#334155" }]}>Calls Claude directly from your device — no backend needed.</Text>
                </View>
              ) : (
                agentMessages.map((m, i) => (
                  <View key={i} style={[s.agentMsgRow, m.role === "user" ? s.agentMsgRowUser : null]}>
                    {m.role === "user" && m.images && m.images.length > 0 && (
                      <View style={s.agentImgRow}>
                        {m.images.map((img, j) => (
                          <Image key={j} source={{ uri: img.preview }} style={s.agentThumb} />
                        ))}
                      </View>
                    )}
                    <View style={[s.agentBubble, m.role === "user" ? s.agentBubbleUser : s.agentBubbleAsst]}>
                      <Text style={[s.agentBubbleText, m.role === "user" ? { color: "#09090b" } : null]}>
                        {m.text}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {agentImages.length > 0 && (
              <View style={s.agentPendingImgs}>
                {agentImages.map((img, i) => (
                  <View key={i} style={{ position: "relative" }}>
                    <Image source={{ uri: img.preview }} style={s.agentPendingThumb} />
                    <TouchableOpacity
                      style={s.agentRemoveImg}
                      onPress={() => setAgentImages((p) => p.filter((_, j) => j !== i))}
                    >
                      <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700" }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={s.agentInputRow}>
              <TouchableOpacity style={s.agentImgBtn} onPress={pickImages}>
                <Text style={{ fontSize: 18 }}>🖼</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.agentImgBtn} onPress={takePhoto}>
                <Text style={{ fontSize: 18 }}>📷</Text>
              </TouchableOpacity>
              <TextInput
                style={s.agentInput}
                value={agentInput}
                onChangeText={setAgentInput}
                placeholder="Ask about your firmware…"
                placeholderTextColor="#52525b"
                multiline
                returnKeyType="send"
                blurOnSubmit
                onSubmitEditing={sendAgent}
              />
              <TouchableOpacity
                style={[s.agentSendBtn, (agentRunning || (!agentInput.trim() && !agentImages.length)) && s.disabled]}
                onPress={sendAgent}
                disabled={agentRunning || (!agentInput.trim() && !agentImages.length)}
              >
                {agentRunning
                  ? <ActivityIndicator size="small" color="#09090b" />
                  : <Text style={s.agentSendBtnText}>↑</Text>}
              </TouchableOpacity>
            </View>

          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },

  toolbar: {
    height: 44, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, gap: 6,
    backgroundColor: "#18181b", borderBottomWidth: 1, borderBottomColor: "#27272a",
  },
  boardBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: "#3f3f46", maxWidth: 120,
  },
  boardBtnText: { color: "#a1a1aa", fontSize: 10, flex: 1 },
  chevron: { color: "#71717a", fontSize: 9 },
  toolBtn: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: "#3f3f46", minWidth: 36, alignItems: "center",
  },
  toolBtnText: { color: "#a1a1aa", fontSize: 11, fontWeight: "500" },
  disabled: { opacity: 0.4 },
  agentBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.5)",
    backgroundColor: "rgba(245,158,11,0.1)",
  },
  agentBtnText: { color: "#f59e0b", fontSize: 11, fontWeight: "700" },

  tabs: { height: 36, backgroundColor: "#18181b", borderBottomWidth: 1, borderBottomColor: "#27272a", flexGrow: 0 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRightWidth: 1, borderRightColor: "#27272a" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#f59e0b", backgroundColor: "#09090b" },
  tabText: { color: "#71717a", fontSize: 12, fontFamily: "monospace" },
  tabTextActive: { color: "#e4e4e7" },

  emptyEditor: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyEditorText: { color: "#3f3f46", fontSize: 13, fontFamily: "monospace" },

  bottomPanel: { height: 180, borderTopWidth: 1, borderTopColor: "#27272a", backgroundColor: "#09090b" },
  bottomTabBar: { height: 30, flexDirection: "row", backgroundColor: "#18181b", borderBottomWidth: 1, borderBottomColor: "#27272a" },
  bottomTab: { paddingHorizontal: 14, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  bottomTabActive: { borderBottomColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)" },
  bottomTabText: { fontSize: 9, color: "#52525b", letterSpacing: 1 },
  bottomTabTextActive: { color: "#f59e0b" },
  outputPane: { flex: 1 },
  outputLine: { fontFamily: "monospace", fontSize: 11, color: "#a1a1aa", lineHeight: 18 },
  outputPlaceholder: { fontFamily: "monospace", fontSize: 11, color: "#3f3f46" },
  colorSuccess: { color: "#4ade80" },
  colorError: { color: "#f87171" },

  // Modals
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#18181b", borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 20, paddingBottom: 40, borderTopWidth: 1, borderTopColor: "#27272a", maxHeight: "80%",
  },
  modalTitle: { color: "#e4e4e7", fontSize: 16, fontWeight: "700", marginBottom: 16 },
  boardItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, marginBottom: 4 },
  boardItemSelected: { backgroundColor: "rgba(245,158,11,0.08)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)" },
  boardItemName: { color: "#e4e4e7", fontSize: 14, fontWeight: "500" },
  boardItemPlatform: { color: "#71717a", fontSize: 11, marginTop: 2 },
  label: { color: "#71717a", fontSize: 12, marginBottom: 4, marginTop: 8 },
  hint: { color: "#3f3f46", fontSize: 11, lineHeight: 16, marginBottom: 8 },
  input: {
    height: 44, borderRadius: 8, borderWidth: 1, borderColor: "#3f3f46",
    backgroundColor: "#09090b", paddingHorizontal: 12, color: "#e4e4e7", fontSize: 14,
  },
  createBtn: { marginTop: 16, height: 44, borderRadius: 10, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: "#09090b", fontWeight: "700", fontSize: 15 },

  // Agent
  agentBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  agentModal: {
    backgroundColor: "#0c0d1a", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderTopColor: "#252840", height: "88%", flexDirection: "column",
  },
  agentHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: "#1a1d2e",
  },
  agentTitle: { fontFamily: "monospace", fontSize: 14, fontWeight: "800", color: "#f1f5f9", letterSpacing: 1 },
  agentCloseBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "#252840", backgroundColor: "#10121f" },
  agentCloseBtnText: { color: "#94a3b8", fontSize: 11 },
  apiKeyWarning: {
    margin: 12, padding: 10, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1, borderColor: "rgba(245,158,11,0.3)",
  },
  apiKeyWarningText: { color: "#f59e0b", fontSize: 11, textAlign: "center" },
  agentMessages: { flex: 1 },
  agentEmpty: { padding: 20, gap: 4 },
  agentEmptyText: { color: "#475569", fontSize: 13, lineHeight: 20 },
  agentMsgRow: { flexDirection: "column", gap: 4, marginBottom: 8 },
  agentMsgRowUser: { alignItems: "flex-end" },
  agentImgRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  agentThumb: { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: "#252840" },
  agentBubble: { maxWidth: "85%", borderRadius: 10, padding: 10 },
  agentBubbleUser: { backgroundColor: "#f59e0b" },
  agentBubbleAsst: { backgroundColor: "#10121f", borderWidth: 1, borderColor: "#1a1d2e" },
  agentBubbleText: { fontSize: 13, color: "#94a3b8", lineHeight: 19, fontFamily: "monospace" },
  agentPendingImgs: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#1a1d2e" },
  agentPendingThumb: { width: 48, height: 48, borderRadius: 6 },
  agentRemoveImg: {
    position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#f87171", alignItems: "center", justifyContent: "center",
  },
  agentInputRow: { flexDirection: "row", gap: 6, alignItems: "flex-end", padding: 12, borderTopWidth: 1, borderTopColor: "#1a1d2e" },
  agentImgBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: "#252840", backgroundColor: "#10121f", alignItems: "center", justifyContent: "center" },
  agentInput: {
    flex: 1, minHeight: 36, maxHeight: 100, borderRadius: 8, borderWidth: 1,
    borderColor: "#252840", backgroundColor: "#10121f", paddingHorizontal: 10,
    paddingVertical: 8, color: "#e4e4e7", fontSize: 13,
  },
  agentSendBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" },
  agentSendBtnText: { color: "#09090b", fontSize: 18, fontWeight: "800" },
});
