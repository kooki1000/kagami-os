import { create } from "zustand";

export type ClipboardMode = "copy" | "cut";

interface ClipboardState {
  ids: string[];
  mode: ClipboardMode | null;
  setClipboard: (ids: string[], mode: ClipboardMode) => void;
  clear: () => void;
}

/**
 * Files' clipboard (B5) — session-scoped like the notification store, not
 * persisted: reloading the page or restarting the app clears it, matching
 * every native desktop's clipboard-doesn't-survive-a-reboot behavior.
 */
export const useClipboardStore = create<ClipboardState>()(set => ({
  ids: [],
  mode: null,
  setClipboard: (ids, mode) => set({ ids, mode }),
  clear: () => set({ ids: [], mode: null }),
}));
