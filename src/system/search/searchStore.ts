import { create } from "zustand";

interface SearchStore {
  open: boolean;
  query: string;
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
}

/** Session-only state for the ⌘K global search overlay (B9). Not persisted. */
export const useSearchStore = create<SearchStore>()(set => ({
  open: false,
  query: "",
  openSearch: () => set({ open: true, query: "" }),
  closeSearch: () => set({ open: false, query: "" }),
  setQuery: query => set({ query }),
}));
