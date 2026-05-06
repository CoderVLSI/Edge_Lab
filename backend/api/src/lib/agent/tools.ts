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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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
