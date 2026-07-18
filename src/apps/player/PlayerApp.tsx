import type { AppWindowProps } from "@/system/apps/types";
import type { FsNode } from "@/system/fs/types";
import { Music, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppCommand } from "@/system/appCommands";
import { payloadFileId } from "@/system/apps/openFile";
import { childrenOf, useFsStore } from "@/system/fs/fsStore";
import { useBlobUrl } from "@/system/fs/useBlobUrl";
import { useWindowStore } from "@/system/windows/windowStore";
import { isAudioNode, isVideoNode } from "../files/fileMeta";

export default function PlayerApp({ windowId, payload }: AppWindowProps) {
  // The playlist cursor (D5): starts at the file that opened the window, but
  // Next/Previous move it within this same window rather than launching a
  // new one — openFile.ts's "reuse an existing window" match is keyed off
  // the *opening* payload, so re-opening a since-selected track from Files
  // will still spawn a second window. An acceptable gap for a first pass.
  const [activeId, setActiveId] = useState<string | null>(() => payloadFileId(payload));
  const nodes = useFsStore(s => s.nodes);
  const node = activeId ? nodes[activeId] : undefined;
  const blobUrl = useBlobUrl(node?.contentRef);
  const setWindowTitle = useWindowStore(s => s.setWindowTitle);

  // Player windows are titled after the current track; keep the title bar in
  // step both on open and whenever Next/Previous switches tracks.
  useEffect(() => {
    if (node?.name)
      setWindowTitle(windowId, node.name);
  }, [node?.name, windowId, setWindowTitle]);

  // Every other file of the same media kind (audio or video, not mixed) in
  // the opened file's folder, in the same order Files lists them.
  const siblings = useMemo<FsNode[]>(() => {
    if (!node)
      return [];
    const wantVideo = isVideoNode(node);
    return childrenOf(nodes, node.parentId ?? "")
      .filter(n => (wantVideo ? isVideoNode(n) : isAudioNode(n)));
  }, [nodes, node]);

  function step(delta: number): void {
    if (siblings.length === 0)
      return;
    const idx = siblings.findIndex(n => n.id === activeId);
    const next = idx === -1 ? 0 : (idx + delta + siblings.length) % siblings.length;
    setActiveId(siblings[next].id);
  }

  useAppCommand(windowId, (command) => {
    switch (command) {
      case "player.next":
        step(1);
        break;
      case "player.previous":
        step(-1);
        break;
    }
  });

  if (!activeId || !node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-2 select-none">
        <Music className="size-7" strokeWidth={1.4} />
        <span className="text-[13px]">
          {activeId ? "This file is no longer available" : "Open an audio or video file from Files"}
        </span>
      </div>
    );
  }

  // Blob-backed media resolves its object URL asynchronously; a node with a
  // contentRef but no url yet is loading, not missing.
  if (!blobUrl) {
    return (
      <div className="grid h-full place-items-center">
        <span className="size-2.5 animate-pulse rounded-full bg-accent" />
      </div>
    );
  }

  const video = isVideoNode(node);
  const hasPlaylist = siblings.length > 1;
  const transportButton
    = "grid size-7 place-items-center rounded-[6px] text-ink-2 enabled:hover:bg-ph enabled:hover:text-ink disabled:opacity-35";

  return (
    <div className="flex h-full min-h-0">
      {hasPlaylist && (
        <div className="w-40 flex-none overflow-auto p-1.5 hairline-r">
          {siblings.map(track => (
            <button
              key={track.id}
              type="button"
              className={`block w-full truncate rounded-btn px-2 py-1 text-left text-[12px] ${
                track.id === activeId ? "bg-accent text-white" : "text-ink hover:bg-ph"
              }`}
              onClick={() => setActiveId(track.id)}
            >
              {track.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-2 p-4">
          {video
            ? (
                <video key={activeId} src={blobUrl} controls autoPlay className="max-h-full max-w-full" />
              )
            : (
                <div className="flex flex-col items-center gap-3 text-ink-2">
                  <Music className="size-16" strokeWidth={1} />
                  <span className="max-w-64 truncate text-[13px] font-medium text-ink">{node.name}</span>
                </div>
              )}
        </div>
        <div className="flex h-[46px] flex-none items-center justify-center gap-3 px-3 hairline-t">
          <button
            type="button"
            aria-label="Previous track"
            disabled={siblings.length < 2}
            className={transportButton}
            onClick={() => step(-1)}
          >
            <SkipBack className="size-4" />
          </button>
          {!video && (
            <audio key={activeId} src={blobUrl} controls autoPlay className="h-8 max-w-72 flex-1" />
          )}
          <button
            type="button"
            aria-label="Next track"
            disabled={siblings.length < 2}
            className={transportButton}
            onClick={() => step(1)}
          >
            <SkipForward className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
