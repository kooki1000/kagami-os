import type { AppWindowProps } from "./types";
import { useEffect, useMemo, useState } from "react";
import { resolveFileBytes } from "@/apps/files/download";
import { blobStore } from "@/system/fs/blobStore";
import { fileSystem } from "@/system/fs/provider";
import { SandboxedAppHost } from "@/system/sandbox/SandboxedAppHost";
import { NO_GRANTS, useAppGrantsStore } from "./appGrantsStore";
import { effectiveCapabilities } from "./effectiveCapabilities";
import { buildThirdPartyEntryHtml } from "./thirdPartyEntryHtml";

export interface ThirdPartyAppHostProps extends AppWindowProps {
  appId: string;
  /** fs node id of the app's entry script, resolved once at scan time (`installedApps.ts`). */
  entryNodeId: string;
  /** The app's private data folder, or `null` if it has none (`installedApps.ts`). */
  dataFolderId: string | null;
}

/**
 * Turns one installed bundle into a running sandboxed window. Resolves the
 * entry script's bytes fresh per mount (rather than at scan time) and hands
 * them to `buildThirdPartyEntryHtml`, which embeds them as base64 for the
 * frame's own loader to turn into a same-realm `blob:` URL — see that
 * file's doc comment for why this side can't build the blob: URL itself.
 */
export function ThirdPartyAppHost(props: ThirdPartyAppHostProps) {
  const { appId, entryNodeId, dataFolderId } = props;
  // Subscribed rather than passed in: what an app may do can change while its
  // window is open (Settings › Apps, D8.7), and `SandboxedAppHost` syncs this
  // into the context every bridge call reads, so a revoked capability is
  // denied on the very next call with no reload.
  const grants = useAppGrantsStore(s => s.grants[appId] ?? NO_GRANTS);
  const capabilities = useMemo(() => effectiveCapabilities(grants, { dataFolderId }), [grants, dataFolderId]);
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
      capabilities={capabilities}
      dataFolderId={dataFolderId ?? undefined}
    />
  );
}
