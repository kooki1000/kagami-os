import type { SandboxResponse } from "./types";
import type { AppWindowProps } from "@/system/apps/types";
import { useEffect, useRef } from "react";
import { useAppCommand } from "@/system/appCommands";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { fileSystem } from "@/system/fs/provider";
import { notify } from "@/system/notifications/notificationStore";
import { useWindowStore } from "@/system/windows/windowStore";
import { dispatchSandboxRequest } from "./bridge";
import { buildAppCommandEvent, parseSandboxRequest } from "./rpc";

export interface SandboxedAppHostProps extends AppWindowProps {
  /**
   * The manifest id — not part of `AppWindowProps`, needed to scope
   * capability checks and notification attribution to this app.
   */
  appId: string;
  /**
   * The `srcdoc` document to render. Delivered as a string the shell
   * already owns, not a URL — see `vite.config.ts`'s CSP note.
   */
  entryHtml: string;
  capabilities: string[];
}

/**
 * Posts a bridge response to the frame, transferring a file read's bytes
 * rather than structure-cloning them — same shape as `zipWorker.ts`'s
 * `postMessage({ok, data}, [buffer])`.
 */
function postResponse(target: Window, response: SandboxResponse) {
  const transfer: Transferable[] = [];
  if (response.ok && response.data && typeof response.data === "object" && "bytes" in response.data) {
    const bytes = (response.data as { bytes: unknown }).bytes;
    if (bytes instanceof ArrayBuffer)
      transfer.push(bytes);
  }
  target.postMessage(response, "*", transfer);
}

/**
 * Generic host for a step-16a sandboxed app: an opaque-origin
 * `<iframe sandbox="allow-scripts">` plus the postMessage bridge. An
 * `AppManifest.sandboxed` app's `component` is a thin wrapper that renders
 * this with its own `entryHtml`/`capabilities` — no other shell code
 * (`Window.tsx`, menu/appCommand routing) needs to know an app is
 * sandboxed at all.
 */
export function SandboxedAppHost({ windowId, appId, entryHtml, capabilities }: SandboxedAppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // A sandboxed frame's origin is the literal string "null", so
      // authenticate by identity (is this message from *my* iframe's
      // window?), never by comparing event.origin.
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow)
        return;

      const request = parseSandboxRequest(event.data);
      if (!request)
        return;

      dispatchSandboxRequest(
        request,
        { appId, windowId, capabilities },
        {
          fileSystem,
          blobStore,
          getNodes: () => useFsStore.getState().nodes,
          notify,
          setWindowTitle: (id, title) => useWindowStore.getState().setWindowTitle(id, title),
        },
      ).then((response) => {
        // The frame (and its window) may be gone by the time this
        // resolves; there's simply nowhere left to post the response.
        if (iframeRef.current?.contentWindow === frameWindow)
          postResponse(frameWindow, response);
      });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [appId, windowId, capabilities]);

  useAppCommand(windowId, (command) => {
    const frameWindow = iframeRef.current?.contentWindow;
    frameWindow?.postMessage(buildAppCommandEvent(command), "*");
  });

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={entryHtml}
      title={appId}
      className="size-full border-0"
    />
  );
}
