import type { FsNode } from "./types";

/**
 * Extension → mime type, and how to decide what type a node *really* is.
 *
 * `FsNode.mimeType` is only ever written at creation, and every creator has a
 * different idea of the truth: uploads take the browser's `File.type` (empty
 * for `.py`/`.rs`/`.toml`, and `video/mp2t` for `.ts` in Chromium — the MPEG
 * transport stream, not TypeScript), downloads arrive as bytes with no type
 * attached at all, and the Terminal writes `text/plain` for everything. A node
 * whose stored type is wrong or missing can't be routed by "Open with", which
 * is why `.json` and `.ts` files were unopenable before this module existed.
 *
 * The fix is to resolve the type at *read* time (`effectiveMimeType`) rather
 * than migrate what's on disk — no version bump, and it corrects files that
 * were saved wrong long before this code shipped.
 *
 * This table started life inside the Browser app (U17's downloads) and moved
 * here when the code editor (D4) needed the same answers.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  // documents
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  // code — the D4 additions. `ts` is deliberately TypeScript rather than the
  // MPEG transport stream browsers report: this is a desktop with a code
  // editor in it, and nothing here plays video from a `.ts` file.
  js: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  mts: "text/typescript",
  cts: "text/typescript",
  json: "application/json",
  jsonc: "application/json",
  css: "text/css",
  scss: "text/x-scss",
  less: "text/x-less",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  py: "text/x-python",
  sh: "application/x-sh",
  bash: "application/x-sh",
  zsh: "application/x-sh",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  rs: "text/rust",
  go: "text/x-go",
  sql: "application/sql",
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  log: "text/plain",
  // images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  // audio and video
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  // archives
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
};

/** The generic "some bytes" type, for anything the table above doesn't name. */
export const FALLBACK_MIME_TYPE = "application/octet-stream";

/**
 * Text-ish types that don't live under `text/`. Everything here is safe to
 * read as UTF-8 and to hand to an editor; `application/octet-stream` and the
 * media types deliberately are not.
 */
const TEXT_LIKE_APPLICATION_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/toml",
  "application/sql",
  "application/x-sh",
  "application/javascript",
  "application/typescript",
  "application/ecmascript",
]);

/**
 * The mime type a filename implies, or {@link FALLBACK_MIME_TYPE}. A leading
 * dot is an extension-less name (`.gitignore` is a file called "gitignore",
 * not an extension), and a trailing dot names nothing at all.
 */
export function mimeTypeForFilename(filename: string): string {
  // Take the leaf first: the Terminal passes paths, and a folder called
  // `assets.d` would otherwise make `assets.d/main` look like a `.d/main`.
  const name = filename.slice(filename.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1)
    return FALLBACK_MIME_TYPE;
  return MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? FALLBACK_MIME_TYPE;
}

/**
 * The type for a file the caller already knows is text — the Terminal's
 * `touch` and `>` redirect. Falls back to `text/plain` rather than
 * `application/octet-stream`, because "some bytes" would make a file the
 * shell just wrote out of plain text unreadable to `cat` and uneditable in
 * both editors.
 */
export function textMimeTypeForFilename(filename: string): string {
  const mime = mimeTypeForFilename(filename);
  return mime !== FALLBACK_MIME_TYPE && isTextLikeMime(mime) ? mime : "text/plain";
}

/** Can this type be read as text — by an editor, `cat`, or search? */
export function isTextLikeMime(mime: string): boolean {
  if (mime.startsWith("text/"))
    return true;
  if (mime.endsWith("+json") || mime.endsWith("+xml"))
    return true;
  return TEXT_LIKE_APPLICATION_TYPES.has(mime);
}

/**
 * The type to route this node by — what "Open with", the kind label and the
 * editor should all believe.
 *
 * The stored type is trusted by default (the creator usually knew), with two
 * exceptions:
 *
 *  - it's missing, blank, or the generic `application/octet-stream`, in which
 *    case the name is all we have;
 *  - the name says text or code and the stored type says otherwise. That's
 *    the `.ts` → `video/mp2t` trap, and the empty `File.type` a browser gives
 *    for `.py`/`.rs`/`.toml`. A file's extension is the user's own statement
 *    of what it is, so it wins over a sniffed type that contradicts it —
 *    including after a rename, which is how a desktop is expected to behave.
 *
 * When both agree that it's text but disagree on which text (`.txt` saved as
 * `text/markdown`, say), the stored type stands: the distinction came from
 * whatever created the file, and the name can't improve on it.
 */
export function effectiveMimeType(node: Pick<FsNode, "name" | "mimeType">): string {
  const stored = node.mimeType?.trim() ?? "";
  const derived = mimeTypeForFilename(node.name);
  if (stored === "" || stored === FALLBACK_MIME_TYPE)
    return derived;
  if (derived !== FALLBACK_MIME_TYPE && isTextLikeMime(derived) && !isTextLikeMime(stored))
    return derived;
  return stored;
}
