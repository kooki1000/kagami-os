import type { CSSProperties } from "react";
import type { FsNode } from "@/system/fs/types";
import { createElement } from "react";
import { nodeIcon } from "./fileMeta";

/** Renders the type-appropriate icon for a node. */
export function NodeGlyph({ node, className, strokeWidth, style }: {
  node: FsNode;
  className?: string;
  strokeWidth?: number;
  /** Explicit pixel sizing (e.g. Desktop's U8 icon-size presets) — takes precedence over a `size-N` class in `className`. */
  style?: CSSProperties;
}) {
  return createElement(nodeIcon(node), { className, strokeWidth, style });
}
