import { MENU_BAR_HEIGHT, useWindowStore } from "@/system/windows/windowStore";
import { Window } from "./Window";

export function WindowLayer() {
  const windows = useWindowStore(s => s.windows);
  const focusedId = useWindowStore(s => s.focusedId);
  const snapPreview = useWindowStore(s => s.snapPreview);

  return (
    <div className="pointer-events-none absolute inset-0 isolate z-10">
      {snapPreview && (
        <div
          className="absolute bottom-0 w-1/2 p-2 transition-all duration-150"
          style={{
            top: MENU_BAR_HEIGHT,
            left: snapPreview === "left" ? 0 : "50%",
          }}
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
        .filter(w => !w.minimized)
        .map(w => (
          <Window key={w.id} win={w} focused={w.id === focusedId} />
        ))}
    </div>
  );
}
