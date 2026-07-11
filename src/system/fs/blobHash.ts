/**
 * Content addressing for the blob store (B1): a blob's identity is the
 * SHA-256 of its bytes. Same bytes → same hash → stored once. Uses the Web
 * Crypto API, available in browsers and Node ≥ 20.
 */

/** Lowercase hex SHA-256 digest of the given bytes. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  // `crypto.subtle.digest` wants a plain-ArrayBuffer-backed BufferSource;
  // a Uint8Array can be SharedArrayBuffer-backed, so `slice()` gives us a
  // fresh, exactly-sized ArrayBuffer copy for that path.
  const input: ArrayBuffer = data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")).join("");
}

/** Content-addressed id for a blob. */
export async function hashBlob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}
