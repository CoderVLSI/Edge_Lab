/**
 * All tools available to the AI agent.
 * Each tool has: name, description, input_schema (JSON Schema), and an executor.
 */
import { readFile, writeFile, readdir } from "fs/promises";
import { mkdirSync } from "fs";
import { join, dirname, relative, resolve } from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { getProjectPath } from "../git-service";
import { searchHybrid, searchText, searchSemantic, getChunkCount } from "../indexer.js";

const execAsync = promisify(exec);

// ── Sandboxing ──────────────────────────────────────────────────────────────
function safePath(projectId: string, filePath: string): string {
  const base = getProjectPath(projectId);
  const full = resolve(base, filePath);
  // Prevent path traversal outside the project directory
  if (!full.startsWith(base)) throw new Error(`Path traversal blocked: ${filePath}`);
  return full;
}

// ── Tool type ───────────────────────────────────────────────────────────────
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface ToolResult {
  type: "tool_result";
  name: string;
  content: string;
  isError?: boolean;
}

// ── Tool definitions (sent to the LLM) ─────────────────────────────────────
export const TOOL_DEFS: ToolDef[] = [
  {
    name: "search_codebase",
    description: "Search all project files using semantic + keyword search. Use this FIRST when you need to find where something is defined, used, or related to a concept. Faster than reading every file.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language or code query, e.g. 'LED blink function' or 'SHT31 sensor init'" },
        mode:  { type: "string", description: "Search mode: 'hybrid' (default), 'semantic', or 'text'", enum: ["hybrid", "semantic", "text"] },
      },
      required: ["query"],
    },
  },
  {
    name: "read_file",
    description: "Read the full content of a file in the project. Use this before editing.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path, e.g. 'src/main.cpp'" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create or completely overwrite a file with new content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "Full file content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace an exact string in a file. Prefer this over write_file for targeted changes. Will fail if old_string not found.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path" },
        old_string: { type: "string", description: "Exact text to find and replace" },
        new_string: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories in the project (or a subdirectory). Returns a tree.",
    input_schema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Subdirectory to list (default: project root)" },
      },
      required: [],
    },
  },
  {
    name: "search_files",
    description: "Search for a text pattern across project files (like grep). Returns matching lines with file paths.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Text or regex pattern to search for" },
        dir: { type: "string", description: "Directory to search in (default: all files)" },
        file_pattern: { type: "string", description: "Glob pattern to filter files, e.g. '*.cpp'" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_bash",
    description: "Run a shell command in the project directory. Use for build (pio run), tests, package installs, etc. Commands run with a 30s timeout.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run, e.g. 'pio run' or 'pio run --target upload'" },
      },
      required: ["command"],
    },
  },
  {
    name: "flash_board",
    description: "Compile and flash firmware to the connected board via PlatformIO.",
    input_schema: {
      type: "object",
      properties: {
        env: { type: "string", description: "PlatformIO environment name from platformio.ini (default: first env)" },
        port: { type: "string", description: "Serial port, e.g. COM3 or /dev/ttyUSB0 (optional, auto-detect)" },
      },
      required: [],
    },
  },
  {
    name: "git_status",
    description: "Get the current git status: branch, staged/unstaged files, ahead/behind.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "git_commit",
    description: "Stage all changes and create a git commit.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" },
      },
      required: ["message"],
    },
  },
  {
    name: "read_serial",
    description: "Open the serial port and capture board output for a few seconds. Use this after flashing to verify the firmware is running correctly.",
    input_schema: {
      type: "object",
      properties: {
        port: { type: "string", description: "Serial port, e.g. COM3 or /dev/ttyUSB0. If omitted, PlatformIO auto-detects." },
        baud: { type: "string", description: "Baud rate (default: 115200)" },
        duration: { type: "string", description: "How many seconds to listen (default: 5, max: 30)" },
      },
      required: [],
    },
  },
  {
    name: "serial_send",
    description: "Send a string to the board over the serial port, then capture the response for a few seconds.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "String to send (newline appended automatically)" },
        port: { type: "string", description: "Serial port, e.g. COM3 or /dev/ttyUSB0. If omitted, PlatformIO auto-detects." },
        baud: { type: "string", description: "Baud rate (default: 115200)" },
        duration: { type: "string", description: "Seconds to wait for response (default: 3)" },
      },
      required: ["data"],
    },
  },
  {
    name: "kicad_drc",
    description: "Run KiCad Design Rule Check (DRC) on a PCB file. Returns violations and errors. Requires KiCad CLI installed.",
    input_schema: {
      type: "object",
      properties: {
        pcb_file: { type: "string", description: "Relative path to the .kicad_pcb file (default: board.kicad_pcb)" },
      },
      required: [],
    },
  },
  {
    name: "kicad_export_netlist",
    description: "Export a netlist from a KiCad schematic file. Returns the netlist content.",
    input_schema: {
      type: "object",
      properties: {
        sch_file: { type: "string", description: "Relative path to the .kicad_sch file (default: schematic.kicad_sch)" },
        format: { type: "string", description: "Netlist format: kicadxml, spice, cadstar, orcadpcb2 (default: kicadxml)" },
      },
      required: [],
    },
  },
  {
    name: "kicad_export_svg",
    description: "Export a schematic or PCB to SVG for inspection. Returns file path of exported SVG.",
    input_schema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Relative path to .kicad_sch or .kicad_pcb file" },
      },
      required: ["file"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for documentation, error messages, datasheets, Arduino libraries, or anything else. Returns Google results (title + snippet + URL) via Serper. Use this BEFORE web_fetch to find relevant URLs, then use web_fetch to read the full page.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query, e.g. 'ESP32 SPI OLED SSD1306 Arduino example'" },
        num_results: { type: "string", description: "Number of results to return (default: 5, max: 10)" },
        type: { type: "string", description: "Search type: 'search' (default), 'news', 'images'", enum: ["search", "news", "images"] },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description: "Fetch the full content of a URL and return its readable text. Use this to read documentation pages, datasheets, GitHub READMEs, forum answers, or any webpage after finding it with web_search.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to fetch, e.g. 'https://docs.arduino.cc/libraries/wifi/'" },
        max_chars: { type: "string", description: "Max characters to return (default: 8000, max: 20000)" },
      },
      required: ["url"],
    },
  },
  {
    name: "todo",
    description: "Manage a task list for the current session. Use this to plan multi-step work, track progress, and stay organised. Call with action='set' to replace the full list, 'add' to append a task, 'complete' to mark done, 'list' to read current tasks.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "One of: list, add, complete, set, clear", enum: ["list", "add", "complete", "set", "clear"] },
        task:   { type: "string", description: "Task description (for add/complete actions)" },
        tasks:  { type: "string", description: "JSON array of task strings (for set action), e.g. '[\"Read main.cpp\",\"Fix bug\",\"Flash board\"]'" },
      },
      required: ["action"],
    },
  },
];

// ── Tool executor ───────────────────────────────────────────────────────────
export async function executeTool(
  name: string,
  input: Record<string, string>,
  projectId: string
): Promise<ToolResult> {
  try {
    const content = await runTool(name, input, projectId);
    return { type: "tool_result", name, content };
  } catch (e) {
    return { type: "tool_result", name, content: `Error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}

async function runTool(name: string, input: Record<string, string>, projectId: string): Promise<string> {
  const projectDir = getProjectPath(projectId);

  switch (name) {
    case "search_codebase": {
      const q    = input.query?.trim();
      const mode = (input.mode ?? "hybrid") as "hybrid" | "semantic" | "text";
      if (!q) return "No query provided.";

      const count = getChunkCount(projectId);
      if (count === 0) {
        return "Codebase not indexed yet. Use the Index button in the toolbar or call index endpoint first.";
      }

      let results;
      if (mode === "text")     results = searchText(projectId, q);
      else if (mode === "semantic") results = await searchSemantic(projectId, q);
      else                     results = await searchHybrid(projectId, q);

      if (!results.length) return `No results found for "${q}" in ${count} indexed chunks.`;

      const lines = results.map((r, i) =>
        `[${i + 1}] ${r.filePath} lines ${r.startLine}-${r.endLine} (score: ${r.score})\n${r.content.trim().slice(0, 400)}`
      );
      return `Found ${results.length} result(s) for "${q}":\n\n${lines.join("\n\n---\n\n")}`;
    }

    case "read_file": {
      const path = safePath(projectId, input.path);
      const content = await readFile(path, "utf-8");
      return content.length > 20000
        ? content.slice(0, 20000) + `\n\n[truncated — ${content.length} total chars]`
        : content;
    }

    case "write_file": {
      const path = safePath(projectId, input.path);
      mkdirSync(dirname(path), { recursive: true });
      await writeFile(path, input.content, "utf-8");
      return `Written ${input.content.split("\n").length} lines to ${input.path}`;
    }

    case "edit_file": {
      const path = safePath(projectId, input.path);
      const original = await readFile(path, "utf-8");
      if (!original.includes(input.old_string)) {
        throw new Error(`old_string not found in ${input.path}. Read the file first and use exact text.`);
      }
      const updated = original.replace(input.old_string, input.new_string);
      await writeFile(path, updated, "utf-8");
      return `Edited ${input.path} — replaced ${input.old_string.split("\n").length} line(s)`;
    }

    case "list_files": {
      const dir = input.dir ? safePath(projectId, input.dir) : projectDir;
      return await listDirTree(dir, dir, 0, 3);
    }

    case "search_files": {
      const dir = input.dir ? safePath(projectId, input.dir) : projectDir;
      const fileGlob = input.file_pattern ?? "*";
      const { stdout } = await execAsync(
        `grep -rn --include="${fileGlob}" -E "${input.pattern.replace(/"/g, '\\"')}" .`,
        { cwd: dir, timeout: 10000 }
      ).catch((e) => ({ stdout: e.stdout ?? "" }));
      return stdout.trim() || "No matches found.";
    }

    case "run_bash": {
      // Block obviously dangerous commands
      const blocked = ["rm -rf /", ":(){ :|:& };:", "mkfs", "dd if=/dev/zero"];
      if (blocked.some((b) => input.command.includes(b))) {
        throw new Error("Command blocked for safety.");
      }
      const { stdout, stderr } = await execAsync(input.command, {
        cwd: projectDir,
        timeout: 30000,
      });
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      return out.slice(0, 8000) || "(no output)";
    }

    case "flash_board": {
      const args = ["pio", "run", "--target", "upload"];
      if (input.env) args.push("-e", input.env);
      if (input.port) args.push("--upload-port", input.port);
      const { stdout, stderr } = await execAsync(args.join(" "), {
        cwd: projectDir,
        timeout: 120000,
      });
      return [stdout, stderr].filter(Boolean).join("\n").trim().slice(0, 6000);
    }

    case "git_status": {
      const { getStatus } = await import("../git-service");
      const s = await getStatus(projectId);
      if (!s.isRepo) return "Not a git repository. Use the Git panel to initialize one.";
      return [
        `Branch: ${s.branch}${s.tracking ? ` → ${s.tracking}` : ""}`,
        s.ahead || s.behind ? `Ahead: ${s.ahead}, Behind: ${s.behind}` : "Up to date",
        s.staged.length ? `Staged (${s.staged.length}): ${s.staged.map((f) => f.path).join(", ")}` : "Nothing staged",
        s.unstaged.length ? `Unstaged (${s.unstaged.length}): ${s.unstaged.map((f) => f.path).join(", ")}` : "",
        s.untracked.length ? `Untracked (${s.untracked.length}): ${s.untracked.join(", ")}` : "",
      ].filter(Boolean).join("\n");
    }

    case "git_commit": {
      const g = (await import("../git-service")).git(projectId);
      await g.add(".");
      const result = await g.commit(input.message);
      return `Committed: ${result.commit} — "${input.message}"`;
    }

    case "read_serial": {
      const duration = Math.min(parseInt(input.duration ?? "5", 10), 30);
      const baud = input.baud ?? "115200";
      const output = await captureSerial({ port: input.port, baud, duration, projectDir });
      return output;
    }

    case "serial_send": {
      const duration = Math.min(parseInt(input.duration ?? "3", 10), 15);
      const baud = input.baud ?? "115200";
      // Send the data first via Python pyserial (bundled with PlatformIO), then capture response
      const sendScript = `
import serial, sys, time
port = ${input.port ? `"${input.port}"` : "None"}
if port is None:
    # Try to auto-detect via pio
    import subprocess, json
    try:
        out = subprocess.check_output(["pio", "device", "list", "--json-output"], timeout=5).decode()
        devs = json.loads(out)
        if devs: port = devs[0].get("port", "/dev/ttyUSB0")
    except: port = "/dev/ttyUSB0"
s = serial.Serial(port, ${baud}, timeout=1)
time.sleep(0.1)
s.write(b"${input.data.replace(/"/g, '\\"')}\\n")
time.sleep(0.2)
response = b""
deadline = time.time() + ${duration}
while time.time() < deadline:
    chunk = s.read(s.in_waiting or 1)
    if chunk: response += chunk
s.close()
print(response.decode("utf-8", errors="replace"))
`.trim();
      try {
        const { stdout, stderr } = await execAsync(
          `python -c "${sendScript.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`,
          { cwd: projectDir, timeout: (duration + 5) * 1000 }
        );
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return out || `Sent "${input.data}" — no response captured in ${duration}s`;
      } catch {
        // Fallback: use pio device monitor with filter
        const output = await captureSerial({ port: input.port, baud, duration, projectDir, sendData: input.data });
        return output;
      }
    }

    case "kicad_drc": {
      const pcbFile = input.pcb_file ?? "board.kicad_pcb";
      const pcbPath = safePath(projectId, pcbFile);
      const outputPath = safePath(projectId, "drc_report.json");
      try {
        const { stdout, stderr } = await execAsync(
          `kicad-cli pcb drc --output "${outputPath}" --format json "${pcbPath}"`,
          { cwd: projectDir, timeout: 30000 }
        );
        const report = await readFile(outputPath, "utf-8").catch(() => "");
        if (report) {
          const json = JSON.parse(report);
          const violations = json.violations ?? [];
          if (violations.length === 0) return "✅ DRC passed — no violations found.";
          return `DRC found ${violations.length} violation(s):\n${violations.slice(0, 20).map((v: { description?: string; severity?: string }) => `• [${v.severity ?? "error"}] ${v.description ?? JSON.stringify(v)}`).join("\n")}`;
        }
        return [stdout, stderr].filter(Boolean).join("\n").slice(0, 3000) || "DRC completed (no output).";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found") || msg.includes("ENOENT")) {
          return "KiCad CLI not found. Install KiCad from kicad.org and ensure 'kicad-cli' is in your PATH. The schematic/PCB files can still be edited as text by the AI agent.";
        }
        throw e;
      }
    }

    case "kicad_export_netlist": {
      const schFile = input.sch_file ?? "schematic.kicad_sch";
      const fmt = input.format ?? "kicadxml";
      const schPath = safePath(projectId, schFile);
      const outPath = safePath(projectId, `netlist.${fmt === "spice" ? "net" : "xml"}`);
      try {
        await execAsync(
          `kicad-cli sch export netlist --format ${fmt} --output "${outPath}" "${schPath}"`,
          { cwd: projectDir, timeout: 30000 }
        );
        const content = await readFile(outPath, "utf-8");
        return content.slice(0, 8000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found") || msg.includes("ENOENT")) {
          return "KiCad CLI not found. Install KiCad from kicad.org and ensure 'kicad-cli' is in your PATH.";
        }
        throw e;
      }
    }

    case "kicad_export_svg": {
      const filePath = safePath(projectId, input.file);
      const isSch = input.file.endsWith(".kicad_sch");
      const outDir = safePath(projectId, "exports");
      mkdirSync(outDir, { recursive: true });
      try {
        const cmd = isSch
          ? `kicad-cli sch export svg --output "${outDir}" "${filePath}"`
          : `kicad-cli pcb export svg --output "${outDir}" "${filePath}"`;
        await execAsync(cmd, { cwd: projectDir, timeout: 30000 });
        return `SVG exported to exports/ directory. Use read_file to inspect or serve the file.`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found") || msg.includes("ENOENT")) {
          return "KiCad CLI not found. Install KiCad from kicad.org and ensure 'kicad-cli' is in your PATH.";
        }
        throw e;
      }
    }

    case "web_search": {
      const query = input.query?.trim();
      if (!query) return "No search query provided.";
      const numResults = Math.min(parseInt(input.num_results ?? "5", 10), 10);
      const searchType = input.type ?? "search";

      // ── Tier 1: Serper (Google results, best quality) ───────────────────────
      const serperKey = process.env.SERPER_API_KEY;
      if (serperKey) {
        const endpoint = searchType === "news"
          ? "https://google.serper.dev/news"
          : "https://google.serper.dev/search";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: numResults }),
        });
        if (res.ok) {
          const data = await res.json() as {
            organic?: Array<{ title: string; snippet?: string; link: string; position?: number }>;
            news?: Array<{ title: string; snippet?: string; link: string; date?: string }>;
            answerBox?: { answer?: string; snippet?: string; title?: string };
            knowledgeGraph?: { title?: string; description?: string };
          };
          const sections: string[] = [];

          // Answer box (direct answer from Google)
          if (data.answerBox?.answer || data.answerBox?.snippet) {
            sections.push(`⚡ Answer: ${data.answerBox.answer ?? data.answerBox.snippet}`);
          }
          // Knowledge graph
          if (data.knowledgeGraph?.description) {
            sections.push(`📖 ${data.knowledgeGraph.title}: ${data.knowledgeGraph.description}`);
          }
          // Organic / news results
          const items = (searchType === "news" ? data.news : data.organic) ?? [];
          if (items.length) {
            const lines = items.slice(0, numResults).map((r, i) => {
              const dateStr = "date" in r && r.date ? ` (${r.date})` : "";
              return `[${i + 1}] ${r.title}${dateStr}\n    ${r.snippet ?? "(no snippet)"}\n    🔗 ${r.link}`;
            });
            sections.push(lines.join("\n\n"));
          }
          if (sections.length) {
            return `🔍 Google results for "${query}":\n\n${sections.join("\n\n---\n\n")}`;
          }
        }
      }

      // ── Tier 2: Brave Search API ────────────────────────────────────────────
      const braveKey = process.env.BRAVE_SEARCH_API_KEY;
      if (braveKey) {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;
        const res = await fetch(url, {
          headers: { "Accept": "application/json", "X-Subscription-Token": braveKey },
        });
        if (res.ok) {
          const data = await res.json() as {
            web?: { results?: Array<{ title: string; description?: string; url: string }> };
          };
          const results = data.web?.results ?? [];
          if (results.length) {
            const lines = results.slice(0, numResults).map((r, i) =>
              `[${i + 1}] ${r.title}\n    ${r.description ?? "(no snippet)"}\n    🔗 ${r.url}`
            );
            return `🔍 Brave results for "${query}":\n\n${lines.join("\n\n")}`;
          }
        }
      }

      // ── Tier 3: DuckDuckGo Instant Answers (no key) ────────────────────────
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const ddgRes = await fetch(ddgUrl, { headers: { "User-Agent": "Edge-Lab-IDE/1.0" } });
      if (!ddgRes.ok) throw new Error(`Search API error: ${ddgRes.status}`);
      const ddg = await ddgRes.json() as {
        AbstractText?: string; AbstractURL?: string; AbstractSource?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
        Answer?: string;
      };

      const sections: string[] = [];
      if (ddg.Answer) sections.push(`⚡ Instant Answer: ${ddg.Answer}`);
      if (ddg.AbstractText) sections.push(`📖 ${ddg.AbstractSource}: ${ddg.AbstractText.slice(0, 500)}\n   🔗 ${ddg.AbstractURL}`);

      const topics: string[] = [];
      for (const t of ddg.RelatedTopics ?? []) {
        if (topics.length >= numResults) break;
        if (t.Text && t.FirstURL) topics.push(`• ${t.Text.slice(0, 200)}\n  🔗 ${t.FirstURL}`);
        for (const sub of t.Topics ?? []) {
          if (topics.length >= numResults) break;
          if (sub.Text && sub.FirstURL) topics.push(`• ${sub.Text.slice(0, 200)}\n  🔗 ${sub.FirstURL}`);
        }
      }
      if (topics.length) sections.push(topics.join("\n\n"));

      if (!sections.length) {
        return `No results found for "${query}".\n💡 Add SERPER_API_KEY to .env for Google results (free tier: 2500 searches/mo at serper.dev).`;
      }
      return `🔍 DuckDuckGo results for "${query}":\n\n${sections.join("\n\n---\n\n")}\n\n💡 Add SERPER_API_KEY to .env for full Google results.`;
    }

    case "web_fetch": {
      const url = input.url?.trim();
      if (!url) return "No URL provided.";
      if (!/^https?:\/\//i.test(url)) return `Invalid URL: "${url}". Must start with http:// or https://`;
      const maxChars = Math.min(parseInt(input.max_chars ?? "8000", 10), 20000);

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Edge-Lab-IDE/1.0; +https://github.com/CoderVLSI/Edge_Lab)",
          "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return `HTTP ${res.status} ${res.statusText} — could not fetch ${url}`;

      const contentType = res.headers.get("content-type") ?? "";
      const rawText = await res.text();

      let text: string;
      if (contentType.includes("text/html") || rawText.trimStart().startsWith("<")) {
        // Strip HTML: remove scripts/styles, collapse tags to spaces, decode entities
        text = rawText
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[\s\S]*?<\/nav>/gi, "")
          .replace(/<footer[\s\S]*?<\/footer>/gi, "")
          .replace(/<header[\s\S]*?<\/header>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/?(p|div|h[1-6]|li|tr|section|article)[^>]*>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\t/g, "  ")
          .replace(/\n{3,}/g, "\n\n")  // collapse blank lines
          .trim();
      } else {
        text = rawText.trim();
      }

      const truncated = text.length > maxChars;
      const output = truncated ? text.slice(0, maxChars) : text;
      const suffix = truncated ? `\n\n[... truncated at ${maxChars} chars — ${text.length} total. Use max_chars=20000 for more.]` : "";

      return `📄 Content from ${url}:\n\n${output}${suffix}`;
    }

    case "todo": {
      // Per-project in-memory todo store (lives for server process lifetime)
      const list = getTodoList(projectId);
      const action = input.action;

      switch (action) {
        case "list": {
          if (!list.length) return "📋 Todo list is empty. Use action='add' or action='set' to add tasks.";
          const lines = list.map((t, i) => `${t.done ? "✅" : "⬜"} ${i + 1}. ${t.task}`);
          const done = list.filter((t) => t.done).length;
          return `📋 Todo list (${done}/${list.length} done):\n${lines.join("\n")}`;
        }
        case "add": {
          if (!input.task) return "Error: 'task' is required for action='add'";
          list.push({ task: input.task, done: false });
          setTodoList(projectId, list);
          return `✅ Added task ${list.length}: "${input.task}"\n\nCurrent list:\n${list.map((t, i) => `${t.done ? "✅" : "⬜"} ${i + 1}. ${t.task}`).join("\n")}`;
        }
        case "complete": {
          if (!input.task) return "Error: 'task' is required for action='complete' (provide the task name or number)";
          // Match by number or substring
          const idx = /^\d+$/.test(input.task.trim())
            ? parseInt(input.task.trim(), 10) - 1
            : list.findIndex((t) => t.task.toLowerCase().includes(input.task.toLowerCase()));
          if (idx < 0 || idx >= list.length) return `Task not found: "${input.task}". Use action='list' to see current tasks.`;
          list[idx].done = true;
          setTodoList(projectId, list);
          const done = list.filter((t) => t.done).length;
          return `✅ Marked done: "${list[idx].task}" (${done}/${list.length} complete)\n\n${list.map((t, i) => `${t.done ? "✅" : "⬜"} ${i + 1}. ${t.task}`).join("\n")}`;
        }
        case "set": {
          if (!input.tasks) return "Error: 'tasks' is required for action='set' (JSON array of strings)";
          let taskNames: string[];
          try {
            taskNames = JSON.parse(input.tasks);
            if (!Array.isArray(taskNames)) throw new Error("Not an array");
          } catch {
            return `Error: 'tasks' must be a JSON array, e.g. '["Task 1", "Task 2"]'. Got: ${input.tasks}`;
          }
          const newList = taskNames.map((t) => ({ task: String(t), done: false }));
          setTodoList(projectId, newList);
          return `📋 Todo list set (${newList.length} tasks):\n${newList.map((t, i) => `⬜ ${i + 1}. ${t.task}`).join("\n")}`;
        }
        case "clear": {
          setTodoList(projectId, []);
          return "🗑️ Todo list cleared.";
        }
        default:
          return `Unknown action: "${action}". Use: list, add, complete, set, or clear.`;
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── In-memory todo store (per project, per server process) ──────────────────
interface TodoItem { task: string; done: boolean; }
const todoStore = new Map<string, TodoItem[]>();
function getTodoList(projectId: string): TodoItem[] {
  if (!todoStore.has(projectId)) todoStore.set(projectId, []);
  return todoStore.get(projectId)!;
}
function setTodoList(projectId: string, list: TodoItem[]): void {
  todoStore.set(projectId, list);
}

/**
 * Spawn `pio device monitor` and capture output for `duration` seconds.
 * Works on Windows (COM ports) and Unix (/dev/tty*).
 * Optionally sends a string before reading.
 */
async function captureSerial({
  port,
  baud = "115200",
  duration = 5,
  projectDir,
  sendData,
}: {
  port?: string;
  baud?: string;
  duration?: number;
  projectDir: string;
  sendData?: string;
}): Promise<string> {
  return new Promise((resolve) => {
    const args = ["device", "monitor", "--baud", baud, "--filter", "time"];
    if (port) args.push("--port", port);

    const proc = spawn("pio", args, { cwd: projectDir, shell: true });
    let output = "";
    let lines = 0;

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      lines += text.split("\n").length;
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      // PIO prints connection info to stderr — include if no stdout yet
      if (!output) output += `[info] ${text}`;
    });

    // Optionally send data after 300ms (give board time to boot)
    if (sendData) {
      setTimeout(() => {
        proc.stdin.write(sendData + "\n");
      }, 300);
    }

    // Kill after duration
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
    }, duration * 1000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const trimmed = output.trim();
      if (!trimmed) {
        resolve(
          code === null
            ? `No serial output captured in ${duration}s. Check: board is connected, port is correct, baud rate matches Serial.begin() in firmware.`
            : `Serial monitor exited (code ${code}). No board output captured. Is a board connected?`
        );
      } else {
        const lineCount = trimmed.split("\n").length;
        resolve(`Captured ${lineCount} line(s) in ${duration}s:\n\n${trimmed.slice(0, 6000)}`);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        resolve("PlatformIO (pio) not found. Install from platformio.org and ensure it is in your PATH.");
      } else {
        resolve(`Error starting serial monitor: ${err.message}`);
      }
    });
  });
}

async function listDirTree(base: string, dir: string, depth: number, maxDepth: number): Promise<string> {
  if (depth > maxDepth) return "";
  const entries = await readdir(dir, { withFileTypes: true });
  const lines: string[] = [];
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === ".pio") continue;
    const indent = "  ".repeat(depth);
    const rel = relative(base, join(dir, e.name));
    if (e.isDirectory()) {
      lines.push(`${indent}📁 ${rel}/`);
      lines.push(await listDirTree(base, join(dir, e.name), depth + 1, maxDepth));
    } else {
      lines.push(`${indent}📄 ${rel}`);
    }
  }
  return lines.filter(Boolean).join("\n");
}
