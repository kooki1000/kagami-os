import { create } from "zustand";

interface SwitcherStore {
  open: boolean;
  /** Frozen at open time — held-Tab cycling shouldn't reshuffle mid-hold as windows change. */
  order: string[];
  index: number;
  /**
   * Opens with a snapshot of the running-app order, highlighting the second
   * entry (the "previous" app) rather than the current one — matches how a
   * real Alt-Tab immediately points away from the focused app on first press.
   */
  openSwitcher: (order: string[]) => void;
  advance: (reverse: boolean) => void;
  close: () => void;
}

/** Session-only state for the ⌥Tab / ⌃⌥Tab app switcher overlay (C2). Not persisted. */
export const useSwitcherStore = create<SwitcherStore>()((set, get) => ({
  open: false,
  order: [],
  index: 0,

  openSwitcher: (order) => {
    if (order.length === 0)
      return;
    set({ open: true, order, index: order.length > 1 ? 1 : 0 });
  },

  advance: (reverse) => {
    const { open, order, index } = get();
    if (!open || order.length === 0)
      return;
    set({ index: (index + (reverse ? -1 : 1) + order.length) % order.length });
  },

  close: () => set({ open: false, order: [], index: 0 }),
}));
