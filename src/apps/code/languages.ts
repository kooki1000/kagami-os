import type { FsNode } from "@/system/fs/types";
import { effectiveMimeType, extensionOf, MIME_BY_EXTENSION } from "@/system/fs/mimeTypes";

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

/**
 * The fallback path, for a file named so vaguely that only its stored type
 * says anything (a `Makefile` saved as `text/x-makefile`). Derived from the
 * two tables above rather than hand-written a third time: the first extension
 * that produces a given mime type decides that type's language, so it can't
 * drift out of step with either.
 */
const LANGUAGE_BY_MIME: Partial<Record<string, LanguageId>> = Object.fromEntries(
  Object.entries(MIME_BY_EXTENSION)
    .map(([extension, mime]) => [mime, LANGUAGE_BY_EXTENSION[extension]])
    .filter(([, language]) => language !== undefined)
    .reverse(),
);

export function languageIdForNode(node: Pick<FsNode, "name" | "mimeType">): LanguageId {
  return LANGUAGE_BY_EXTENSION[extensionOf(node.name)]
    ?? LANGUAGE_BY_MIME[effectiveMimeType(node)]
    ?? "plain";
}
