import * as React from "react";
import { cn } from "../lib/utils";

interface ResizablePanelGroupProps {
  direction: "horizontal" | "vertical";
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanelGroup({ direction, children, className }: ResizablePanelGroupProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full",
        direction === "horizontal" ? "flex-row" : "flex-col",
        className
      )}
    >
      {children}
    </div>
  );
}

interface ResizablePanelProps {
  defaultSize?: number;
  minSize?: number;
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanel({ defaultSize = 50, children, className }: ResizablePanelProps) {
  return (
    <div
      className={cn("overflow-auto", className)}
      style={{ flex: `${defaultSize} 1 0%` }}
    >
      {children}
    </div>
  );
}

export function ResizableHandle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-zinc-800 hover:bg-blue-600 transition-colors cursor-col-resize w-1 shrink-0",
        className
      )}
    />
  );
}
