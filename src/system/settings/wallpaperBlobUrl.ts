import type { BlobStore, FsNode } from "@/system/fs/types";
import { useSyncExternalStore } from "react";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";

/**
 * U1's custom wallpaper: blob-URL lifetime management independent of any
 * component. The wallpaper is applied at the `<html>` level in App.tsx, not
 * inside a mounted component subtree, so `useBlobUrl`'s revoke-on-unmount
 * doesn't fit here — this module owns two slots (light/dark theme) itself,
 * creating an object URL when a file is chosen and revoking only when that
 * slot's file changes or is cleared.
 */
export type WallpaperSlot = "light" | "dark";

export interface ResolvedWallpaperUrl {
  url: string;
  /** Whether `url` was created via `URL.createObjectURL` (needs revoking) vs. an inline `data:` URL (doesn't). */
  isObjectUrl: boolean;
}

/**
 * Resolves one wallpaper `FsNode` to a URL usable directly in CSS
 * `background: url(...)` — an existing inline data URL as-is (no store
 * round trip needed), or a fresh object URL for blob-backed bytes. Returns
 * `null` for a missing node, a folder, or a blob that's no longer in the
 * store. Pure aside from the injected `store` read — no caching or
 * lifetime decisions here, see `ensureWallpaperUrl` below for that.
 */
export async function resolveWallpaperUrl(
  node: FsNode | undefined,
  store: BlobStore,
): Promise<ResolvedWallpaperUrl | null> {
  if (!node || node.type !== "file")
    return null;
  if (node.content)
    return { url: node.content, isObjectUrl: false };
  if (node.contentRef) {
    const blob = await store.get(node.contentRef.hash);
    if (!blob)
      return null;
    return { url: URL.createObjectURL(blob), isObjectUrl: true };
  }
  return null;
}

interface SlotState {
  /** The VFS file id this slot's `url` was last resolved for (or requested for, while resolving). */
  fileId: string | null;
  url: string | null;
  isObjectUrl: boolean;
}

function emptySlot(): SlotState {
  return { fileId: null, url: null, isObjectUrl: false };
}

const slots: Record<WallpaperSlot, SlotState> = {
  light: emptySlot(),
  dark: emptySlot(),
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(listener => listener());
}

export function subscribeWallpaperUrl(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The currently resolved URL for a slot, or `null` if none is set (or still resolving). */
export function getWallpaperUrl(slot: WallpaperSlot): string | null {
  return slots[slot].url;
}

function revokeSlot(slot: WallpaperSlot): void {
  const s = slots[slot];
  if (s.isObjectUrl && s.url)
    URL.revokeObjectURL(s.url);
}

/**
 * Ensures `slot`'s cached URL matches `fileId` — resolves fresh bytes when
 * the target changed, revokes the previous object URL (never a plain
 * `data:` URL) only once the replacement is ready, and no-ops when `fileId`
 * already matches the last call for this slot (including a call that's
 * still in flight for the same target).
 *
 * Ownership is independent of any component mount: nothing here revokes on
 * unmount, since nothing "owns" a mount for a wallpaper applied on
 * `<html>` — only a later `ensureWallpaperUrl` call for the same slot (a
 * different file, or `null` to clear) ever revokes.
 */
export async function ensureWallpaperUrl(slot: WallpaperSlot, fileId: string | null): Promise<void> {
  if (slots[slot].fileId === fileId)
    return;
  // Marks the in-flight target immediately so a second call for the same
  // fileId (fired before this one resolves) short-circuits above instead of
  // doing a redundant resolve.
  slots[slot] = { ...slots[slot], fileId };

  if (!fileId) {
    revokeSlot(slot);
    slots[slot] = emptySlot();
    notify();
    return;
  }

  const node = useFsStore.getState().nodes[fileId];
  const resolved = await resolveWallpaperUrl(node, blobStore);

  // A newer call may have retargeted this slot while we awaited the blob
  // store — only the latest request for a slot may commit its result; an
  // overtaken one revokes whatever it just created and gets out of the way.
  if (slots[slot].fileId !== fileId) {
    if (resolved?.isObjectUrl)
      URL.revokeObjectURL(resolved.url);
    return;
  }

  revokeSlot(slot);
  slots[slot] = resolved
    ? { fileId, url: resolved.url, isObjectUrl: resolved.isObjectUrl }
    : { fileId, url: null, isObjectUrl: false };
  notify();
}

/** Reactive read of a slot's resolved URL — re-renders when `ensureWallpaperUrl` settles. */
export function useWallpaperUrl(slot: WallpaperSlot): string | null {
  return useSyncExternalStore(subscribeWallpaperUrl, () => getWallpaperUrl(slot));
}

/** Test-only: resets module state between tests — there's no component unmount to rely on here. */
export function __resetWallpaperBlobUrlForTest(): void {
  (["light", "dark"] as const).forEach((slot) => {
    revokeSlot(slot);
    slots[slot] = emptySlot();
  });
  listeners.clear();
}
