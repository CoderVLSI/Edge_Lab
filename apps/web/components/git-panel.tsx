"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  GitBranch, GitCommit, Upload, Download,
  Plus, Minus, RefreshCw, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Circle,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface FileStatus {
  path: string;
  status: string;
  statusLabel: string;
}

interface GitStatus {
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: string[];
  isRepo: boolean;
}

interface CommitLog {
  hash: string;
  hashShort: string;
  message: string;
  author: string;
  date: string;
}

interface Branch {
  name: string;
  current: boolean;
  remote: boolean;
  commit: string;
}

type GitTab = "changes" | "log" | "branches";

const STATUS_COLOR: Record<string, string> = {
  M: "text-yellow-400",
  A: "text-green-400",
  D: "text-red-400",
  R: "text-blue-400",
  "?": "text-zinc-500",
};

function apiHeaders(token?: string) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function GitPanel({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<CommitLog[]>([]);
  const [branches, setBranches] = useState<{ current: string; all: Branch[] } | null>(null);
  const [tab, setTab] = useState<GitTab>("changes");
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [showRemoteInput, setShowRemoteInput] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [expandStaged, setExpandStaged] = useState(true);
  const [expandUnstaged, setExpandUnstaged] = useState(true);
  const [diff, setDiff] = useState<{ file: string; content: string } | null>(null);

  const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth-token") ?? "" : "";

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/git/${projectId}/status`, { headers: apiHeaders(token) });
      const data = await res.json();
      setStatus(data);
      setError("");
    } catch {
      setError("Cannot reach backend — is the API server running?");
    }
  }, [projectId, token]);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/git/${projectId}/log?limit=30`, { headers: apiHeaders(token) });
      setLog(await res.json());
    } catch { /* offline */ }
  }, [projectId, token]);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/git/${projectId}/branches`, { headers: apiHeaders(token) });
      setBranches(await res.json());
    } catch { /* offline */ }
  }, [projectId, token]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  useEffect(() => {
    if (tab === "log") fetchLog();
    if (tab === "branches") fetchBranches();
  }, [tab, fetchLog, fetchBranches]);

  const post = async (path: string, body?: object) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/git/${projectId}/${path}`, {
        method: "POST",
        headers: apiHeaders(token),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      await fetchStatus();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const initRepo = () => post("init");
  const stageAll = () => post("stage-all");
  const stageFile = (path: string) => post("stage", { paths: [path] });
  const unstageFile = (path: string) => post("unstage", { paths: [path] });

  const commit = async () => {
    if (!commitMsg.trim()) return;
    await post("commit", { message: commitMsg });
    setCommitMsg("");
  };

  const push = () => post("push", {});
  const pull = () => post("pull", {});

  const addRemote = async () => {
    if (!remoteUrl.trim()) return;
    await post("remote", { url: remoteUrl });
    setShowRemoteInput(false);
    setRemoteUrl("");
  };

  const createBranch = async () => {
    if (!newBranch.trim()) return;
    await post("branch", { name: newBranch });
    setNewBranch("");
    setShowNewBranch(false);
    fetchBranches();
  };

  const checkout = async (branch: string) => {
    await post("checkout", { branch });
    fetchBranches();
  };

  const showDiff = async (file: string, staged: boolean) => {
    try {
      const res = await fetch(
        `${API_URL}/api/git/${projectId}/diff?file=${encodeURIComponent(file)}&staged=${staged}`,
        { headers: apiHeaders(token) }
      );
      const { diff: content } = await res.json();
      setDiff({ file, content });
    } catch { /* offline */ }
  };

  // ── Not a repo ─────────────────────────────────────────────────────────────
  if (status && !status.isRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <GitBranch className="h-10 w-10 text-zinc-600" />
        <div>
          <p className="text-zinc-300 font-medium">No Git repository</p>
          <p className="text-xs text-zinc-600 mt-1">Initialize one to start tracking changes</p>
        </div>
        <button onClick={initRepo} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500">
          Initialize Repository
        </button>
      </div>
    );
  }

  // ── Diff viewer overlay ────────────────────────────────────────────────────
  if (diff) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 shrink-0">
          <button onClick={() => setDiff(null)} className="text-zinc-500 hover:text-white text-xs">← Back</button>
          <span className="text-xs text-zinc-400 truncate">{diff.file}</span>
        </div>
        <div className="flex-1 overflow-auto font-mono text-xs p-2">
          {diff.content.split("\n").map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("+") && !line.startsWith("+++")
                  ? "text-green-400 bg-green-400/5"
                  : line.startsWith("-") && !line.startsWith("---")
                  ? "text-red-400 bg-red-400/5"
                  : line.startsWith("@@")
                  ? "text-blue-400"
                  : "text-zinc-500"
              }
            >
              {line || " "}
            </div>
          ))}
          {!diff.content && <div className="text-zinc-600 p-4">No changes to show.</div>}
        </div>
      </div>
    );
  }

  const totalChanges = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-xs">
      {/* Header */}
      <div className="border-b border-zinc-800 px-3 py-2 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="font-mono text-zinc-300 font-medium truncate">{status?.branch ?? "…"}</span>
          {status?.tracking && (
            <span className="text-zinc-600 truncate">{status.tracking}</span>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="ml-auto text-zinc-600 hover:text-zinc-300 shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Ahead/behind + push/pull */}
        {status?.isRepo && (
          <div className="flex items-center gap-1.5">
            {(status.ahead > 0 || status.behind > 0) && (
              <span className="text-zinc-500">
                {status.behind > 0 && <span className="text-yellow-400">↓{status.behind}</span>}
                {status.ahead > 0 && <span className="text-green-400 ml-1">↑{status.ahead}</span>}
              </span>
            )}
            <button
              onClick={pull}
              disabled={loading}
              className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40"
            >
              <Download className="h-3 w-3" /> Pull
            </button>
            <button
              onClick={push}
              disabled={loading}
              className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40"
            >
              <Upload className="h-3 w-3" /> Push
            </button>
            <button
              onClick={() => setShowRemoteInput((v) => !v)}
              className="ml-auto text-zinc-600 hover:text-zinc-400 text-[10px]"
            >
              remote
            </button>
          </div>
        )}

        {showRemoteInput && (
          <div className="flex gap-1">
            <input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRemote()}
              placeholder="https://github.com/user/repo.git"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={addRemote} className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-500">Set</button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-1.5 text-red-400 text-[10px] leading-relaxed">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 shrink-0">
        {(["changes", "log", "branches"] as GitTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 capitalize text-[11px] transition-colors ${
              tab === t ? "text-blue-400 border-b-2 border-blue-500" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
            {t === "changes" && totalChanges > 0 && (
              <span className="ml-1 rounded-full bg-blue-600 px-1 text-[9px] text-white">{totalChanges}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── CHANGES TAB ─────────────────────────────────────────────────── */}
        {tab === "changes" && (
          <div className="space-y-0">
            {/* Commit box */}
            <div className="p-2 border-b border-zinc-800 space-y-1.5">
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message…"
                rows={2}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex gap-1">
                <button
                  onClick={stageAll}
                  disabled={loading}
                  className="flex-1 rounded border border-zinc-700 py-1 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40"
                >
                  Stage All
                </button>
                <button
                  onClick={commit}
                  disabled={loading || !commitMsg.trim() || (status?.staged.length ?? 0) === 0}
                  className="flex-1 rounded bg-blue-600 py-1 text-white hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <GitCommit className="h-3 w-3" /> Commit
                </button>
              </div>
            </div>

            {/* Staged files */}
            {(status?.staged.length ?? 0) > 0 && (
              <div>
                <button
                  onClick={() => setExpandStaged((v) => !v)}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                >
                  {expandStaged ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Staged ({status!.staged.length})
                </button>
                {expandStaged && status!.staged.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    action={<button onClick={() => unstageFile(f.path)} title="Unstage" className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"><Minus className="h-3 w-3" /></button>}
                    onDiff={() => showDiff(f.path, true)}
                  />
                ))}
              </div>
            )}

            {/* Unstaged / untracked files */}
            {((status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0)) > 0 && (
              <div>
                <button
                  onClick={() => setExpandUnstaged((v) => !v)}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                >
                  {expandUnstaged ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Changes ({(status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0)})
                </button>
                {expandUnstaged && [
                  ...(status?.unstaged ?? []),
                  ...(status?.untracked ?? []).map((p) => ({ path: p, status: "?", statusLabel: "Untracked" })),
                ].map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    action={<button onClick={() => stageFile(f.path)} title="Stage" className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-green-400"><Plus className="h-3 w-3" /></button>}
                    onDiff={() => showDiff(f.path, false)}
                  />
                ))}
              </div>
            )}

            {totalChanges === 0 && status?.isRepo && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500/40" />
                <span className="text-zinc-600">Working tree clean</span>
              </div>
            )}
          </div>
        )}

        {/* ── LOG TAB ──────────────────────────────────────────────────────── */}
        {tab === "log" && (
          <div>
            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <GitCommit className="h-8 w-8 text-zinc-700" />
                <span className="text-zinc-600">No commits yet</span>
              </div>
            ) : (
              log.map((c) => (
                <div key={c.hash} className="flex gap-2.5 px-3 py-2.5 border-b border-zinc-900 hover:bg-zinc-900/50">
                  <div className="shrink-0 mt-0.5">
                    <Circle className="h-2.5 w-2.5 text-purple-400 fill-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-zinc-200 truncate leading-tight">{c.message}</div>
                    <div className="text-zinc-600 text-[10px] mt-0.5">
                      <span className="font-mono text-purple-400/80">{c.hashShort}</span>
                      {" · "}{c.author}{" · "}{new Date(c.date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── BRANCHES TAB ─────────────────────────────────────────────────── */}
        {tab === "branches" && (
          <div>
            <div className="p-2 border-b border-zinc-800">
              {showNewBranch ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createBranch()}
                    placeholder="new-branch-name"
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={createBranch} className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-500">Create</button>
                  <button onClick={() => setShowNewBranch(false)} className="text-zinc-600 hover:text-white px-1">✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewBranch(true)}
                  className="w-full flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-white hover:border-zinc-500"
                >
                  <Plus className="h-3 w-3" /> New Branch
                </button>
              )}
            </div>

            {(branches?.all ?? [])
              .filter((b) => !b.remote)
              .map((b) => (
                <div key={b.name} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-900/50 border-b border-zinc-900">
                  <GitBranch className={`h-3 w-3 shrink-0 ${b.current ? "text-purple-400" : "text-zinc-600"}`} />
                  <span className={`flex-1 truncate font-mono text-[11px] ${b.current ? "text-white" : "text-zinc-400"}`}>
                    {b.name}
                  </span>
                  {b.current ? (
                    <span className="text-[9px] text-purple-400 border border-purple-400/30 rounded px-1">current</span>
                  ) : (
                    <button
                      onClick={() => checkout(b.name)}
                      className="text-[10px] text-zinc-600 hover:text-blue-400"
                    >
                      switch
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  action,
  onDiff,
}: {
  file: { path: string; status: string; statusLabel: string };
  action: React.ReactNode;
  onDiff: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 px-3 py-1 hover:bg-zinc-900/60">
      <span className={`shrink-0 w-4 font-mono font-bold text-center ${STATUS_COLOR[file.status] ?? "text-zinc-500"}`}>
        {file.status}
      </span>
      <button
        onClick={onDiff}
        className="flex-1 truncate text-left text-zinc-300 hover:text-white text-[11px] font-mono"
        title={file.path}
      >
        {file.path.split("/").pop()}
        <span className="text-zinc-600 ml-1">{file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") + "/" : ""}</span>
      </button>
      {action}
    </div>
  );
}
