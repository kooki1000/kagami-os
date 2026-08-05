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
 * entry script's bytes into a same-realm `blob:` URL per mount (§
 * `thirdPartyEntryHtml.ts`), rather than at scan time, so the bytes are
 * fresh and the blob URL's lifetime matches the window's — revoked on
 * unmount rather than leaked for the session.
 */
export function ThirdPartyAppHost(props: ThirdPartyAppHostProps) {
  const { entryNodeId, capabilities } = props;
  const [entryHtml, setEntryHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let scriptUrl: string | null = null;

    void (async () => {
      try {
        const node = await fileSystem.readFile(entryNodeId);
        const bytes = await resolveFileBytes(node, blobStore);
        scriptUrl = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "text/javascript" }));
        if (!cancelled)
          setEntryHtml(buildThirdPartyEntryHtml(scriptUrl));
      }
      catch {
        // Entry bytes vanished or the node was removed between scan and
        // launch — leave entryHtml null, so the frame simply never mounts
        // rather than mounting broken.
      }
    })();

    return () => {
      cancelled = true;
      if (scriptUrl)
        URL.revokeObjectURL(scriptUrl);
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
