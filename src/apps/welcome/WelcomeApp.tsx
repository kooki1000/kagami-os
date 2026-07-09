import type { AppWindowProps } from "@/system/apps/types";
import { lagoon } from "@/design/tokens";

const swatches = [
  { name: "accent", value: lagoon.light.accent },
  { name: "accent-2", value: lagoon.light.accent2 },
  { name: "close", value: lagoon.controls.close },
  { name: "minimize", value: lagoon.controls.minimize },
  { name: "zoom", value: lagoon.controls.zoom },
];

export default function WelcomeApp(_props: AppWindowProps) {
  return (
    <div className="h-full overflow-auto p-8 select-none">
      <div className="mb-1 flex items-center gap-3">
        <span
          className="size-5 rotate-45 rounded-[5px]"
          style={{ background: "var(--accent)" }}
        />
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          Kagami OS
        </h1>
      </div>
      <p className="text-[15px] font-medium text-ink-2">
        A desktop that lives in your browser.
      </p>

      <div className="mt-6 space-y-4 text-[13px] leading-relaxed text-ink">
        <p>
          Drag this window by its title bar, resize it from any edge,
          double-click the title bar to zoom, or drag it against the left or
          right edge of the screen to tile it. Press ⌘W to close a window.
        </p>
        <p className="text-ink-2">
          Files, Notes, the image viewer, and a sandboxed Terminal are all
          live — double-click a document or picture in Files to open it.
          Everything is stored in a virtual file system in your browser, so it
          survives refreshes. Tune the accent, wallpaper, theme, and dock in
          Settings.
        </p>
      </div>

      <div className="mt-7">
        <div className="mb-2.5 font-mono text-[10px] font-semibold tracking-[0.7px] text-ink-2 uppercase">
          Lagoon palette
        </div>
        <div className="flex gap-2.5">
          {swatches.map(s => (
            <div key={s.name} className="flex flex-col items-center gap-1.5">
              <span
                className="size-9 rounded-[9px] hairline"
                style={{ background: s.value }}
              />
              <span className="text-[10px] font-medium text-ink-2">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
