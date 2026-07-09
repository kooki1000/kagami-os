import type { FsNode } from "@/system/fs/types";
import { createElement } from "react";
import { nodeIcon } from "./fileMeta";

/** Renders the type-appropriate icon for a node. */
export function NodeGlyph({ node, className, strokeWidth }: {
  node: FsNode;
  className?: string;
  strokeWidth?: number;
}) {
  return createElement(nodeIcon(node), { className, strokeWidth });
}
