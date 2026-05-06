import React, { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { yCollab } from "y-codemirror.next";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { getLanguageExtension } from "./language";

export interface CodeEditorProps {
  filename: string;
  yText: Y.Text;
  provider?: WebsocketProvider;
  lspExtension?: Extension;
  readOnly?: boolean;
  className?: string;
}

export function CodeEditor({
  filename,
  yText,
  provider,
  lspExtension,
  readOnly = false,
  className,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(filename);
    const extensions: Extension[] = [
      basicSetup,
      oneDark,
      keymap.of([...defaultKeymap, indentWithTab]),
      EditorView.theme({
        "&": { height: "100%", fontSize: "13px" },
        ".cm-scroller": { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", overflow: "auto" },
        ".cm-content": { caretColor: "#fff" },
      }),
    ];

    if (langExt) extensions.push(langExt);
    if (lspExtension) extensions.push(lspExtension);
    if (readOnly) extensions.push(EditorState.readOnly.of(true));

    // Bind to Yjs for CRDT sync
    extensions.push(
      yCollab(yText, provider?.awareness ?? null)
    );

    const view = new EditorView({
      state: EditorState.create({ doc: yText.toString(), extensions }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => view.destroy();
  // Re-mount only when file or sync target changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, yText, provider]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full overflow-hidden"}
      style={{ height: "100%", width: "100%", overflow: "hidden" }}
    />
  );
}
