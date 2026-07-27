import type { AppWindowProps } from "@/system/apps/types";
import { SandboxedAppHost } from "@/system/sandbox/SandboxedAppHost";
import { DEMO_ENTRY_HTML } from "./demoEntry";

// Declared once at module scope, not inline in the JSX below, so it's a
// stable reference across renders — SandboxedAppHost re-subscribes its
// message listener whenever this array's identity changes.
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
