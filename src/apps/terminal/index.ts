import type { AppManifest } from "@/system/apps/types";
import { SquareTerminal } from "lucide-react";
import { lazy } from "react";
import { FONT_FAMILIES, PROMPT_STYLES } from "./terminalStore";

export const terminalApp: AppManifest = {
  id: "terminal",
  name: "Terminal",
  icon: SquareTerminal,
  tileGradient: ["#3b3931", "#201e1a"],
  defaultSize: { width: 620, height: 420 },
  minSize: { width: 380, height: 240 },
  component: lazy(() => import("./TerminalApp")),
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "New Window", command: "app.newWindow", shortcut: "⌘N" },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
    {
      title: "View",
      items: [
        { label: "Increase Font Size", appCommand: "terminal.fontIncrease", shortcut: "⌘+" },
        { label: "Decrease Font Size", appCommand: "terminal.fontDecrease", shortcut: "⌘−" },
        { label: "Reset Font Size", appCommand: "terminal.fontReset", shortcut: "⌘0", dividerAfter: true },
        // One item per choice: menus are static manifest data, so there is
        // nothing to bind a checkmark or a submenu to. Same shape as Files'
        // view-mode and sort items.
        ...FONT_FAMILIES.map((font, i) => ({
          label: `Font: ${font.label}`,
          appCommand: `terminal.font:${font.id}`,
          dividerAfter: i === FONT_FAMILIES.length - 1,
        })),
        ...PROMPT_STYLES.map(style => ({ label: `Prompt: ${style.label}`, appCommand: `terminal.prompt:${style.id}` })),
      ],
    },
  ],
};
