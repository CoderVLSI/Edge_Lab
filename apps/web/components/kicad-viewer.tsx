"use client";

/**
 * KiCanvas-backed viewer for .kicad_sch and .kicad_pcb files.
 * KiCanvas (kicanvas.org) renders KiCad files in the browser via a
 * Web Component (<kicanvas-embed>). We load it from CDN and feed it
 * a Blob URL generated from the current Y.Text content.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import type * as Y from "yjs";

// Tell TypeScript these custom elements exist
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "kicanvas-embed": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { controls?: boolean | "" }, HTMLElement>;
      "kicanvas-source": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { src?: string }, HTMLElement>;
    }
  }
}

const KICANVAS_CDN = "https://kicanvas.org/kicanvas/kicanvas.js";

function loadKiCanvas(): Promise<void> {
  if ((window as Window & { __kicanvas_loaded?: boolean }).__kicanvas_loaded) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${KICANVAS_CDN}"]`);
    if (existing) {
      // Already injected — wait for custom element registration
      const check = () => customElements.get("kicanvas-embed") ? resolve() : setTimeout(check, 50);
      check();
      return;
    }
    const script = document.createElement("script");
    script.src = KICANVAS_CDN;
    script.type = "module";
    script.onload = () => {
      // Give custom elements time to register
      const check = () => {
        if (customElements.get("kicanvas-embed")) {
          (window as Window & { __kicanvas_loaded?: boolean }).__kicanvas_loaded = true;
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    };
    document.head.appendChild(script);
  });
}

interface KiCanvasViewerProps {
  yText: Y.Text;
  filename: string;  // .kicad_sch or .kicad_pcb
}

export function KiCanvasViewer({ yText, filename }: KiCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKiCanvas()
      .then(() => setReady(true))
      .catch(() => setError("Failed to load KiCanvas viewer"));
  }, []);

  const render = useCallback(() => {
    if (!containerRef.current || !ready) return;

    const content = yText.toString().trim();
    if (!content) {
      containerRef.current.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:#52525b;font-size:13px;text-align:center;padding:24px">
          <div style="font-size:32px">📐</div>
          <div style="color:#a1a1aa;font-weight:500">${filename}</div>
          <div style="color:#52525b;font-size:12px;max-width:280px;line-height:1.6">
            This file is empty. Ask the AI agent to create a schematic for your project, or open an existing .kicad_sch file.
          </div>
        </div>`;
      return;
    }

    // Revoke previous blob
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);

    const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    // KiCanvas custom element — re-create to force refresh
    containerRef.current.innerHTML = "";
    const embed = document.createElement("kicanvas-embed") as HTMLElement & { controls: boolean };
    embed.setAttribute("controls", "");
    embed.style.cssText = "width:100%;height:100%;display:block;";

    const source = document.createElement("kicanvas-source");
    source.setAttribute("src", url);

    embed.appendChild(source);
    containerRef.current.appendChild(embed);
  }, [ready, yText, filename]);

  // Re-render when ready or file content changes
  useEffect(() => {
    render();
  }, [render]);

  // Also observe Y.Text changes so viewer auto-updates when AI edits the file
  useEffect(() => {
    const handler = () => render();
    yText.observe(handler);
    return () => yText.unobserve(handler);
  }, [yText, render]);

  // Cleanup blob on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#ef4444", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10, color: "#71717a", fontSize: 13 }}>
        <div style={{ width: 24, height: 24, border: "2px solid #3f3f46", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        Loading KiCanvas…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#0f0f1a", overflow: "hidden" }}
    />
  );
}
