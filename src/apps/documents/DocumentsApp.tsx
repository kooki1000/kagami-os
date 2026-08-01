import type { AppWindowProps } from "@/system/apps/types";
import { useMemo } from "react";
import { usePayloadFileId } from "@/system/apps/filePayload";
import { SandboxedAppHost } from "@/system/sandbox/SandboxedAppHost";
import { buildDocumentsEntryHtml } from "./entryHtml";

/**
 * Thin host wrapper, same shape as `sandboxDemoApp`'s — the only
 * Documents-specific part is computing capabilities and `entryHtml` from
 * the launch payload instead of a fixed value.
 */
export default function DocumentsApp(props: AppWindowProps) {
  const [fileId] = usePayloadFileId(props.payload);

  // Scoped to exactly the file being opened, computed per launch — never a
  // static scope like sandboxDemo's fixed "fs.read:documents", since
  // Documents can be pointed at any PDF the user picks.
  const capabilities = useMemo(() => (fileId ? [`fs.read:${fileId}`] : []), [fileId]);
  const entryHtml = useMemo(() => buildDocumentsEntryHtml(fileId), [fileId]);

  return (
    <SandboxedAppHost
      {...props}
      appId="documents"
      entryHtml={entryHtml}
      capabilities={capabilities}
    />
  );
}
