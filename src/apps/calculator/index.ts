import type { AppManifest } from "@/system/apps/types";
import { Calculator } from "lucide-react";
import { lazy } from "react";

/**
 * D7 (step 16b) — a scientific calculator. No sandbox, no file payload:
 * a self-contained utility exercising nothing but the manifest pattern
 * itself, per ROADMAP.md's "good first-contribution target" framing.
 */
export const calculatorApp: AppManifest = {
  id: "calculator",
  name: "Calculator",
  icon: Calculator,
  tileGradient: ["#6fb3a8", "#4c8c82"],
  defaultSize: { width: 460, height: 560 },
  minSize: { width: 400, height: 480 },
  component: lazy(() => import("./CalculatorApp")),
  singleInstance: true,
  pinned: true,
  menus: [
    {
      title: "Edit",
      items: [
        { label: "Copy Result", appCommand: "calculator.copyResult", shortcut: "⌘C" },
      ],
    },
  ],
};
