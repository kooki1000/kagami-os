import type { AppManifest } from "@/system/apps/types";
import { Code } from "lucide-react";
import { lazy } from "react";
import { restoreFilePayload, serializeFilePayload } from "@/system/apps/filePayload";

/**
 * D4 (step 16b) — the code/text editor, and the last app the step was waiting
 * on.
 *
 * Runs **in-process**, not in the capability sandbox that Documents' PDF
 * viewer uses: the sandbox exists for renderers that interpret or execute
 * untrusted content, and a syntax highlighter only tokenizes text into styled
 * spans. The bridge also has no `fs.write` capability, so a sandboxed editor
 * could read but never save — see ROADMAP.md §6's decision on this, the
 * counterpart to decision 8's argument for Notes.
 */
export const codeApp: AppManifest = {
  id: "code",
  name: "Code",
  icon: Code,
  tileGradient: ["#7c8fb5", "#4f6288"],
  defaultSize: { width: 860, height: 560 },
  minSize: { width: 520, height: 340 },
  component: lazy(() => import("./CodeApp")),
  singleInstance: true,
  pinned: true,
  serializePayload: serializeFilePayload,
  restorePayload: restoreFilePayload,
  menus: [
    {
      title: "File",
      items: [
        { label: "New File", appCommand: "code.new", shortcut: "⌘N" },
        { label: "Save", appCommand: "code.save", shortcut: "⌘S", dividerAfter: true },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
    {
      title: "Edit",
      items: [
        { label: "Undo", appCommand: "code.undo", shortcut: "⌘Z" },
        { label: "Redo", appCommand: "code.redo", shortcut: "⇧⌘Z", dividerAfter: true },
        { label: "Find…", appCommand: "code.find", shortcut: "⌘F" },
      ],
    },
    {
      title: "View",
      items: [
        // No chords on these two: `chordFromEvent` refuses anything with Alt
        // held (`shortcuts.ts`), so an ⌥⌘ shortcut would print on the menu and
        // never fire — the exact lie `shortcuts.test.ts` exists to catch. The
        // menu items work; they just don't advertise a key.
        { label: "Wrap Lines", appCommand: "code.toggleWrap" },
        { label: "Line Numbers", appCommand: "code.toggleLineNumbers", dividerAfter: true },
        { label: "Bigger Text", appCommand: "code.biggerText", shortcut: "⌘+" },
        { label: "Smaller Text", appCommand: "code.smallerText", shortcut: "⌘−" },
      ],
    },
  ],
};
