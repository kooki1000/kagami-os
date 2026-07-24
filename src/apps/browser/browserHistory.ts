/**
 * A Browser tab's back/forward stack. There's no native way to query a
 * webview's own history (see `browser.rs`), so the frontend rebuilds one
 * from the `nav-changed` events every real navigation already emits.
 */
export interface BrowserHistoryState {
  entries: string[];
  index: number;
}

export function initialHistory(url: string): BrowserHistoryState {
  return { entries: [url], index: 0 };
}

/**
 * Folds a real navigation (from `nav-changed`) into the stack. A `url`
 * matching the entry immediately behind/ahead of the current one is treated
 * as a back/forward move (index shifts, stack untouched); anything else is a
 * forward navigation to a new page (truncates any redo entries, then
 * pushes). This needs no explicit "was this triggered by back()?" flag —
 * comparing against neighbors is enough to stay correct regardless of what
 * triggered the navigation (address bar, an in-page link, or back/forward).
 */
export function applyNavigation(state: BrowserHistoryState, url: string): BrowserHistoryState {
  if (state.entries[state.index] === url)
    return state;
  if (state.entries[state.index - 1] === url)
    return { ...state, index: state.index - 1 };
  if (state.entries[state.index + 1] === url)
    return { ...state, index: state.index + 1 };
  const entries = [...state.entries.slice(0, state.index + 1), url];
  return { entries, index: entries.length - 1 };
}

export function canGoBack(state: BrowserHistoryState): boolean {
  return state.index > 0;
}

export function canGoForward(state: BrowserHistoryState): boolean {
  return state.index < state.entries.length - 1;
}
