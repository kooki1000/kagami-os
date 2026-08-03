import type { CSSProperties } from "react";
import type { FsNode } from "@/system/fs/types";
import { createElement } from "react";
import { nodeIcon, nodeIconColor } from "./fileMeta";

/**
 * Renders the icon for a node — the single render point for both the
 * mime-derived default and a user's custom glyph/tint, shared by Files' grid
 * and list views, Quick Look, and the Desktop.
 */
export function NodeGlyph({ node, className, strokeWidth, style }: {
  node: FsNode;
  className?: string;
  strokeWidth?: number;
  /** Explicit pixel sizing (e.g. Desktop's U8 icon-size presets) — takes precedence over a `size-N` class in `className`. */
  style?: CSSProperties;
}) {
  // A tint is an inline `color`, so it beats the caller's `text-accent` /
  // `text-ink-2` class without every call site needing to know about it.
  const tint = nodeIconColor(node);
  return createElement(nodeIcon(node), {
    className,
    strokeWidth,
    style: tint ? { ...style, color: tint } : style,
  });
}
