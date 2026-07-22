import { rectForZone, useWindowStore } from "@/system/windows/windowStore";
import { Window } from "./Window";

export function WindowLayer() {
  const windows = useWindowStore(s => s.windows);
  const focusedId = useWindowStore(s => s.focusedId);
  const snapPreview = useWindowStore(s => s.snapPreview);
  const hiddenApps = useWindowStore(s => s.hiddenApps);
  const viewport = useWindowStore(s => s.viewport);
  // Same rect the drop will actually snap into (windowStore's rectForZone)
  // — one geometry source for both preview and result.
  const previewRect = snapPreview ? rectForZone(snapPreview, viewport) : null;

  return (
    <div className="pointer-events-none absolute inset-0 isolate z-10">
      {previewRect && (
        <div
          className="absolute p-2 transition-all duration-150"
          style={{ left: previewRect.x, top: previewRect.y, width: previewRect.width, height: previewRect.height }}
        >
          <div
            className="size-full rounded-window border backdrop-blur-sm"
            style={{
              borderColor: "var(--accent)",
              background: "color-mix(in oklab, var(--accent) 14%, transparent)",
            }}
          />
        </div>
      )}
      {windows
        .filter(w => !w.minimized && !hiddenApps.has(w.appId))
        .map(w => (
          <Window key={w.id} win={w} focused={w.id === focusedId} />
        ))}
    </div>
  );
}
