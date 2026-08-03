import type { AppWindowProps } from "@/system/apps/types";
import { ChevronLeft, ChevronRight, FileText, Minus, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { emitAppCommand } from "@/system/appCommands";
import { usePayloadFileId } from "@/system/apps/filePayload";
import { SandboxedAppHost } from "@/system/sandbox/SandboxedAppHost";
import { buildDocumentsEntryHtml } from "./entryHtml";
import { BASE_SCALE, clampPage, goToPageCommand, zoomPercent } from "./pageNav";

/**
 * What the sandboxed frame reports through `ui.setState`. Mirrors the payload
 * `sandboxEntry.ts`'s `report()` sends — the bridge treats it as opaque, so
 * these two files are the only ones that know the shape, and narrowing it is
 * this side's job.
 */
interface DocumentsViewerState {
  status: "empty" | "loading" | "ready" | "error";
  message: string;
  page: number;
  pageCount: number;
  scale: number;
}

/** The one token the frame paints with — its page backdrop. */
const FRAME_THEME_VARS = ["--surface-2"] as const;

const INITIAL_STATE: DocumentsViewerState = {
  status: "loading",
  message: "",
  page: 1,
  pageCount: 0,
  scale: BASE_SCALE,
};

/** Narrows the untrusted `ui.setState` payload; anything malformed leaves the previous state alone. */
function parseViewerState(raw: Record<string, unknown>): DocumentsViewerState | null {
  const { status, message, page, pageCount, scale } = raw;
  const known = status === "empty" || status === "loading" || status === "ready" || status === "error";
  if (!known || typeof page !== "number" || typeof pageCount !== "number" || typeof scale !== "number")
    return null;
  return { status, message: typeof message === "string" ? message : "", page, pageCount, scale };
}

/**
 * Host for the sandboxed PDF viewer (step 16b, D6) — and the app's entire
 * visible UI.
 *
 * The chrome lives out here rather than in the frame because a `srcdoc`
 * document inherits no CSS custom properties: every color it drew had to be
 * hardcoded, which pinned the viewer to the light theme no matter what the
 * user picked. Now the frame renders only the page canvas on a transparent
 * body, reports its state over `ui.setState`, and takes commands back the
 * same way the menu bar already sends them.
 */
export default function DocumentsApp(props: AppWindowProps) {
  const { windowId } = props;
  const [fileId] = usePayloadFileId(props.payload);
  const [viewer, setViewer] = useState<DocumentsViewerState>(INITIAL_STATE);

  // Scoped to exactly the file being opened, computed per launch — never a
  // static scope like sandboxDemo's fixed "fs.read:documents", since
  // Documents can be pointed at any PDF the user picks.
  const capabilities = useMemo(() => (fileId ? [`fs.read:${fileId}`] : []), [fileId]);
  const entryHtml = useMemo(() => buildDocumentsEntryHtml(fileId), [fileId]);

  const handleAppState = useCallback((raw: Record<string, unknown>) => {
    const next = parseViewerState(raw);
    if (next)
      setViewer(next);
  }, []);

  // The toolbar drives the frame through the *same* appCommand channel the
  // menu bar uses, so there's one path in and the menu items keep working
  // untouched.
  const send = useCallback(
    (command: string) => emitAppCommand(windowId, command),
    [windowId],
  );

  const ready = viewer.status === "ready";

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <Toolbar viewer={viewer} ready={ready} onCommand={send} />
      <div className="relative min-h-0 flex-1">
        <SandboxedAppHost
          {...props}
          appId="documents"
          entryHtml={entryHtml}
          capabilities={capabilities}
          onAppState={handleAppState}
          themeVars={FRAME_THEME_VARS}
        />
        {!ready && <ViewerOverlay viewer={viewer} />}
      </div>
    </div>
  );
}

/** 38px toolbar, in the prototype's language — the same height and hairline the Files toolbar uses. */
function Toolbar({ viewer, ready, onCommand }: {
  viewer: DocumentsViewerState;
  ready: boolean;
  onCommand: (command: string) => void;
}) {
  return (
    <div className="flex h-[calc(38px*var(--ui-scale))] flex-none items-center gap-1 px-3 text-12 text-ink-2 hairline-b">
      <ToolbarButton
        label="Previous page"
        disabled={!ready || viewer.page <= 1}
        onClick={() => onCommand("documents.previousPage")}
      >
        <ChevronLeft className="size-[calc(14px*var(--ui-scale))]" />
      </ToolbarButton>
      <ToolbarButton
        label="Next page"
        disabled={!ready || viewer.page >= viewer.pageCount}
        onClick={() => onCommand("documents.nextPage")}
      >
        <ChevronRight className="size-[calc(14px*var(--ui-scale))]" />
      </ToolbarButton>

      <PageField viewer={viewer} ready={ready} onCommand={onCommand} />

      <div className="ml-auto flex items-center gap-1">
        <ToolbarButton label="Zoom out" disabled={!ready} onClick={() => onCommand("documents.zoomOut")}>
          <Minus className="size-[calc(14px*var(--ui-scale))]" />
        </ToolbarButton>
        <span className="w-[calc(38px*var(--ui-scale))] text-center tabular-nums">
          {ready ? `${zoomPercent(viewer.scale)}%` : "—"}
        </span>
        <ToolbarButton label="Zoom in" disabled={!ready} onClick={() => onCommand("documents.zoomIn")}>
          <Plus className="size-[calc(14px*var(--ui-scale))]" />
        </ToolbarButton>
        <button
          type="button"
          disabled={!ready}
          className="ml-1 rounded-btn px-2 py-[calc(4px*var(--ui-scale))] text-11.5 font-medium hover:bg-ph hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => onCommand("documents.zoomFit")}
        >
          Fit width
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({ label, disabled, onClick, children }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid size-6 flex-none place-items-center rounded-btn hover:bg-ph hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * "Page [3] of 12" — a real input, so a 200-page document doesn't have to be
 * paged through one chevron at a time. Committed on Enter/blur rather than
 * per keystroke, since a half-typed "1" on the way to "12" would otherwise
 * navigate twice.
 */
function PageField({ viewer, ready, onCommand }: {
  viewer: DocumentsViewerState;
  ready: boolean;
  onCommand: (command: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const parsed = Number(draft);
    // A blank or nonsense entry snaps back rather than navigating anywhere.
    if (draft !== null && Number.isFinite(parsed) && parsed > 0)
      onCommand(goToPageCommand(clampPage(Math.round(parsed), viewer.pageCount)));
    setDraft(null);
  }

  if (!ready)
    return null;

  return (
    <span className="ml-2 flex items-center gap-1.5 text-11.5">
      <input
        aria-label="Page number"
        value={draft ?? String(viewer.page)}
        inputMode="numeric"
        className="w-[calc(34px*var(--ui-scale))] rounded-btn bg-ph px-1.5 py-[calc(3px*var(--ui-scale))] text-center text-ink tabular-nums outline-none focus:bg-ph-2"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span>
        of
        {" "}
        <span className="tabular-nums">{viewer.pageCount}</span>
      </span>
    </span>
  );
}

/**
 * Covers the frame while it has nothing worth showing. Absolutely positioned
 * over the iframe rather than replacing it, so the frame is never unmounted
 * mid-load — remounting it would restart the whole PDF parse.
 */
function ViewerOverlay({ viewer }: { viewer: DocumentsViewerState }) {
  const copy = {
    empty: "No document open.",
    loading: "Opening document…",
    error: viewer.message || "Couldn't open this document.",
    ready: "",
  }[viewer.status];

  return (
    <div className="absolute inset-0 grid place-items-center bg-surface-2 px-6 text-center select-none">
      <div className="flex flex-col items-center gap-2.5 text-ink-2">
        {viewer.status === "loading"
          ? <Spinner />
          : <FileText className="size-7 opacity-80" strokeWidth={1.4} />}
        <span className={`max-w-[320px] text-12 ${viewer.status === "error" ? "text-accent-2" : ""}`}>
          {copy}
        </span>
      </div>
    </div>
  );
}

/** The loading ring, now a token-colored element rather than a hardcoded teal one inside the frame. */
function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="size-4 animate-spin rounded-full border-2 border-(--accent)/25 border-t-(--accent)"
    />
  );
}
