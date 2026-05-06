"use client";

/**
 * Lightweight drag-to-resize panel layout.
 * No external dependencies — just pointer events + CSS flex.
 */
import React, { useRef, useCallback, useEffect, useState } from "react";

interface PanelGroupProps {
  direction: "horizontal" | "vertical";
  children: React.ReactNode;
  className?: string;
  /** Initial sizes as percentages, must sum to ~100 */
  defaultSizes: number[];
  minSizes?: number[];
}

interface DragState {
  index: number;       // which handle (between panel index and index+1)
  startPos: number;
  startSizes: number[];
}

export function PanelGroup({ direction, children, className = "", defaultSizes, minSizes }: PanelGroupProps) {
  const [sizes, setSizes] = useState(defaultSizes);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const childArray = React.Children.toArray(children).filter(Boolean);
  // Interleave: panel, handle, panel, handle, panel ...
  // We expect the caller to pass only Panel children; we insert handles.

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const total = direction === "horizontal" ? rect.width : rect.height;
    const pos = direction === "horizontal" ? e.clientX - rect.left : e.clientY - rect.top;
    const delta = ((pos - drag.current.startPos) / total) * 100;

    setSizes((prev) => {
      const next = [...prev];
      const i = drag.current!.index;
      const mins = minSizes ?? prev.map(() => 10);
      const newA = drag.current!.startSizes[i] + delta;
      const newB = drag.current!.startSizes[i + 1] - delta;
      if (newA < mins[i] || newB < (mins[i + 1] ?? 10)) return prev;
      next[i] = newA;
      next[i + 1] = newB;
      return next;
    });
  }, [direction, minSizes]);

  const onMouseUp = useCallback(() => {
    drag.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function startDrag(index: number, e: React.MouseEvent) {
    e.preventDefault();
    drag.current = {
      index,
      startPos: direction === "horizontal" ? e.clientX : e.clientY,
      startSizes: [...sizes],
    };
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  const isH = direction === "horizontal";

  // Build interleaved output: panel[0], handle, panel[1], handle, panel[2]
  const elements: React.ReactNode[] = [];
  childArray.forEach((child, idx) => {
    elements.push(
      <div
        key={`panel-${idx}`}
        style={{ [isH ? "width" : "height"]: `${sizes[idx]}%`, flexShrink: 0 }}
        className={isH ? "h-full overflow-hidden" : "w-full overflow-hidden"}
      >
        {child}
      </div>
    );
    if (idx < childArray.length - 1) {
      elements.push(
        <div
          key={`handle-${idx}`}
          onMouseDown={(e) => startDrag(idx, e)}
          className={
            isH
              ? "w-[3px] shrink-0 h-full bg-zinc-800 hover:bg-blue-500 active:bg-blue-400 transition-colors cursor-col-resize z-10"
              : "h-[3px] shrink-0 w-full bg-zinc-800 hover:bg-blue-500 active:bg-blue-400 transition-colors cursor-row-resize z-10"
          }
        />
      );
    }
  });

  return (
    <div
      ref={containerRef}
      className={`flex ${isH ? "flex-row" : "flex-col"} h-full w-full overflow-hidden ${className}`}
    >
      {elements}
    </div>
  );
}
