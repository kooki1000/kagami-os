import type { AppManifest } from "@/system/apps/types";
import { FileText } from "lucide-react";
import { lazy } from "react";
import { restoreFilePayload, serializeFilePayload } from "@/system/apps/filePayload";

/**
 * D6 (step 16b) — PDF viewing, the sandbox's first real (non-demo)
 * consumer. Renders entirely inside the capability sandbox
 * (`DocumentsApp.tsx` → `SandboxedAppHost`) since PDF parsing is exactly
 * the kind of untrusted/complex-content risk G2 was built for
 * (`ROADMAP.md` R7) — unlike Notes' closed-vocabulary markdown preview,
 * which shipped outside the sandbox by design (§6 decision 8).
 */
export const documentsApp: AppManifest = {
  id: "documents",
  name: "Documents",
  icon: FileText,
  tileGradient: ["#c99a4a", "#a67730"],
  defaultSize: { width: 560, height: 680 },
  minSize: { width: 360, height: 420 },
  component: lazy(() => import("./DocumentsApp")),
  pinned: true,
  serializePayload: serializeFilePayload,
  restorePayload: restoreFilePayload,
  menus: [
    {
      title: "File",
      items: [
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
  ],
};
