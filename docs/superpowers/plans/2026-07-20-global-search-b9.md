# Global Search (B9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `⌘K` global name-search overlay that finds files/folders anywhere in the VFS by substring match and opens the selected one, plus the platform-aware shortcut-label formatter its own hint text needs.

**Architecture:** A pure `searchNodes()` function scans `fsStore.nodes` for substring matches (excluding Trash), a small session-only Zustand store (`searchStore`) tracks the overlay's open/query state, and a new `SearchOverlay` shell component (mounted in `App.tsx` alongside `NotificationCenter`) renders results and opens the chosen node through the existing `launchApp`/`openFile` plumbing. `⌘K` (and Ctrl+K, already handled by the existing chord logic) triggers it from anywhere, including an empty desktop.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4 utility classes, Vitest (unit), Playwright (e2e).

## Global Constraints

- Node **22.23.1** exactly (`nvm use` before any command) — a different Node crashes ESLint at config-eval time.
- Unit tests run in a **plain Node environment, no jsdom/RTL** — nothing that touches `navigator` or renders a component can be asserted in a `.test.ts` file. React components in this codebase have zero unit-test coverage (confirmed: no `*.test.tsx` files exist anywhere); component/integration behavior is covered by Playwright specs in `e2e/` instead.
- Path alias `@/*` → `src/*` (use it in all new/edited files under `src/`, matching existing imports).
- ESLint: `@antfu/eslint-config` base — 2-space indent, semicolons, double quotes, import ordering. Run `pnpm lint:fix` if unsure.
- Design guardrails (from `CLAUDE.md`): no macOS-only assumptions in *new* UI — this plan's `⌘K` label already resolves to `Ctrl+K` off Mac via `formatShortcut` (Task 1), and the underlying key handler already accepts `ctrlKey` (unchanged, pre-existing).
- Spec: `docs/superpowers/specs/2026-07-20-global-search-b9-design.md`. Branch `phase-11/global-search-b9` is already checked out with the spec committed.

---

### Task 1: Platform-aware shortcut label formatter

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/lib/format.test.ts` (new file)

**Interfaces:**
- Produces: `isMacPlatform(): boolean`, `formatShortcut(shortcut: string, mac?: boolean): string` — both exported from `src/lib/format.ts`. `mac` defaults to `isMacPlatform()` but can be passed explicitly (required for testing, since the unit-test environment has no `navigator`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatShortcut, isMacPlatform } from "./format";

describe("formatShortcut", () => {
  it("passes shortcuts through unchanged on Mac", () => {
    expect(formatShortcut("⌘W", true)).toBe("⌘W");
    expect(formatShortcut("⇧⌘N", true)).toBe("⇧⌘N");
  });

  it("converts a plain ⌘ chord to Ctrl+ on non-Mac", () => {
    expect(formatShortcut("⌘W", false)).toBe("Ctrl+W");
  });

  it("converts a shifted chord to Ctrl+Shift+, Ctrl first, on non-Mac", () => {
    expect(formatShortcut("⇧⌘N", false)).toBe("Ctrl+Shift+N");
  });

  it("handles a multi-character key like ⌘K's own hint", () => {
    expect(formatShortcut("⌘K", false)).toBe("Ctrl+K");
  });
});

describe("isMacPlatform", () => {
  it("defaults to true when navigator is unavailable, as in this test environment", () => {
    expect(isMacPlatform()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use && pnpm vitest run src/lib/format.test.ts`
Expected: FAIL — `formatShortcut`/`isMacPlatform` are not exported from `./format`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/format.ts` (after the existing `formatBytes` function, at the end of the file):

```ts
/** True on macOS, and as a safe default when `navigator` is unavailable (e.g. this test suite). */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined")
    return true;
  const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? navigator.userAgent;
  return /mac/i.test(platform);
}

/**
 * Display form of a menu-item shortcut string ("⌘W", "⇧⌘N"). Unchanged on
 * Mac; on other platforms, ⌘/⇧ become "Ctrl+"/"Shift+" in that order,
 * matching the Windows/Linux convention. `mac` defaults to the real
 * platform check but can be passed explicitly (tests must, since this
 * suite's Node environment has no `navigator`).
 */
export function formatShortcut(shortcut: string, mac: boolean = isMacPlatform()): string {
  if (mac)
    return shortcut;
  const hasShift = shortcut.includes("⇧");
  const key = shortcut.replace("⇧", "").replace("⌘", "");
  return hasShift ? `Ctrl+Shift+${key}` : `Ctrl+${key}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(b9): add platform-aware shortcut label formatter"
```

---

### Task 2: Pure search over the fs tree

**Files:**
- Create: `src/system/search/searchNodes.ts`
- Test: `src/system/search/searchNodes.test.ts`

**Interfaces:**
- Consumes: `NodeMap`, `isDescendantOf`, `pathOf` from `@/system/fs/fsStore`; `TRASH_ID` from `@/system/fs/types`; `FsNode` type from `@/system/fs/types`.
- Produces: `interface SearchResult { node: FsNode; path: string }`, `function searchNodes(nodes: NodeMap, query: string, limit?: number): SearchResult[]` — both exported from `src/system/search/searchNodes.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/system/search/searchNodes.test.ts`:

```ts
import type { FsNode } from "../fs/types";
import { describe, expect, it } from "vitest";
import { indexNodes } from "../fs/fsStore";
import { DOCUMENTS_ID, HOME_ID, ROOT_ID, TRASH_ID } from "../fs/types";
import { searchNodes } from "./searchNodes";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

/** Home/Documents holds two "report"-matching nodes plus a decoy; Trash holds a direct child and a nested one, both matching too. */
const nodes = indexNodes([
  node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
  node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
  node({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder" }),
  node({ id: "reports", parentId: DOCUMENTS_ID, name: "Reports", type: "folder" }),
  node({ id: "old-report", parentId: DOCUMENTS_ID, name: "old-report.txt", type: "file" }),
  node({ id: "note", parentId: DOCUMENTS_ID, name: "note.md", type: "file" }),
  node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
  node({ id: "trashed-direct", parentId: TRASH_ID, name: "trashed-report.txt", type: "file" }),
  node({ id: "trashed-folder", parentId: TRASH_ID, name: "Old Reports", type: "folder" }),
  node({ id: "trashed-nested", parentId: "trashed-folder", name: "buried-report.txt", type: "file" }),
]);

describe("searchNodes", () => {
  it("matches names case-insensitively and skips non-matches", () => {
    const ids = searchNodes(nodes, "REPORT").map(r => r.node.id);
    expect(ids).not.toContain("note");
    expect(ids).toContain("reports");
    expect(ids).toContain("old-report");
  });

  it("excludes anything in the Trash, including nested descendants of a trashed folder", () => {
    const ids = searchNodes(nodes, "report").map(r => r.node.id);
    expect(ids).not.toContain("trashed-direct");
    expect(ids).not.toContain("trashed-nested");
  });

  it("ranks a prefix match above an interior-substring match", () => {
    const ids = searchNodes(nodes, "report").map(r => r.node.id);
    expect(ids.indexOf("reports")).toBeLessThan(ids.indexOf("old-report"));
  });

  it("returns nothing for an empty or whitespace-only query", () => {
    expect(searchNodes(nodes, "")).toEqual([]);
    expect(searchNodes(nodes, "   ")).toEqual([]);
  });

  it("caps results at the given limit", () => {
    expect(searchNodes(nodes, "report", 1)).toHaveLength(1);
  });

  it("labels each result with its ancestor path, root and the node itself excluded", () => {
    const result = searchNodes(nodes, "old-report")[0];
    expect(result.path).toBe("Home/Documents");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/system/search/searchNodes.test.ts`
Expected: FAIL — cannot find module `./searchNodes`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/system/search/searchNodes.ts`:

```ts
import type { NodeMap } from "../fs/fsStore";
import type { FsNode } from "../fs/types";
import { isDescendantOf, pathOf } from "../fs/fsStore";
import { TRASH_ID } from "../fs/types";

export interface SearchResult {
  node: FsNode;
  /** Ancestor path label for disambiguation, e.g. "Documents/Projects". */
  path: string;
}

const DEFAULT_LIMIT = 20;

function pathLabel(nodes: NodeMap, node: FsNode): string {
  if (!node.parentId)
    return "";
  return pathOf(nodes, node.parentId).slice(1).map(n => n.name).join("/");
}

function isTrashed(nodes: NodeMap, node: FsNode): boolean {
  return node.parentId === TRASH_ID || isDescendantOf(nodes, node.id, TRASH_ID);
}

/**
 * Case-insensitive substring match over every node's name, excluding
 * anything in the Trash. Prefix matches rank above interior matches; ties
 * break alphabetically. Capped at `limit` results.
 */
export function searchNodes(nodes: NodeMap, query: string, limit = DEFAULT_LIMIT): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q)
    return [];

  const matches: FsNode[] = [];
  for (const node of Object.values(nodes)) {
    if (!node.name.toLowerCase().includes(q))
      continue;
    if (isTrashed(nodes, node))
      continue;
    matches.push(node);
  }

  matches.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(q);
    const bPrefix = b.name.toLowerCase().startsWith(q);
    if (aPrefix !== bPrefix)
      return aPrefix ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return matches.slice(0, limit).map(node => ({ node, path: pathLabel(nodes, node) }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/system/search/searchNodes.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/system/search/searchNodes.ts src/system/search/searchNodes.test.ts
git commit -m "feat(b9): add pure global search over the fs tree"
```

---

### Task 3: Search overlay state store

**Files:**
- Create: `src/system/search/searchStore.ts`
- Test: `src/system/search/searchStore.test.ts`

**Interfaces:**
- Produces: `useSearchStore` (Zustand hook) with state `{ open: boolean; query: string }` and actions `openSearch(): void`, `closeSearch(): void`, `setQuery(q: string): void` — exported from `src/system/search/searchStore.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/system/search/searchStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useSearchStore } from "./searchStore";

const api = () => useSearchStore.getState();

beforeEach(() => {
  useSearchStore.setState({ open: false, query: "" });
});

describe("searchStore", () => {
  it("starts closed with an empty query", () => {
    expect(api().open).toBe(false);
    expect(api().query).toBe("");
  });

  it("openSearch opens the overlay", () => {
    api().openSearch();
    expect(api().open).toBe(true);
  });

  it("setQuery updates the query while open", () => {
    api().openSearch();
    api().setQuery("welcome");
    expect(api().query).toBe("welcome");
  });

  it("closeSearch closes the overlay and clears the query", () => {
    api().openSearch();
    api().setQuery("welcome");
    api().closeSearch();
    expect(api().open).toBe(false);
    expect(api().query).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/system/search/searchStore.test.ts`
Expected: FAIL — cannot find module `./searchStore`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/system/search/searchStore.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/system/search/searchStore.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/system/search/searchStore.ts src/system/search/searchStore.test.ts
git commit -m "feat(b9): add search overlay open/query store"
```

---

### Task 4: Search overlay component

**Files:**
- Create: `src/components/shell/SearchOverlay.tsx`

**Interfaces:**
- Consumes: `useSearchStore` (Task 3: `.open`, `.query`, `.setQuery`, `.closeSearch`), `searchNodes`/`SearchResult` (Task 2), `formatShortcut` (Task 1), `useFsStore` (`@/system/fs/fsStore`, `.nodes`), `launchApp` (`@/system/apps/launch`), `openFile` (`@/system/apps/openFile`), `MENU_BAR_HEIGHT` (`@/system/windows/windowStore`).
- Produces: `SearchOverlay` component, mounted by Task 5.

No unit test for this task — per the Global Constraints, React components have zero unit coverage in this codebase (no jsdom/RTL in the Vitest environment); this component is exercised by the Task 6 e2e spec and the manual check in Task 5.

- [ ] **Step 1: Create the component**

Create `src/components/shell/SearchOverlay.tsx`:

```tsx
import type { KeyboardEvent } from "react";
import { File, Folder, Search as SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatShortcut } from "@/lib/format";
import { launchApp } from "@/system/apps/launch";
import { openFile } from "@/system/apps/openFile";
import { useFsStore } from "@/system/fs/fsStore";
import { searchNodes } from "@/system/search/searchNodes";
import { useSearchStore } from "@/system/search/searchStore";
import { MENU_BAR_HEIGHT } from "@/system/windows/windowStore";

/** ⌘K global name search over the whole VFS (B9), opened from the menu bar or the shortcut. */
export function SearchOverlay() {
  const open = useSearchStore(s => s.open);
  const query = useSearchStore(s => s.query);
  const setQuery = useSearchStore(s => s.setQuery);
  const closeSearch = useSearchStore(s => s.closeSearch);
  const nodes = useFsStore(s => s.nodes);

  const results = useMemo(() => (open ? searchNodes(nodes, query) : []), [open, nodes, query]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  if (!open)
    return null;

  function openResult(index: number): void {
    const result = results[index];
    if (!result)
      return;
    if (result.node.type === "folder")
      launchApp("files", { payload: { folderId: result.node.id } });
    else
      openFile(result.node);
    closeSearch();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted(i => Math.min(i + 1, results.length - 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted(i => Math.max(i - 1, 0));
        return;
      case "Enter":
        e.preventDefault();
        openResult(highlighted);
        return;
      case "Escape":
        e.preventDefault();
        closeSearch();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-45" onPointerDown={closeSearch} />
      <div
        className="fixed left-1/2 z-50 flex max-h-[60vh] w-120 -translate-x-1/2 animate-flyout-in flex-col overflow-hidden rounded-[15px] shadow-(--shadow-deep) chrome hairline"
        style={{ top: MENU_BAR_HEIGHT + 80 }}
      >
        <div className="flex flex-none items-center gap-2 px-3.5 py-2.5 hairline-b">
          <SearchIcon className="size-3.5 flex-none opacity-55" aria-hidden />
          <input
            type="text"
            autoFocus
            value={query}
            placeholder="Search files and folders"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-2"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {!query && (
            <span className="flex-none text-[11px] text-ink-2">{formatShortcut("⌘K")}</span>
          )}
        </div>

        {!query && (
          <div className="px-3.5 py-6 text-center text-[12.5px] text-ink-2">
            Type to search files and folders.
          </div>
        )}

        {query && results.length === 0 && (
          <div className="px-3.5 py-6 text-center text-[12.5px] text-ink-2">
            No results for "
            {query}
            "
          </div>
        )}

        {results.length > 0 && (
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {results.map((result, i) => (
              <button
                type="button"
                key={result.node.id}
                className={`flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-1.5 text-left ${
                  i === highlighted ? "bg-accent text-white" : "hover:bg-ph"
                }`}
                onPointerEnter={() => setHighlighted(i)}
                onClick={() => openResult(i)}
              >
                {result.node.type === "folder"
                  ? <Folder className="size-3.75 flex-none" aria-hidden />
                  : <File className="size-3.75 flex-none" aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                  {result.node.name}
                </span>
                {result.path && (
                  <span className={`flex-none truncate text-[11px] ${i === highlighted ? "text-white/70" : "text-ink-2"}`}>
                    {result.path}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this component isn't imported/mounted anywhere yet, so it just needs to type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/SearchOverlay.tsx
git commit -m "feat(b9): add the search overlay component"
```

---

### Task 5: Wire up the triggers and mount the overlay

**Files:**
- Modify: `src/system/shortcuts.ts`
- Modify: `src/components/shell/MenuBar.tsx`
- Modify: `src/App.tsx`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: `useSearchStore` (Task 3), `SearchOverlay` (Task 4), `formatShortcut` (Task 1).

- [ ] **Step 1: Add the always-available `⌘K` chord to `shortcuts.ts`**

In `src/system/shortcuts.ts`, add the import:

```ts
import { useEffect } from "react";
import { emitAppCommand } from "./appCommands";
import { getApp } from "./apps/registry";
import { executeCommand } from "./commands";
import { useSearchStore } from "./search/searchStore";
import { useWindowStore } from "./windows/windowStore";
```

Then, inside `onKeyDown`, right after the `NATIVE_EDITING_LETTERS` early-return and before the `focusedId`/`win` lookup, add the `⌘K` check — it must run before that lookup so it works with zero windows open:

```ts
      if (NATIVE_EDITING_LETTERS.has(chord.slice(-1)) && isEditableTarget(e.target))
        return;

      // Global search works from anywhere, including an empty desktop —
      // checked ahead of the focused-window lookup below rather than
      // folded into SHELL_CHORDS, which requires a focused window.
      if (chord === "⌘K") {
        e.preventDefault();
        useSearchStore.getState().openSearch();
        return;
      }

      const { focusedId, windows } = useWindowStore.getState();
```

- [ ] **Step 2: Wire the menu-bar search icon and apply `formatShortcut`**

In `src/components/shell/MenuBar.tsx`, update the imports:

```tsx
import type { MenuItem, MenuSection } from "@/system/apps/types";
import type { ThemePreference } from "@/system/theme/themeStore";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { formatShortcut } from "@/lib/format";
import { emitAppCommand } from "@/system/appCommands";
import { getApp } from "@/system/apps/registry";
import { executeCommand } from "@/system/commands";
import {
  selectUnreadCount,
  useNotificationStore,
} from "@/system/notifications/notificationStore";
import { useSearchStore } from "@/system/search/searchStore";
import { useThemeStore } from "@/system/theme/themeStore";
import { MENU_BAR_HEIGHT, useWindowStore } from "@/system/windows/windowStore";
```

Add the store hook alongside the other `MenuBar` hooks (after `const closeCenter = useNotificationStore(s => s.closeCenter);`):

```tsx
  const closeCenter = useNotificationStore(s => s.closeCenter);
  const openSearch = useSearchStore(s => s.openSearch);
```

Replace the decorative icon (`<Search className="size-3.25" aria-hidden />`) with a button:

```tsx
          <button
            type="button"
            aria-label="Search"
            className="grid place-items-center rounded-md p-0.5 hover:bg-ph"
            onClick={openSearch}
          >
            <Search className="size-3.25" />
          </button>
```

In `DropMenu`, apply the formatter to the rendered shortcut label:

```tsx
            {item.shortcut && (
              <span className="text-[11.5px] opacity-55">{formatShortcut(item.shortcut)}</span>
            )}
```

- [ ] **Step 3: Mount the overlay in `App.tsx`**

In `src/App.tsx`, add the import alongside the other shell components:

```tsx
import { NotificationCenter } from "./components/shell/NotificationCenter";
import { SearchOverlay } from "./components/shell/SearchOverlay";
import { ToastStack } from "./components/shell/ToastStack";
```

Add it to the render tree, after `<NotificationCenter />`:

```tsx
      <ToastStack />
      <NotificationCenter />
      <SearchOverlay />
    </div>
  );
}
```

- [ ] **Step 4: Update `ARCHITECTURE.md`**

In the "Shell components" section, add a bullet after the `ToastStack` / `NotificationCenter` line:

```markdown
- `ToastStack` / `NotificationCenter` — transient corner toasts and the
  persistent history flyout (see Notifications below).
- `SearchOverlay` — `⌘K` global name search over the whole VFS (B9); a
  centered command-palette-style flyout (unlike the corner-anchored toast/
  notification flyouts). Matches by case-insensitive substring over
  `fsStore.nodes` (`system/search/searchNodes.ts`), excluding Trash.
  Selecting a folder launches a new Files window scoped to it (the same
  `{ payload: { folderId } }` pattern Desktop icons use); a file goes
  through `openFile.ts`.
```

In the "Notifications + keyboard shortcuts" section, replace the keyboard-shortcuts bullet's last sentence to mention `⌘K`:

```markdown
- **Keyboard shortcuts** (`system/shortcuts.ts`, `useGlobalShortcuts` in
  `App`) — instead of a separate keymap, a global keydown builds the same
  chord string apps already display on menu items ("⌘W", "⇧⌘N") and runs the
  matching item on the focused app (command or appCommand). Shell fallbacks
  (⌘W/⌘M/⌘Q) apply when a window is focused; symbol chords stay menu-only.
  `⌘K` (global search, B9) is the one chord that isn't gated on a focused
  window — it opens `SearchOverlay` from anywhere, including an empty
  desktop. Menu-item shortcut labels render through `formatShortcut`
  (`lib/format.ts`), showing `Ctrl+…` off Mac.
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Manual check in the browser**

Run: `nvm use && pnpm dev`, open `http://localhost:5173`.

- Press `Ctrl+K` (or `⌘K` on Mac) with no windows open — the overlay should appear, centered, autofocused.
- Type `welcome` — a result for `welcome.md` under `Home/Documents` should appear.
- Press `↓`/`↑` if there's more than one result, then `Enter` — Notes should open with that file, and the overlay should close.
- Reopen with the menu-bar magnifier icon; press `Escape` — the overlay should close with nothing opened.
- Open Files, then Notes; check any menu shortcut label (e.g. `File > Close Window`) still reads `⌘W`.

- [ ] **Step 7: Commit**

```bash
git add src/system/shortcuts.ts src/components/shell/MenuBar.tsx src/App.tsx ARCHITECTURE.md
git commit -m "feat(b9): wire up ⌘K global search and menu-bar trigger"
```

---

### Task 6: E2E coverage

**Files:**
- Create: `e2e/search.spec.ts`

**Interfaces:**
- Consumes: `boot` from `./helpers`.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/search.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { boot } from "./helpers";

test.describe("Global search (⌘K)", () => {
  test("finds a seeded file, opens it, and closes the overlay", async ({ page }) => {
    await boot(page);
    await expect(page.locator("[data-window-id]")).toHaveCount(0);

    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder("Search files and folders");
    await expect(input).toBeVisible();

    await input.fill("welcome");
    await expect(page.getByText("welcome.md")).toBeVisible();
    await expect(page.getByText("Home/Documents")).toBeVisible();

    await input.press("Enter");
    await expect(input).not.toBeVisible();
    await expect(page.locator("[data-window-id]")).toHaveCount(1);
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("Escape closes the overlay without opening anything", async ({ page }) => {
    await boot(page);

    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder("Search files and folders");
    await expect(input).toBeVisible();

    await input.press("Escape");
    await expect(input).not.toBeVisible();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);
  });

  test("the menu-bar search icon opens the same overlay", async ({ page }) => {
    await boot(page);

    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByPlaceholder("Search files and folders")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the e2e suite for this file**

Run: `pnpm build && pnpm exec playwright test e2e/search.spec.ts`
Expected: PASS, 3 tests, across Chromium/Firefox/WebKit (per `playwright.config.ts`'s project matrix).

- [ ] **Step 3: Commit**

```bash
git add e2e/search.spec.ts
git commit -m "test(b9): add e2e coverage for global search"
```

---

## Self-review

**Spec coverage:** every spec section maps to a task — `searchStore`/architecture → Tasks 3–5; `searchNodes` matching/ranking/exclusion/limit/path-label rules → Task 2; `SearchOverlay` UI/interaction (autofocus, hint, empty states, roving highlight, Escape, backdrop-click, query-reset-on-open) → Task 4; trigger wiring (`⌘K` working with no window focused, menu-bar icon) → Task 5; platform-aware labels → Task 1, applied at the one real render site in Task 5; testing plan (`searchNodes.test.ts`, `searchStore.test.ts` mirroring `notificationStore.test.ts`, `format.test.ts`, `e2e/search.spec.ts`) → Tasks 1–3 and 6.

**Placeholder scan:** no TBD/TODO; every step has complete, runnable code.

**Type consistency:** `SearchResult { node: FsNode; path: string }` (Task 2) is the type consumed as-is by `SearchOverlay` (Task 4) and by `searchNodes.test.ts`. `useSearchStore`'s `open`/`query`/`openSearch`/`closeSearch`/`setQuery` names (Task 3) match every consumer in Tasks 4 and 5 exactly. `formatShortcut(shortcut, mac?)` (Task 1) is called with one arg at the real call sites (Tasks 4, 5) and two args only in tests, matching its optional second parameter.
