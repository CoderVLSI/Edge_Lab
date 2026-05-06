"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import { cn } from "../lib/utils";

export interface FileTreeNode {
  id: string;
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

interface FileTreeProps {
  nodes: FileTreeNode[];
  onSelect?: (node: FileTreeNode) => void;
  selectedId?: string;
  className?: string;
}

export function FileTree({ nodes, onSelect, selectedId, className }: FileTreeProps) {
  return (
    <div className={cn("py-1 text-sm", className)} style={{ fontSize: 12, lineHeight: 1.4 }}>
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} onSelect={onSelect} selectedId={selectedId} depth={0} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  onSelect,
  selectedId,
  depth,
}: {
  node: FileTreeNode;
  onSelect?: (node: FileTreeNode) => void;
  selectedId?: string;
  depth: number;
}) {
  const [open, setOpen] = React.useState(true);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "cursor-pointer hover:bg-zinc-800",
          isSelected && "bg-zinc-700 text-white"
        )}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minHeight: 24,
          padding: "2px 8px",
          paddingLeft: `${8 + depth * 14}px`,
          borderRadius: 4,
          overflow: "hidden",
        }}
        onClick={() => {
          if (node.type === "directory") setOpen((o) => !o);
          onSelect?.(node);
        }}
      >
        {node.type === "directory" ? (
          <>
            {open ? (
              <ChevronDown size={13} className="shrink-0 text-zinc-400" />
            ) : (
              <ChevronRight size={13} className="shrink-0 text-zinc-400" />
            )}
            <Folder size={15} className="shrink-0 text-yellow-400" />
          </>
        ) : (
          <>
            <span style={{ width: 13, flexShrink: 0 }} />
            <File size={15} className="shrink-0 text-zinc-400" />
          </>
        )}
        <span
          className={cn("truncate", isSelected ? "text-white" : "text-zinc-300")}
          style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {node.name}
        </span>
      </div>
      {node.type === "directory" && open && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onSelect={onSelect}
              selectedId={selectedId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
