"use client";

import React from "react";

const DEMO_OUTPUT = [
  "$ pio run",
  "Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)",
  "─────────────────────────────────────────────────",
  "Verbose mode can be enabled via `-v, --verbose` option",
  "CONFIGURATION: https://docs.platformio.org/page/boards/espressif32/esp32dev.html",
  "PLATFORM: Espressif 32 (6.5.0) > Espressif ESP32 Dev Module",
  "DEBUG: Current (cmsis-dap) External (cmsis-dap, esp-bridge, esp-prog, iot-bus-jtag, jlink, minimodule, olimex-arm-usb-ocd, olimex-arm-usb-ocd-h, olimex-arm-usb-tiny-h, olimex-jtag-tiny, tumpa) On-board (esp-prog)",
  "PACKAGES:",
  " - framework-arduinoespressif32 @ 3.20014.231204+sha.54bb8e1",
  " - tool-esptoolpy @ 1.40501.0 (4.5.1)",
  " - toolchain-xtensa-esp32 @ 8.4.0+2021r2-patch5",
  "Building in release mode",
  "Compiling .pio/build/esp32dev/src/main.cpp.o",
  "Linking .pio/build/esp32dev/firmware.elf",
  "Checking size .pio/build/esp32dev/firmware.elf",
  "RAM:   [=         ]  12.8% (used 41912 bytes from 327680 bytes)",
  "Flash: [==        ]  21.4% (used 280333 bytes from 1310720 bytes)",
  "Building .pio/build/esp32dev/firmware.bin",
  "=============================== [SUCCESS] Took 8.23 seconds ===============================",
];

export function TerminalPanel() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#07080a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 12px", borderBottom: "1px solid #27272a", flexShrink: 0 }}>
        <span style={{ borderRadius: 5, background: "rgba(34, 197, 94, 0.12)", border: "1px solid rgba(34, 197, 94, 0.25)", color: "#86efac", padding: "3px 8px", fontSize: 12, fontWeight: 600 }}>
          Status: Success
        </span>
        <span style={{ color: "#71717a", fontSize: 12 }}>PlatformIO build completed in 8.23s</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12 }}>
        {DEMO_OUTPUT.map((line, i) => (
          <div
            key={i}
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              lineHeight: 1.5,
              color: line.includes("[SUCCESS]")
                ? "#4ade80"
                : line.includes("Compiling") || line.includes("Linking") || line.includes("Building")
                ? "#60a5fa"
                : line.startsWith("$")
                ? "#e4e4e7"
                : "#a1a1aa",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
