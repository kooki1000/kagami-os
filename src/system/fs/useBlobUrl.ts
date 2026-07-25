import type { ContentRef } from "./types";
import { useEffect, useState } from "react";
import { blobStore } from "./blobStore";

export type BlobUrlStatus = "loading" | "ready" | "missing";

export interface BlobUrlResult {
  /** The object URL once resolved; `null` while loading or once resolved missing. */
  url: string | null;
  /**
   * "loading" until the lookup settles; "ready" once `url` is a live object
   * URL; "missing" if the blob store no longer has the hash (review-backlog
   * #18) — lets a caller distinguish "still coming" from "gone" instead of
   * both reading as an indefinite `null` forever.
   */
  status: BlobUrlStatus;
}

/**
 * Resolve a {@link ContentRef} to an object URL for `<img>` / `<video>` / etc.
 * `status` starts "loading" and settles to "ready" (with `url` set) or
 * "missing" (the hash isn't in the blob store). The URL is revoked when the
 * ref changes or the component unmounts, so callers don't leak. Keyed on the
 * content hash — a same-hash ref never re-fetches.
 */
export function useBlobUrl(ref: ContentRef | undefined): BlobUrlResult {
  const [state, setState] = useState<BlobUrlResult>({ url: null, status: "loading" });
  const hash = ref?.hash;

  useEffect(() => {
    // No ref: nothing to resolve. If `hash` just changed away from a real
    // value, the *previous* run's cleanup below already reset state to
    // "loading" — so there's nothing to do here, and nothing to call
    // setState with synchronously from the effect body itself.
    if (!hash)
      return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void blobStore.get(hash).then((blob) => {
      if (cancelled)
        return;
      if (!blob) {
        setState({ url: null, status: "missing" });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setState({ url: objectUrl, status: "ready" });
    });
    return () => {
      cancelled = true;
      if (objectUrl)
        URL.revokeObjectURL(objectUrl);
      setState({ url: null, status: "loading" });
    };
  }, [hash]);

  return state;
}
