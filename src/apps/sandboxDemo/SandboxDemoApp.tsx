import type { AppWindowProps } from "@/system/apps/types";
import { SandboxedAppHost } from "@/system/sandbox/SandboxedAppHost";
import { DEMO_ENTRY_HTML } from "./demoEntry";

// Declared once at module scope rather than inline in the JSX below,
// so it isn't reallocated on every render.
const CAPABILITIES = ["fs.read:documents", "notifications"];

export default function SandboxDemoApp(props: AppWindowProps) {
  return (
    <SandboxedAppHost
      {...props}
      appId="sandboxDemo"
      entryHtml={DEMO_ENTRY_HTML}
      capabilities={CAPABILITIES}
    />
  );
}
