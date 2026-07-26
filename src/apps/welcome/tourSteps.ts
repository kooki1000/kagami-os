import { launchApp } from "@/system/apps/launch";

/**
 * A single screen of the first-run tour (U16). Kept as plain data so the
 * step list itself needs no test infrastructure beyond reading the array —
 * only the navigation math below is worth unit-testing.
 */
export interface TourStep {
  title: string;
  body: string;
  /** Optional side effect the step's action button triggers (e.g. opening an app). */
  action?: () => void;
  actionLabel?: string;
}

export const tourSteps: TourStep[] = [
  {
    title: "Kagami OS",
    body: "A desktop that lives in your browser. Drag this window by its title bar, resize it from any edge, double-click the title bar to zoom, or drag it against the left or right edge of the screen to tile it. Press ⌘W to close a window.",
  },
  {
    title: "Files",
    body: "Everything lives in a virtual file system stored right in your browser — it survives refreshes without any backend. Make a folder from the toolbar, rename things from the context menu, drag files onto folders or the Trash, and deleted items sit in the Trash until you empty it.",
    action: () => launchApp("files"),
    actionLabel: "Open Files",
  },
  {
    title: "Make it yours",
    body: "Tune the accent color, wallpaper, theme, and interface density in Settings — open it now to see the appearance options.",
    action: () => launchApp("settings", { payload: { section: "appearance" } }),
    actionLabel: "Open Settings",
  },
  {
    title: "More apps",
    body: "Notes, the image viewer, a media player, and a sandboxed Terminal are all live — double-click a document or picture in Files to open it. Everything you create sticks around across refreshes.",
  },
  {
    title: "You're set",
    body: "That's the tour. Replay it anytime from Settings → About → Replay Tour.",
    action: () => launchApp("settings", { payload: { section: "about" } }),
    actionLabel: "Open Settings",
  },
];

/** Clamped step-forward — never advances past the last step. */
export function nextStepIndex(current: number, total: number): number {
  if (total <= 0)
    return 0;
  return Math.min(current + 1, total - 1);
}

/** Clamped step-back — never retreats before the first step. */
export function prevStepIndex(current: number): number {
  return Math.max(current - 1, 0);
}

/** Index of the final step, used by "Skip". */
export function lastStepIndex(total: number): number {
  return Math.max(total - 1, 0);
}
