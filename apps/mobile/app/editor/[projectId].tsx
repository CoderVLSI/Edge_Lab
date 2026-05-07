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
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? "";
const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL ?? "ws://localhost:1234";

const BOARDS = [
  { id: "uno", name: "Arduino Uno", platform: "arduino" },
  { id: "mega", name: "Arduino Mega 2560", platform: "arduino" },
  { id: "nano", name: "Arduino Nano", platform: "arduino" },
  { id: "esp32", name: "ESP32 Dev Module", platform: "espressif" },
  { id: "esp8266", name: "ESP8266 NodeMCU", platform: "espressif" },
  { id: "esp32s3", name: "ESP32-S3 Dev Module", platform: "espressif" },
] as const;

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

type Board = (typeof BOARDS)[number];
type BottomTab = "terminal" | "serial" | "ports" | "git";

interface ProjectFile {
  id: string;
  path: string;
  content: string;
}

interface AgentImage {
  mediaType: string;
  data: string;  // base64
  preview: string; // uri
}

interface AgentMessage {
  role: "user" | "assistant";
  text: string;
  images?: { preview: string }[];
}

const DEMO_FILES: ProjectFile[] = [
  {
    id: "main.cpp",
    path: "main.cpp",
    content:
      `#include <Arduino.h>\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(500);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(500);\n}`,
  },
  {
    id: "platformio.ini",
    path: "platformio.ini",
    content: `[env:esp32dev]\nplatform = espressif32\nboard = esp32dev\nframework = arduino`,
  },
];

function authHeaders(extra?: Record<string, string>) {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (API_TOKEN) h["Authorization"] = `Bearer ${API_TOKEN}`;
  return h;
}

function buildEditorHtml(content: string, lang: string): string {
  const escaped = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
<style>
  body { margin: 0; background: #282a36; }
  .CodeMirror { height: 100vh; font-size: 13px; font-family: monospace; }
  .CodeMirror-scroll { overflow: auto !important; }
</style>
</head>
<body>
<textarea id="editor">${escaped}</textarea>
<script>
  var editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    mode: '${lang}',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
    autofocus: false,
  });
  var _ignoreNext = false;
  editor.on('change', function() {
    if (_ignoreNext) { _ignoreNext = false; return; }
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'change', content: editor.getValue() })
    );
  });
  function handleMsg(raw) {
    try {
      var msg = JSON.parse(raw);
      if (msg.type === 'setContent' && editor.getValue() !== msg.content) {
        _ignoreNext = true;
        editor.setValue(msg.content);
      }
    } catch(e) {}
  }
  document.addEventListener('message', function(e) { handleMsg(e.data); });
  window.addEventListener('message', function(e) { handleMsg(e.data); });
</script>
</body>
</html>`;
}

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  // ── Files ──
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const webViewRef = useRef<WebView>(null);

  // ── Board ──
  const [board, setBoard] = useState<Board>(BOARDS[3]);
  const [boardModalVisible, setBoardModalVisible] = useState(false);

  // ── Bottom panel ──
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [buildOutput, setBuildOutput] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const terminalRef = useRef<ScrollView>(null);

  // ── Serial monitor ──
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [baudRate] = useState(115200);
  const [serialOutput, setSerialOutput] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState("");
  const [serialConnected, setSerialConnected] = useState(false);
  const serialWsRef = useRef<WebSocket | null>(null);
  const serialRef = useRef<ScrollView>(null);

  // ── Agent ──
  const [agentVisible, setAgentVisible] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentImages, setAgentImages] = useState<AgentImage[]>([]);
  const agentScrollRef = useRef<ScrollView>(null);

  // ── Git ──
  const [gitStagedFiles, setGitStagedFiles] = useState<string[]>([]);
  const [gitUnstagedFiles, setGitUnstagedFiles] = useState<string[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [gitRunning, setGitRunning] = useState(false);
  const [gitLog, setGitLog] = useState<string[]>([]);
  const gitLogRef = useRef<ScrollView>(null);

  // ── Load files from API ──
  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/files`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data: ProjectFile[] = await res.json();
        if (data.length > 0) {
          setFiles(data);
          setSelectedFile(data[0]);
          setEditorContent(data[0].content);
          return;
        }
      }
    } catch { /* fall through to demo */ }
    setFiles(DEMO_FILES);
    setSelectedFile(DEMO_FILES[0]);
    setEditorContent(DEMO_FILES[0].content);
  }, [projectId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const selectFile = (file: ProjectFile) => {
    if (file.id === selectedFile?.id) return;
    setSelectedFile(file);
    setEditorContent(file.content);
    setIsDirty(false);
    webViewRef.current?.postMessage(
      JSON.stringify({ type: "setContent", content: file.content })
    );
  };

  // ── Save ──
  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await fetch(`${API_URL}/api/projects/${projectId}/files`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ path: selectedFile.path, content: editorContent }),
      });
      setIsDirty(false);
      setFiles((prev) =>
        prev.map((f) => (f.id === selectedFile.id ? { ...f, content: editorContent } : f))
      );
      setBuildOutput((o) => [...o, `✓ Saved ${selectedFile.path}`]);
    } catch (e) {
      setBuildOutput((o) => [...o, `✗ Save failed: ${String(e)}`]);
    }
  }, [selectedFile, editorContent, projectId]);

  // ── Build ──
  const runBuild = async () => {
    if (isDirty) await saveFile();
    setIsBuilding(true);
    setBottomTab("terminal");
    setBuildOutput(["$ pio run", "Building…"]);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/build`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data: { output: string[]; exitCode: number } = await res.json();
      setBuildOutput(["$ pio run", ...data.output]);
    } catch (e) {
      setBuildOutput((o) => [...o, `✗ Error: ${String(e)}`]);
    } finally {
      setIsBuilding(false);
      setTimeout(() => terminalRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  // ── Flash ──
  const runFlash = async () => {
    if (isDirty) await saveFile();
    setIsFlashing(true);
    setBottomTab("terminal");
    setBuildOutput(["$ pio run --target upload", "Flashing…"]);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/flash`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data: { output: string[]; exitCode: number } = await res.json();
      setBuildOutput(["$ pio run --target upload", ...data.output]);
    } catch (e) {
      setBuildOutput((o) => [...o, `✗ Error: ${String(e)}`]);
    } finally {
      setIsFlashing(false);
      setTimeout(() => terminalRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  // ── Serial ports ──
  const refreshPorts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/serial/ports`);
      const data: string[] = await res.json();
      setSerialPorts(data);
    } catch {
      setSerialPorts([]);
    }
  }, []);

  // ── Serial WebSocket ──
  const connectSerial = useCallback(() => {
    if (!selectedPort) return;
    const wsBase = API_URL.replace(/^http/, "ws");
    const ws = new WebSocket(
      `${wsBase}/api/serial/monitor?port=${encodeURIComponent(selectedPort)}&baud=${baudRate}`
    );
    ws.onopen = () => setSerialConnected(true);
    ws.onmessage = (e) => {
      setSerialOutput((o) => [...o.slice(-999), String(e.data)]);
      setTimeout(() => serialRef.current?.scrollToEnd({ animated: true }), 100);
    };
    ws.onclose = () => setSerialConnected(false);
    ws.onerror = () => setSerialConnected(false);
    serialWsRef.current = ws;
  }, [selectedPort, baudRate]);

  const disconnectSerial = () => {
    serialWsRef.current?.close();
    serialWsRef.current = null;
    setSerialConnected(false);
  };

  const sendSerial = () => {
    if (serialWsRef.current?.readyState === WebSocket.OPEN && serialInput.trim()) {
      serialWsRef.current.send(serialInput);
      setSerialInput("");
    }
  };

  useEffect(() => () => { serialWsRef.current?.close(); }, []);

  // ── Agent ──
  const pickAgentImages = async () => {
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
        .map((a) => ({
          mediaType: a.mimeType ?? "image/jpeg",
          data: a.base64!,
          preview: a.uri,
        }));
      setAgentImages((p) => [...p, ...imgs].slice(0, 4));
    }
  };

  const takeAgentPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      const a = result.assets[0];
      setAgentImages((p) => [...p, {
        mediaType: a.mimeType ?? "image/jpeg",
        data: a.base64!,
        preview: a.uri,
      }].slice(0, 4));
    }
  };

  const sendAgent = useCallback(async () => {
    const text = agentInput.trim();
    if ((!text && !agentImages.length) || agentRunning) return;
    const imgs = [...agentImages];
    setAgentInput("");
    setAgentImages([]);
    setAgentRunning(true);

    const userMsg: AgentMessage = {
      role: "user",
      text: text || "(image)",
      images: imgs.map((i) => ({ preview: i.preview })),
    };

    // Add user message + placeholder assistant message
    setAgentMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", text: "…" },
    ]);

    // Build history (all previous messages + new user message)
    const historyForApi = [...agentMessages, userMsg]
      .filter((m) => m.text)
      .map((m) => ({
        role: m.role,
        content: m.text,
      }));

    // Append images on the last message if present
    if (imgs.length) {
      const last = historyForApi[historyForApi.length - 1];
      (last as Record<string, unknown>).images = imgs.map((i) => ({
        type: "image",
        mediaType: i.mediaType,
        data: i.data,
      }));
    }

    try {
      const res = await fetch(`${API_URL}/api/agent/run`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          projectId,
          messages: historyForApi,
          boardType: board.id,
        }),
      });

      const raw = await res.text();
      let responseText = "";
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const chunk = line.slice(6);
        if (chunk === "[DONE]") break;
        try {
          const ev = JSON.parse(chunk) as { type: string; text?: string };
          if (ev.type === "text" && ev.text) responseText += ev.text;
        } catch { /* ignore */ }
      }

      setAgentMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, text: responseText || "No response." } : m
        )
      );
    } catch (e) {
      setAgentMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, text: `Error: ${String(e)}` } : m
        )
      );
    } finally {
      setAgentRunning(false);
      setTimeout(() => agentScrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [agentInput, agentImages, agentRunning, agentMessages, projectId, board.id]);

  // ── Git ──
  const gitOp = async (op: "status" | "stage-all" | "commit" | "push" | "pull") => {
    setGitRunning(true);
    try {
      if (op === "status") {
        const res = await fetch(`${API_URL}/api/git/${projectId}/status`, { headers: authHeaders() });
        const data = await res.json() as { staged?: string[]; not_added?: string[]; modified?: string[] };
        setGitStagedFiles(data.staged ?? []);
        setGitUnstagedFiles([...(data.not_added ?? []), ...(data.modified ?? [])]);
        setGitLog((l) => [...l, `✓ Status refreshed`]);
      } else if (op === "stage-all") {
        await fetch(`${API_URL}/api/git/${projectId}/stage-all`, {
          method: "POST", headers: authHeaders(),
        });
        setGitLog((l) => [...l, `✓ All files staged`]);
        await gitOp("status");
        return; // avoid double setGitRunning(false)
      } else if (op === "commit") {
        if (!commitMsg.trim()) {
          setGitLog((l) => [...l, `✗ Enter a commit message`]);
          return;
        }
        await fetch(`${API_URL}/api/git/${projectId}/commit`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ message: commitMsg }),
        });
        setCommitMsg("");
        setGitLog((l) => [...l, `✓ Committed: "${commitMsg}"`]);
        await gitOp("status");
        return;
      } else if (op === "push") {
        await fetch(`${API_URL}/api/git/${projectId}/push`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({}),
        });
        setGitLog((l) => [...l, `✓ Pushed to remote`]);
      } else if (op === "pull") {
        await fetch(`${API_URL}/api/git/${projectId}/pull`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({}),
        });
        setGitLog((l) => [...l, `✓ Pulled from remote`]);
      }
    } catch (e) {
      setGitLog((l) => [...l, `✗ ${String(e)}`]);
    } finally {
      setGitRunning(false);
      setTimeout(() => gitLogRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const lang = selectedFile?.path.endsWith(".py")
    ? "python"
    : selectedFile?.path.endsWith(".ini")
    ? "text/x-ini"
    : "text/x-c++src";

  const html = buildEditorHtml(editorContent, lang);

  return (
    <View style={s.container}>

      {/* ── Toolbar ── */}
      <View style={s.toolbar}>
        <TouchableOpacity style={s.boardBtn} onPress={() => setBoardModalVisible(true)}>
          <Text style={s.boardBtnText} numberOfLines={1}>{board.name}</Text>
          <Text style={s.chevron}>▾</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {isDirty && (
          <TouchableOpacity style={s.toolBtn} onPress={saveFile}>
            <Text style={s.toolBtnText}>Save</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[s.toolBtn, isBuilding && s.toolBtnDisabled]}
          onPress={runBuild}
          disabled={isBuilding}
        >
          {isBuilding ? (
            <ActivityIndicator size="small" color="#4ade80" />
          ) : (
            <Text style={[s.toolBtnText, { color: "#4ade80" }]}>▶ Build</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.flashBtn, isFlashing && s.toolBtnDisabled]}
          onPress={runFlash}
          disabled={isFlashing}
        >
          {isFlashing ? (
            <ActivityIndicator size="small" color="#09090b" />
          ) : (
            <Text style={s.flashBtnText}>↑ Flash</Text>
          )}
        </TouchableOpacity>

        {/* AI Agent button */}
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
              {item.path}
              {item.id === selectedFile?.id && isDirty ? " •" : ""}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* ── Code editor (WebView) ── */}
      <View style={{ flex: 1 }}>
        {selectedFile ? (
          <WebView
            ref={webViewRef}
            source={{ html }}
            style={{ flex: 1 }}
            scrollEnabled={false}
            keyboardDisplayRequiresUserAction={false}
            originWhitelist={["*"]}
            onMessage={(e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data) as { type: string; content: string };
                if (msg.type === "change") {
                  setEditorContent(msg.content);
                  setIsDirty(true);
                }
              } catch { /* ignore malformed */ }
            }}
          />
        ) : (
          <View style={s.emptyEditor}>
            <Text style={s.emptyEditorText}>Select a file to edit</Text>
          </View>
        )}
      </View>

      {/* ── Bottom panel ── */}
      <View style={[s.bottomPanel, bottomTab === "git" && { height: 260 }]}>
        {/* Tab bar */}
        <View style={s.bottomTabBar}>
          {(["terminal", "serial", "ports", "git"] as BottomTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.bottomTab, bottomTab === t && s.bottomTabActive]}
              onPress={() => {
                setBottomTab(t);
                if (t === "ports") refreshPorts();
                if (t === "git") gitOp("status");
              }}
            >
              <Text style={[s.bottomTabText, bottomTab === t && s.bottomTabTextActive]}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Terminal */}
        {bottomTab === "terminal" && (
          <ScrollView
            ref={terminalRef}
            style={s.outputPane}
            contentContainerStyle={{ padding: 8 }}
          >
            {buildOutput.length === 0 ? (
              <Text style={s.outputPlaceholder}>// Build output will appear here</Text>
            ) : (
              buildOutput.map((l, i) => (
                <Text
                  key={i}
                  style={[
                    s.outputLine,
                    l.startsWith("✓") ? s.colorSuccess
                    : l.startsWith("✗") || /error/i.test(l) ? s.colorError
                    : null,
                  ]}
                >
                  {l}
                </Text>
              ))
            )}
          </ScrollView>
        )}

        {/* Serial monitor */}
        {bottomTab === "serial" && (
          <View style={{ flex: 1 }}>
            <View style={s.serialToolbar}>
              <TouchableOpacity
                style={[s.smallBtn, serialConnected ? s.smallBtnRed : s.smallBtnGreen]}
                onPress={serialConnected ? disconnectSerial : connectSerial}
                disabled={!selectedPort && !serialConnected}
              >
                <Text style={s.smallBtnText}>
                  {serialConnected ? "Disconnect" : "Connect"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.smallBtn}
                onPress={() => setSerialOutput([])}
              >
                <Text style={s.smallBtnText}>Clear</Text>
              </TouchableOpacity>
              <Text style={[s.serialStatus, serialConnected ? s.colorSuccess : { color: "#52525b" }]}>
                {serialConnected ? "● connected" : `○ ${selectedPort ?? "no port selected"}`}
              </Text>
            </View>
            <ScrollView ref={serialRef} style={s.outputPane} contentContainerStyle={{ padding: 8 }}>
              {serialOutput.map((l, i) => (
                <Text key={i} style={[s.outputLine, { color: "#4ade80" }]}>{l}</Text>
              ))}
              {serialOutput.length === 0 && (
                <Text style={s.outputPlaceholder}>
                  {selectedPort
                    ? "Press Connect to start monitoring"
                    : "Select a port in the PORTS tab first"}
                </Text>
              )}
            </ScrollView>
            <View style={s.serialInputRow}>
              <TextInput
                style={s.serialInput}
                value={serialInput}
                onChangeText={setSerialInput}
                onSubmitEditing={sendSerial}
                placeholder="Send message…"
                placeholderTextColor="#52525b"
                editable={serialConnected}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[s.sendBtn, !serialConnected && s.toolBtnDisabled]}
                onPress={sendSerial}
                disabled={!serialConnected}
              >
                <Text style={s.sendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Ports */}
        {bottomTab === "ports" && (
          <View style={{ flex: 1 }}>
            <View style={s.portsToolbar}>
              <Text style={s.portsLabel}>// SERIAL PORTS</Text>
              <TouchableOpacity style={s.refreshBtn} onPress={refreshPorts}>
                <Text style={s.refreshBtnText}>Refresh</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.outputPane} contentContainerStyle={{ padding: 8 }}>
              {serialPorts.length === 0 ? (
                <Text style={s.outputPlaceholder}>No serial ports detected</Text>
              ) : (
                serialPorts.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[s.portRow, selectedPort === p && s.portRowSelected]}
                    onPress={() => {
                      setSelectedPort(p);
                      setBottomTab("serial");
                    }}
                  >
                    <Text style={[s.portDot, selectedPort === p && { color: "#f59e0b" }]}>●</Text>
                    <Text style={s.portName}>{p}</Text>
                    {selectedPort === p && (
                      <Text style={{ color: "#f59e0b", fontSize: 10 }}>selected</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {/* Git */}
        {bottomTab === "git" && (
          <View style={{ flex: 1 }}>
            {/* Git action buttons */}
            <View style={s.gitToolbar}>
              <TouchableOpacity
                style={[s.gitBtn, gitRunning && s.toolBtnDisabled]}
                onPress={() => gitOp("stage-all")}
                disabled={gitRunning}
              >
                <Text style={s.gitBtnText}>+ Stage All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.gitBtn, gitRunning && s.toolBtnDisabled]}
                onPress={() => gitOp("push")}
                disabled={gitRunning}
              >
                <Text style={s.gitBtnText}>↑ Push</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.gitBtn, gitRunning && s.toolBtnDisabled]}
                onPress={() => gitOp("pull")}
                disabled={gitRunning}
              >
                <Text style={s.gitBtnText}>↓ Pull</Text>
              </TouchableOpacity>
              {gitRunning && <ActivityIndicator size="small" color="#f59e0b" />}
            </View>

            {/* Commit input row */}
            <View style={s.gitCommitRow}>
              <TextInput
                style={s.gitCommitInput}
                value={commitMsg}
                onChangeText={setCommitMsg}
                placeholder="Commit message…"
                placeholderTextColor="#52525b"
                returnKeyType="send"
                onSubmitEditing={() => gitOp("commit")}
              />
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: "#f59e0b" }, (!commitMsg.trim() || gitRunning) && s.toolBtnDisabled]}
                onPress={() => gitOp("commit")}
                disabled={!commitMsg.trim() || gitRunning}
              >
                <Text style={[s.sendBtnText, { color: "#09090b" }]}>✓</Text>
              </TouchableOpacity>
            </View>

            {/* Git log + status */}
            <ScrollView ref={gitLogRef} style={s.outputPane} contentContainerStyle={{ padding: 6 }}>
              {gitUnstagedFiles.length > 0 && (
                <Text style={[s.outputLine, { color: "#f59e0b", marginBottom: 2 }]}>
                  Modified: {gitUnstagedFiles.join(", ")}
                </Text>
              )}
              {gitStagedFiles.length > 0 && (
                <Text style={[s.outputLine, { color: "#4ade80", marginBottom: 2 }]}>
                  Staged: {gitStagedFiles.join(", ")}
                </Text>
              )}
              {gitLog.map((l, i) => (
                <Text key={i} style={[s.outputLine, l.startsWith("✓") ? s.colorSuccess : l.startsWith("✗") ? s.colorError : null]}>
                  {l}
                </Text>
              ))}
              {gitLog.length === 0 && gitStagedFiles.length === 0 && gitUnstagedFiles.length === 0 && (
                <Text style={s.outputPlaceholder}>// Git status will appear here</Text>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Board selector modal ── */}
      <Modal visible={boardModalVisible} transparent animationType="slide">
        <Pressable style={s.modalBackdrop} onPress={() => setBoardModalVisible(false)}>
          <Pressable>
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Select Board</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {BOARDS.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[s.boardItem, b.id === board.id && s.boardItemSelected]}
                    onPress={() => {
                      setBoard(b);
                      setBoardModalVisible(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.boardItemName, b.id === board.id && { color: "#f59e0b" }]}>
                        {b.name}
                      </Text>
                      <Text style={s.boardItemPlatform}>{b.platform}</Text>
                    </View>
                    {b.id === board.id && (
                      <Text style={{ color: "#f59e0b", fontSize: 16 }}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── AI Agent modal ── */}
      <Modal visible={agentVisible} transparent animationType="slide">
        <View style={s.agentModalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={s.agentModal}
          >
            {/* Agent header */}
            <View style={s.agentHeader}>
              <Text style={s.agentTitle}>⚡ AI <Text style={{ color: "#f59e0b" }}>AGENT</Text></Text>
              <TouchableOpacity onPress={() => setAgentVisible(false)} style={s.agentCloseBtn}>
                <Text style={s.agentCloseBtnText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <ScrollView
              ref={agentScrollRef}
              style={s.agentMessages}
              contentContainerStyle={{ padding: 12, gap: 10 }}
            >
              {agentMessages.length === 0 ? (
                <View style={s.agentEmpty}>
                  <Text style={s.agentEmptyText}>Ask me to edit code, fix errors, or explain your circuit.</Text>
                  <Text style={s.agentEmptyText}>📷 You can attach photos of schematics or components!</Text>
                </View>
              ) : (
                agentMessages.map((m, i) => (
                  <View key={i} style={[s.agentMsgRow, m.role === "user" ? s.agentMsgRowUser : null]}>
                    {/* Image thumbnails for user messages */}
                    {m.role === "user" && m.images && m.images.length > 0 && (
                      <View style={s.agentImgRow}>
                        {m.images.map((img, j) => (
                          <Image
                            key={j}
                            source={{ uri: img.preview }}
                            style={s.agentThumb}
                          />
                        ))}
                      </View>
                    )}
                    <View style={[s.agentBubble, m.role === "user" ? s.agentBubbleUser : s.agentBubbleAssistant]}>
                      <Text style={[s.agentBubbleText, m.role === "user" ? s.agentBubbleTextUser : null]}>
                        {m.text === "…" && agentRunning && i === agentMessages.length - 1 ? "Thinking…" : m.text}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Pending image thumbnails */}
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

            {/* Input row */}
            <View style={s.agentInputRow}>
              <TouchableOpacity style={s.agentImgBtn} onPress={pickAgentImages}>
                <Text style={s.agentImgBtnText}>🖼</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.agentImgBtn} onPress={takeAgentPhoto}>
                <Text style={s.agentImgBtnText}>📷</Text>
              </TouchableOpacity>
              <TextInput
                style={s.agentInput}
                value={agentInput}
                onChangeText={setAgentInput}
                placeholder="Ask to edit code, flash, debug…"
                placeholderTextColor="#52525b"
                multiline
                returnKeyType="send"
                blurOnSubmit
                onSubmitEditing={sendAgent}
              />
              <TouchableOpacity
                style={[s.agentSendBtn, (agentRunning || (!agentInput.trim() && !agentImages.length)) && s.toolBtnDisabled]}
                onPress={sendAgent}
                disabled={agentRunning || (!agentInput.trim() && !agentImages.length)}
              >
                {agentRunning ? (
                  <ActivityIndicator size="small" color="#09090b" />
                ) : (
                  <Text style={s.agentSendBtnText}>↑</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },

  // Toolbar
  toolbar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 6,
    backgroundColor: "#18181b",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  boardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#3f3f46",
    maxWidth: 130,
  },
  boardBtnText: { color: "#a1a1aa", fontSize: 10, flex: 1 },
  chevron: { color: "#71717a", fontSize: 9 },
  toolBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#3f3f46",
    minWidth: 40,
    alignItems: "center",
  },
  toolBtnText: { color: "#a1a1aa", fontSize: 11, fontWeight: "500" },
  toolBtnDisabled: { opacity: 0.45 },
  flashBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#f59e0b",
    minWidth: 55,
    alignItems: "center",
  },
  flashBtnText: { color: "#09090b", fontSize: 11, fontWeight: "700" },
  agentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.5)",
    backgroundColor: "rgba(245,158,11,0.1)",
    alignItems: "center",
  },
  agentBtnText: { color: "#f59e0b", fontSize: 11, fontWeight: "700" },

  // File tabs
  tabs: {
    height: 36,
    backgroundColor: "#18181b",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
    flexGrow: 0,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: "#27272a",
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#f59e0b", backgroundColor: "#09090b" },
  tabText: { color: "#71717a", fontSize: 12, fontFamily: "monospace" },
  tabTextActive: { color: "#e4e4e7" },

  // Empty editor
  emptyEditor: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyEditorText: { color: "#3f3f46", fontSize: 13, fontFamily: "monospace" },

  // Bottom panel
  bottomPanel: {
    height: 210,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    backgroundColor: "#09090b",
  },
  bottomTabBar: {
    height: 30,
    flexDirection: "row",
    backgroundColor: "#18181b",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  bottomTab: {
    paddingHorizontal: 12,
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  bottomTabActive: { borderBottomColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)" },
  bottomTabText: { fontSize: 9, color: "#52525b", letterSpacing: 1 },
  bottomTabTextActive: { color: "#f59e0b" },
  outputPane: { flex: 1 },
  outputLine: { fontFamily: "monospace", fontSize: 11, color: "#a1a1aa", lineHeight: 18 },
  outputPlaceholder: { fontFamily: "monospace", fontSize: 11, color: "#3f3f46" },
  colorSuccess: { color: "#4ade80" },
  colorError: { color: "#f87171" },

  // Serial
  serialToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  smallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#18181b",
  },
  smallBtnGreen: { borderColor: "#16a34a", backgroundColor: "#14532d" },
  smallBtnRed: { borderColor: "#dc2626", backgroundColor: "#7f1d1d" },
  smallBtnText: { color: "#e4e4e7", fontSize: 11 },
  serialStatus: { fontSize: 11, flex: 1, textAlign: "right" },
  serialInputRow: {
    flexDirection: "row",
    gap: 6,
    padding: 6,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
  },
  serialInput: {
    flex: 1,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#18181b",
    paddingHorizontal: 8,
    color: "#e4e4e7",
    fontSize: 12,
  },
  sendBtn: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 4,
    backgroundColor: "#2563eb",
    justifyContent: "center",
  },
  sendBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  // Ports
  portsToolbar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  portsLabel: { fontFamily: "monospace", fontSize: 9, color: "#3f3f46", letterSpacing: 1, flex: 1 },
  refreshBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  refreshBtnText: { color: "#f59e0b", fontSize: 10 },
  portRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#18181b",
  },
  portRowSelected: { backgroundColor: "rgba(245,158,11,0.05)" },
  portDot: { color: "#4ade80", fontSize: 10 },
  portName: { fontFamily: "monospace", fontSize: 12, color: "#a1a1aa", flex: 1 },

  // Git
  gitToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  gitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    backgroundColor: "rgba(245,158,11,0.06)",
  },
  gitBtnText: { color: "#f59e0b", fontSize: 10, fontWeight: "600" },
  gitCommitRow: {
    flexDirection: "row",
    gap: 6,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  gitCommitInput: {
    flex: 1,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#18181b",
    paddingHorizontal: 8,
    color: "#e4e4e7",
    fontSize: 12,
  },

  // Board modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#18181b",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    maxHeight: "80%",
  },
  modalTitle: { color: "#e4e4e7", fontSize: 16, fontWeight: "700", marginBottom: 16 },
  boardItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  boardItemSelected: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  boardItemName: { color: "#e4e4e7", fontSize: 14, fontWeight: "500" },
  boardItemPlatform: { color: "#71717a", fontSize: 11, marginTop: 2 },

  // Agent modal
  agentModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  agentModal: {
    backgroundColor: "#0c0d1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: "#252840",
    height: "85%",
    display: "flex",
    flexDirection: "column",
  },
  agentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1d2e",
  },
  agentTitle: {
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: "800",
    color: "#f1f5f9",
    letterSpacing: 1,
  },
  agentCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#252840",
    backgroundColor: "#10121f",
  },
  agentCloseBtnText: { color: "#94a3b8", fontSize: 11 },
  agentMessages: { flex: 1 },
  agentEmpty: { padding: 20, gap: 8 },
  agentEmptyText: { color: "#475569", fontSize: 12, lineHeight: 18 },
  agentMsgRow: { flexDirection: "column", gap: 4, marginBottom: 8 },
  agentMsgRowUser: { alignItems: "flex-end" },
  agentImgRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  agentThumb: { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: "#252840" },
  agentBubble: {
    maxWidth: "85%",
    borderRadius: 10,
    padding: 10,
  },
  agentBubbleUser: {
    backgroundColor: "#f59e0b",
  },
  agentBubbleAssistant: {
    backgroundColor: "#10121f",
    borderWidth: 1,
    borderColor: "#1a1d2e",
  },
  agentBubbleText: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 18,
    fontFamily: "monospace",
  },
  agentBubbleTextUser: { color: "#09090b", fontFamily: "monospace" },
  agentPendingImgs: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#1a1d2e",
  },
  agentPendingThumb: { width: 48, height: 48, borderRadius: 6, borderWidth: 1, borderColor: "#252840" },
  agentRemoveImg: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#f87171",
    alignItems: "center",
    justifyContent: "center",
  },
  agentInputRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#1a1d2e",
  },
  agentImgBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#252840",
    backgroundColor: "#10121f",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  agentImgBtnText: { fontSize: 16 },
  agentInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#252840",
    backgroundColor: "#10121f",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#e4e4e7",
    fontSize: 12,
    fontFamily: "monospace",
  },
  agentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  agentSendBtnText: { color: "#09090b", fontSize: 18, fontWeight: "800" },
});
