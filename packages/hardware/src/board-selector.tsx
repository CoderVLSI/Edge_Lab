import React from "react";

export interface Board {
  id: string;
  name: string;
  fqbn: string;
  platform: "arduino" | "espressif" | "other";
}

export const BOARDS: Board[] = [
  { id: "uno", name: "Arduino Uno", fqbn: "arduino:avr:uno", platform: "arduino" },
  { id: "mega", name: "Arduino Mega 2560", fqbn: "arduino:avr:mega", platform: "arduino" },
  { id: "nano", name: "Arduino Nano", fqbn: "arduino:avr:nano", platform: "arduino" },
  { id: "esp32", name: "ESP32 Dev Module", fqbn: "espressif:esp32:esp32", platform: "espressif" },
  { id: "esp8266", name: "ESP8266 NodeMCU", fqbn: "esp8266:esp8266:nodemcuv2", platform: "espressif" },
  { id: "esp32s3", name: "ESP32-S3 Dev Module", fqbn: "espressif:esp32:esp32s3", platform: "espressif" },
];

interface BoardSelectorProps {
  value: string;
  onChange: (board: Board) => void;
  className?: string;
}

export function BoardSelector({ value, onChange, className }: BoardSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const board = BOARDS.find((b) => b.id === e.target.value);
        if (board) onChange(board);
      }}
      className={
        className ??
        "h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
      }
    >
      <optgroup label="Arduino">
        {BOARDS.filter((b) => b.platform === "arduino").map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </optgroup>
      <optgroup label="Espressif">
        {BOARDS.filter((b) => b.platform === "espressif").map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </optgroup>
    </select>
  );
}
