import type { FsNode } from "@/system/fs/types";
import { effectiveMimeType, isTextLikeMime } from "@/system/fs/mimeTypes";

/**
 * Which language a file is written in — the pure half of D4's highlighting.
 *
 * Split from the CodeMirror wiring (`languageSupport.ts`) so it unit-tests in
 * Vitest's `node` environment, the same split `documents/pageNav.ts` made for
 * the same reason. Nothing here imports CodeMirror.
 */

export type LanguageId
  = | "javascript" | "jsx" | "typescript" | "tsx"
    | "json" | "css" | "html" | "xml" | "python"
    | "yaml" | "shell" | "toml" | "sql" | "rust" | "go"
    | "plain";

export const LANGUAGE_LABELS: Record<LanguageId, string> = {
  javascript: "JavaScript",
  jsx: "JSX",
  typescript: "TypeScript",
  tsx: "TSX",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  xml: "XML",
  python: "Python",
  yaml: "YAML",
  shell: "Shell",
  toml: "TOML",
  sql: "SQL",
  rust: "Rust",
  go: "Go",
  plain: "Plain Text",
};

/**
 * Extension first, because it is the only thing that separates the dialects a
 * mime type lumps together: `.ts` and `.tsx` are both `text/typescript`, and
 * whether the parser expects JSX is not a detail the type carries.
 */
const LANGUAGE_BY_EXTENSION: Record<string, LanguageId> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  py: "python",
  yaml: "yaml",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  toml: "toml",
  sql: "sql",
  rs: "rust",
  go: "go",
};

/** The fallback path, for a file whose name says nothing (`Makefile`, `.env`). */
const LANGUAGE_BY_MIME: Record<string, LanguageId> = {
  "text/javascript": "javascript",
  "text/typescript": "typescript",
  "application/json": "json",
  "text/css": "css",
  "text/html": "html",
  "application/xml": "xml",
  "text/x-python": "python",
  "application/yaml": "yaml",
  "application/x-sh": "shell",
  "application/toml": "toml",
  "application/sql": "sql",
  "text/rust": "rust",
  "text/x-go": "go",
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 || dot === name.length - 1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function languageIdForNode(node: Pick<FsNode, "name" | "mimeType">): LanguageId {
  const byExtension = LANGUAGE_BY_EXTENSION[extensionOf(node.name)];
  if (byExtension)
    return byExtension;
  return LANGUAGE_BY_MIME[effectiveMimeType(node)] ?? "plain";
}

/**
 * Can the editor open this at all? Anything readable as text, which is wider
 * than what it highlights — a `.md` or a `.log` opens as plain text rather
 * than being refused. Which app opens it *by default* is a separate question,
 * answered by `system/apps/openFile.ts`.
 */
export function isEditableFile(node: Pick<FsNode, "type" | "name" | "mimeType">): boolean {
  return node.type === "file" && isTextLikeMime(effectiveMimeType(node));
}
