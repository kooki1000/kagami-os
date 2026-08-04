import type { FsNode } from "./types";

/**
 * Extension → mime type, and how to decide what type a node *really* is.
 *
 * `FsNode.mimeType` is written once, at creation, by creators that disagree:
 * uploads take the browser's `File.type` (empty for `.py`/`.rs`/`.toml`, and
 * `video/mp2t` — the MPEG transport stream — for `.ts` in Chromium), downloads
 * carry no type at all. Resolving at *read* time (`effectiveMimeType`) rather
 * than migrating the disk fixes files saved wrong by older builds, with no
 * schema version. `ARCHITECTURE.md`'s VFS section has the longer account.
 */

export const MIME_BY_EXTENSION: Record<string, string> = {
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
 * A filename's lowercased extension, or `""`. One definition, because two
 * copies of the edge rules drift: a leading dot is a name (`.gitignore` is a
 * file called "gitignore"), a trailing dot names nothing, and the leaf comes
 * first so a folder called `assets.d` doesn't make `assets.d/main` look like
 * it has a `.d/main` extension.
 */
export function extensionOf(filename: string): string {
  const name = filename.slice(filename.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 || dot === name.length - 1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The mime type a filename implies, or {@link FALLBACK_MIME_TYPE}. */
export function mimeTypeForFilename(filename: string): string {
  return MIME_BY_EXTENSION[extensionOf(filename)] ?? FALLBACK_MIME_TYPE;
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
  return isTextLikeMime(mime) ? mime : "text/plain";
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
 * editors should all believe.
 *
 * A file's extension is the user's own statement of what it is, so a name that
 * says something specific beats a stored type that says something else — which
 * is what rescues an `app.ts` the browser insisted was `video/mp2t`, and what
 * makes renaming behave the way a desktop should.
 *
 * `text/plain` is the one derived type that doesn't get to overrule another
 * text type, because it means "just text" rather than anything specific: a
 * `.txt` note saved as `text/markdown` stays markdown. It still overrules a
 * binary type, so renaming an image to `.txt` does what it looks like.
 *
 * The rename case is why the name wins rather than merely filling gaps: the
 * editor creates files as `untitled.txt` and immediately invites a rename, and
 * `main.ts` has to stop being plain text the moment it is called that.
 */
export function effectiveMimeType(node: Pick<FsNode, "name" | "mimeType">): string {
  const stored = node.mimeType?.trim() ?? "";
  const derived = mimeTypeForFilename(node.name);
  if (stored === "" || stored === FALLBACK_MIME_TYPE)
    return derived;
  if (derived === FALLBACK_MIME_TYPE || derived === stored)
    return stored;
  if (derived === "text/plain" && isTextLikeMime(stored))
    return stored;
  return derived;
}

/** Is this node a file whose bytes an editor can open as text? */
export function isTextFile(node: Pick<FsNode, "type" | "name" | "mimeType">): boolean {
  return node.type === "file" && isTextLikeMime(effectiveMimeType(node));
}
