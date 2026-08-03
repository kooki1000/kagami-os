/**
 * The search engines the Browser's address bar can fall back to, and the page
 * it opens on (U17).
 *
 * Kept as a fixed table rather than a user-entered URL template: the address
 * bar hands *arbitrary typed text* to whichever entry is selected, so a
 * free-form template would be a way to point every stray keystroke at any host
 * — including one that reads them. Three curated, well-known engines cover the
 * preference without opening that door.
 */

export interface SearchEngine {
  id: string;
  name: string;
  /** The page a new Browser window opens on. */
  homeUrl: string;
  /** `%s` is replaced with the URI-encoded query — see {@link searchUrlFor}. */
  searchTemplate: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: "google",
    name: "Google",
    homeUrl: "https://www.google.com",
    searchTemplate: "https://www.google.com/search?q=%s",
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    homeUrl: "https://duckduckgo.com",
    searchTemplate: "https://duckduckgo.com/?q=%s",
  },
  {
    id: "bing",
    name: "Bing",
    homeUrl: "https://www.bing.com",
    searchTemplate: "https://www.bing.com/search?q=%s",
  },
];

export const DEFAULT_SEARCH_ENGINE_ID = "google";

/**
 * The engine for a stored id, falling back to the default rather than throwing
 * — a persisted id can outlive the entry it names (an engine dropped from the
 * table above), and a Browser window that can't resolve one has nowhere to go.
 */
export function searchEngineById(id: string): SearchEngine {
  return SEARCH_ENGINES.find(engine => engine.id === id)
    ?? SEARCH_ENGINES.find(engine => engine.id === DEFAULT_SEARCH_ENGINE_ID)
    ?? SEARCH_ENGINES[0];
}

export function searchUrlFor(engine: SearchEngine, query: string): string {
  return engine.searchTemplate.replace("%s", encodeURIComponent(query));
}
