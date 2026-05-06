import React, { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams } from "expo-router";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL ?? "ws://localhost:1234";

const DEMO_FILES = [
  { id: "main.cpp", name: "main.cpp" },
  { id: "config.h", name: "config.h" },
  { id: "platformio.ini", name: "platformio.ini" },
];

const DEMO_CONTENT: Record<string, string> = {
  "main.cpp": `#include <Arduino.h>\n#include "config.h"\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(BLINK_DELAY);\n  digitalWrite(LED_PIN, LOW);\n  delay(BLINK_DELAY);\n}`,
  "config.h": `#pragma once\n\n#define LED_PIN    2\n#define BLINK_DELAY 500`,
  "platformio.ini": `[env:esp32dev]\nplatform = espressif32\nboard = esp32dev\nframework = arduino`,
};

// CodeMirror editor bundled as an HTML string for WebView
function buildEditorHtml(content: string, lang: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<style>
  body { margin: 0; background: #282a36; }
  .CodeMirror { height: 100vh; font-size: 13px; font-family: monospace; }
  .CodeMirror-scroll { overflow: auto !important; }
</style>
</head>
<body>
<textarea id="editor">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
<script>
  var editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
    mode: "${lang}",
    theme: "dracula",
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
  });
</script>
</body>
</html>`;
}

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [selectedFile, setSelectedFile] = useState("main.cpp");

  const content = DEMO_CONTENT[selectedFile] ?? "";
  const lang = selectedFile.endsWith(".py") ? "python" : "text/x-c++src";
  const html = buildEditorHtml(content, lang);

  return (
    <View style={s.container}>
      {/* File tabs */}
      <FlatList
        horizontal
        data={DEMO_FILES}
        keyExtractor={(f) => f.id}
        style={s.tabs}
        contentContainerStyle={{ gap: 0 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.tab, item.id === selectedFile && s.tabActive]}
            onPress={() => setSelectedFile(item.id)}
          >
            <Text style={[s.tabText, item.id === selectedFile && s.tabTextActive]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Editor WebView */}
      <WebView
        source={{ html }}
        style={{ flex: 1 }}
        scrollEnabled={false}
        keyboardDisplayRequiresUserAction={false}
        originWhitelist={["*"]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
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
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#3b82f6", backgroundColor: "#09090b" },
  tabText: { color: "#71717a", fontSize: 12 },
  tabTextActive: { color: "#e4e4e7" },
});
