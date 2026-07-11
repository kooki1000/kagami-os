import type { ContentRef } from "./types";
import { useEffect, useState } from "react";
import { blobStore } from "./blobStore";

/**
 * Resolve a {@link ContentRef} to an object URL for `<img>` / `<video>` / etc.
 * Returns `null` until the blob loads (or if it's missing). The URL is
 * revoked when the ref changes or the component unmounts, so callers don't
 * leak. Keyed on the content hash — a same-hash ref never re-fetches.
 */
export function useBlobUrl(ref: ContentRef | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const hash = ref?.hash;

  useEffect(() => {
    // No ref: state is already null (initial, or nulled by the previous
    // effect's cleanup when the hash changed), so nothing to do here.
    if (!hash)
      return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void blobStore.get(hash).then((blob) => {
      if (cancelled || !blob)
        return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl)
        URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [hash]);

  return url;
}
