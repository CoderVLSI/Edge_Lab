"use client";

import React from "react";
import { Play, Upload, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { BoardSelector, type Board } from "@edge-lab/hardware";
import { Logo } from "./logo";
import { SettingsModal } from "./settings-modal";

interface ToolbarProps {
  projectId: string;
  board: Board;
  onBoardChange: (board: Board) => void;
  syncStatus: "connecting" | "connected" | "disconnected";
}

export function Toolbar({ projectId: _projectId, board, onBoardChange, syncStatus }: ToolbarProps) {
  return (
    <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-1.5 shrink-0">
      <Logo size="xs" href="/dashboard" showText />

      <div className="h-4 w-px bg-zinc-800" />

      <BoardSelector value={board.id} onChange={onBoardChange} />

      <div className="flex items-center gap-1 ml-auto">
        <button className="flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors">
          <Play className="h-3 w-3 text-green-400" /> Build
        </button>
        <button className="flex items-center gap-1.5 rounded bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-1 text-xs text-white hover:from-blue-500 hover:to-purple-500 transition-all">
          <Upload className="h-3 w-3" /> Upload
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        <SettingsModal />

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        <div className="flex items-center gap-1.5 text-xs">
          {syncStatus === "connected" ? (
            <Wifi className="h-3.5 w-3.5 text-green-400" />
          ) : syncStatus === "connecting" ? (
            <RefreshCw className="h-3.5 w-3.5 text-yellow-400 animate-spin" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-400" />
          )}
          <span className={`text-xs ${
            syncStatus === "connected" ? "text-green-400" :
            syncStatus === "connecting" ? "text-yellow-400" : "text-red-400"
          }`}>
            {syncStatus}
          </span>
        </div>
      </div>
    </header>
  );
}
