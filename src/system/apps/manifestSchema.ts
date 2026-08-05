/**
 * Step 17 (D8) — the shape of a third-party app's `manifest.json`, and a
 * pure, fail-closed parser for it. Mirrors `sandbox/rpc.ts`'s
 * `parseSandboxRequest` convention: untrusted input in, `null` out on
 * anything malformed, never a thrown exception. Nothing here talks to the
 * VFS or the dynamic registry (D8.4) — this module only answers "is this a
 * well-formed manifest," not "should it be installed."
 */

/** A third-party app bundle's own declared identity and requirements. */
export interface AppBundleManifest {
  /**
   * Becomes both the bundle's folder name under `/Apps` and its registry
   * key, so it's held to a stricter, predictable character set than a
   * user-facing file name (`isValidBundleName` below) — not because
   * Kagami's VFS resolves paths from strings (it addresses nodes by
   * id/parentId, so a name like `".."` can't actually escape anything
   * here), but because this string doubles as an identifier other systems
   * key off of.
   */
  id: string;
  name: string;
  version: string;
  /**
   * The bundle's single self-contained entry file's name (an `entry.html`
   * or `entry.js` the app author has already inlined their own CSS/JS
   * into — not a path into a multi-file resource tree). Same character
   * restriction as `id`.
   */
  entry: string;
  /** Opaque to this schema — how it's rendered is D8.4's concern. */
  icon?: string;
  /** Raw capability strings, same vocabulary `sandbox/capabilities.ts` checks. */
  capabilities: string[];
  minShellVersion?: string;
}

/**
 * Non-empty, no surrounding whitespace, no `/`/`\`, capped at a sane length —
 * safe as both a bare VFS node name and a cross-system identifier.
 */
function isValidBundleName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value && !/[/\\]/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates and narrows an arbitrary parsed-JSON value into an
 * `AppBundleManifest`. Fails closed: any missing/mistyped/unsafe field
 * returns `null` rather than a partially-trusted object.
 */
export function parseAppManifest(raw: unknown): AppBundleManifest | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const obj = raw as Record<string, unknown>;

  if (!isValidBundleName(obj.id) || !isNonEmptyString(obj.name) || !isNonEmptyString(obj.version) || !isValidBundleName(obj.entry))
    return null;
  if (obj.icon !== undefined && typeof obj.icon !== "string")
    return null;
  if (obj.minShellVersion !== undefined && typeof obj.minShellVersion !== "string")
    return null;
  if (!Array.isArray(obj.capabilities) || !obj.capabilities.every(cap => typeof cap === "string"))
    return null;

  return {
    id: obj.id,
    name: obj.name,
    version: obj.version,
    entry: obj.entry,
    icon: obj.icon,
    capabilities: obj.capabilities,
    minShellVersion: obj.minShellVersion,
  };
}
