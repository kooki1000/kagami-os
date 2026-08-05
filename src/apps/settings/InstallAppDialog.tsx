import type { ParsedBundle } from "@/system/apps/installBundle";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";

interface InstallAppDialogProps {
  bundle: ParsedBundle;
  installing: boolean;
  onCancel: () => void;
  onInstall: () => void;
}

/**
 * Step 17 (D8.5) — the first-run consent screen Appendix A.5 calls for:
 * shows exactly what a parsed, not-yet-installed bundle is requesting, and
 * only calls `onInstall` (which writes to the VFS and records the grant —
 * `installBundle.ts`'s `commitInstall`) on an explicit click. Reuses
 * `QuickLookOverlay`'s backdrop/focus-trap shape rather than inventing new
 * overlay plumbing.
 */
export function InstallAppDialog({ bundle, installing, onCancel, onInstall }: InstallAppDialogProps) {
  const panelRef = useFocusTrap<HTMLDivElement>({ active: true, onClose: onCancel, trapFocus: true });
  useOverlayOpen(true);
  const { manifest } = bundle;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onPointerDown={installing ? undefined : onCancel} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Install ${manifest.name}`}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,400px)] -translate-1/2 overflow-hidden rounded-window shadow-(--shadow-deep) chrome hairline"
      >
        <div className="p-5">
          <h2 className="text-13 font-semibold text-ink">{manifest.name}</h2>
          <p className="mt-0.5 text-11.5 text-ink-2">
            Version
            {" "}
            {manifest.version}
          </p>

          <p className="mt-4 text-12 font-medium text-ink">This app is requesting:</p>
          {manifest.capabilities.length > 0
            ? (
                <ul className="mt-2 space-y-1 rounded-[10px] bg-surface-2 p-3 text-11.5 hairline">
                  {manifest.capabilities.map(cap => (
                    <li key={cap} className="font-mono text-ink">{cap}</li>
                  ))}
                </ul>
              )
            : <p className="mt-2 text-12 text-ink-2">Nothing — this app requests no capabilities.</p>}

          <p className="mt-4 text-11/relaxed text-ink-2">
            Installed apps run in a sandboxed frame and can only do what's
            listed above. Access stays revocable from this pane.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 hairline-t">
          <button
            type="button"
            disabled={installing}
            className="flex-none rounded-btn bg-ph px-3 py-[calc(6px*var(--ui-scale))] text-12 font-medium text-ink hover:bg-ph-2 disabled:opacity-40"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={installing}
            className="flex-none rounded-btn bg-accent-strong px-3 py-[calc(6px*var(--ui-scale))] text-12 font-semibold text-white disabled:opacity-60"
            onClick={onInstall}
          >
            {installing ? "Installing…" : "Install"}
          </button>
        </div>
      </div>
    </>
  );
}
