import type { KeyboardEvent } from "react";
import { File, Folder, Search as SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { formatShortcut } from "@/lib/format";
import { launchApp } from "@/system/apps/launch";
import { openFile } from "@/system/apps/openFile";
import { useFsStore } from "@/system/fs/fsStore";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";
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

  // Registers with the shared overlay registry so global shortcuts
  // (system/shortcuts.ts) and other menus back off while search is open.
  useOverlayOpen(open);

  // Reset the highlight whenever the query changes — state adjustment during
  // render (matching MenuBar's lastFocusedId pattern), not a useEffect.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setHighlighted(0);
  }

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
        role="dialog"
        aria-modal="true"
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
