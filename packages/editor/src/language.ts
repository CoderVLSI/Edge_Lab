import { type Extension } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";

const EXT_MAP: Record<string, () => Extension> = {
  cpp: cpp,
  c: cpp,
  h: cpp,
  hpp: cpp,
  py: python,
  js: () => javascript({ jsx: true }),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ jsx: false, typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  rs: rust,
  ino: cpp,  // Arduino sketches are C++
};

export function getLanguageExtension(filename: string): Extension | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext]?.() ?? null;
}

export function getLanguageId(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    cpp: "cpp", c: "c", h: "cpp", hpp: "cpp",
    py: "python",
    js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescriptreact",
    rs: "rust",
    ino: "cpp",
  };
  return map[ext] ?? "plaintext";
}
