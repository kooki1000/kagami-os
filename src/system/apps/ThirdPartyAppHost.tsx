import type { AppWindowProps } from "./types";
import { useEffect, useState } from "react";
import { resolveFileBytes } from "@/apps/files/download";
import { blobStore } from "@/system/fs/blobStore";
import { fileSystem } from "@/system/fs/provider";
import { SandboxedAppHost } from "@/system/sandbox/SandboxedAppHost";
import { buildThirdPartyEntryHtml } from "./thirdPartyEntryHtml";

export interface ThirdPartyAppHostProps extends AppWindowProps {
  appId: string;
  /** fs node id of the app's entry script, resolved once at scan time (`installedApps.ts`). */
  entryNodeId: string;
  capabilities: readonly string[];
}

/**
 * Turns one installed bundle into a running sandboxed window. Resolves the
 * entry script's bytes fresh per mount (rather than at scan time) and hands
 * them to `buildThirdPartyEntryHtml`, which embeds them as base64 for the
 * frame's own loader to turn into a same-realm `blob:` URL — see that
 * file's doc comment for why this side can't build the blob: URL itself.
 */
export function ThirdPartyAppHost(props: ThirdPartyAppHostProps) {
  const { entryNodeId, capabilities } = props;
  const [entryHtml, setEntryHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const node = await fileSystem.readFile(entryNodeId);
        const bytes = await resolveFileBytes(node, blobStore);
        if (!cancelled)
          setEntryHtml(buildThirdPartyEntryHtml(bytes));
      }
      catch {
        // Entry bytes vanished or the node was removed between scan and
        // launch — leave entryHtml null, so the frame simply never mounts
        // rather than mounting broken.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entryNodeId]);

  if (!entryHtml)
    return null;

  return (
    <SandboxedAppHost
      {...props}
      entryHtml={entryHtml}
      capabilities={capabilities as string[]}
    />
  );
}
