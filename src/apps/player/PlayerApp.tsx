import type { RepeatMode } from "./repeatMode";
import type { AppWindowProps } from "@/system/apps/types";
import type { FsNode } from "@/system/fs/types";
import {
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toolbarIconButtonClass } from "@/apps/shared/toolbarIconButton";
import { formatDuration } from "@/lib/format";
import { useLatestRef } from "@/lib/useLatestRef";
import { useAppCommand } from "@/system/appCommands";
import { usePayloadFileId, useSyncWindowTitle } from "@/system/apps/filePayload";
import { siblingsOf, stepSibling } from "@/system/apps/siblingNav";
import { useFsStore } from "@/system/fs/fsStore";
import { isBlobMissing, useBlobUrl } from "@/system/fs/useBlobUrl";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useBareArrowKeys } from "@/system/shortcuts";
import { isAudioNode, isVideoNode } from "../files/fileMeta";
import { onEndedAction } from "./repeatMode";
import { applyShuffleOrder, buildShuffleOrder } from "./shuffleOrder";

import { Slider } from "./Slider";

const SPEEDS = [0.5, 1, 1.5, 2];

export default function PlayerApp({ windowId, payload, focused }: AppWindowProps) {
  // The playlist cursor (D5): starts at the file that opened the window;
  // Next/Previous move it within this same window rather than launching a
  // new one.
  const [activeId, setActiveId] = usePayloadFileId(payload);

  const nodes = useFsStore(s => s.nodes);
  const node = activeId ? nodes[activeId] : undefined;
  const { url: blobUrl, status: blobStatus } = useBlobUrl(node?.contentRef);

  const playerVolume = useSettingsStore(s => s.playerVolume);
  const setPlayerVolume = useSettingsStore(s => s.setPlayerVolume);

  useSyncWindowTitle(windowId, node?.name);

  // Every other file of the same media kind (audio or video, not mixed) in
  // the opened file's folder, in the same order Files lists them.
  const siblings = useMemo<FsNode[]>(() => {
    if (!node)
      return [];
    const wantVideo = isVideoNode(node);
    return siblingsOf(nodes, node, n => (wantVideo ? isVideoNode(n) : isAudioNode(n)));
  }, [nodes, node]);
  const siblingIds = useMemo(() => siblings.map(s => s.id), [siblings]);
  const siblingIdsKey = siblingIds.join(" ");

  // Read the latest activeId/siblingIds via refs rather than closing over
  // them, matching ViewerApp's pattern — this keeps the shuffle-rebuild
  // effect's dependency list to just what should actually trigger a
  // reshuffle (see below), and keeps `step` a stable identity for the
  // keyboard listener.
  const activeIdRef = useLatestRef(activeId);
  const siblingIdsRef = useLatestRef(siblingIds);

  // Shuffle order, held stable in state rather than rebuilt every render
  // (see shuffleOrder.ts's own docs) — only re-rolled when shuffle is turned
  // on, or the folder's set of tracks changes while it's already on.
  const [shuffle, setShuffle] = useState(false);
  const [shuffleOrderIds, setShuffleOrderIds] = useState<string[]>([]);
  useEffect(() => {
    if (shuffle)
      // Rebuilding the order is the whole point of this effect (see the
      // comment above) — pre-existing, unrelated to the refs below.
      // eslint-disable-next-line react/set-state-in-effect
      setShuffleOrderIds(buildShuffleOrder(siblingIdsRef.current, activeIdRef.current));
    // activeIdRef/siblingIdsRef's identity (from useLatestRef) never changes,
    // so listing them doesn't cause an extra reshuffle — it just satisfies
    // exhaustive-deps, which can't see through the custom hook the way it
    // can a literal useRef().
  }, [shuffle, siblingIdsKey, activeIdRef, siblingIdsRef]);

  const activeOrder = useMemo<FsNode[]>(
    () => (shuffle ? applyShuffleOrder(siblings, shuffleOrderIds) : siblings),
    [shuffle, siblings, shuffleOrderIds],
  );
  const activeOrderRef = useLatestRef(activeOrder);

  const step = useCallback((delta: number): void => {
    setActiveId(prev => stepSibling(activeOrderRef.current, prev, delta) ?? prev);
  }, [setActiveId, activeOrderRef]);

  // Whether stepping forward lands on a different track without wrapping —
  // repeatMode.ts's `hasNext` input, deciding what onEnded does at the end
  // of the folder.
  const activeIdx = activeOrder.findIndex(n => n.id === activeId);
  const hasNext = activeIdx !== -1 && activeIdx < activeOrder.length - 1;

  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const lastVolumeRef = useRef(playerVolume || 0.8);

  // A track switch (key={activeId} below fully remounts the media element)
  // resets these to their pre-load state; the new element's loadedmetadata/
  // timeupdate events fill them back in. Done during render (React's
  // "adjust state on prop change" recipe, mirroring ViewerApp's identical
  // rotation/fit reset) rather than in an effect, avoiding an extra stale
  // render where the old track's time briefly shows against the new src.
  const [prevActiveId, setPrevActiveId] = useState(activeId);
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId);
    setCurrentTime(0);
    setDuration(0);
  }

  // volume/playbackRate have no JSX attribute equivalent (they're DOM
  // properties, not HTML attributes) and a track switch remounts the
  // element back to its defaults, so both are reapplied here rather than
  // passed as props.
  useEffect(() => {
    if (mediaRef.current)
      mediaRef.current.volume = playerVolume;
  }, [playerVolume, activeId]);
  useEffect(() => {
    if (mediaRef.current)
      mediaRef.current.playbackRate = rate;
  }, [rate, activeId]);
  useEffect(() => {
    if (playerVolume > 0)
      lastVolumeRef.current = playerVolume;
  }, [playerVolume]);

  // A stable identity (only ever touches mediaRef/its methods) so the
  // keydown listener below can depend on it without reinstalling itself.
  const togglePlay = useCallback((): void => {
    const media = mediaRef.current;
    if (!media)
      return;
    if (media.paused)
      void media.play();
    else
      media.pause();
  }, []);

  function handleEnded(): void {
    const action = onEndedAction({ repeat, hasNext });
    if (action === "replay") {
      const media = mediaRef.current;
      if (media) {
        media.currentTime = 0;
        void media.play();
      }
    }
    else if (action === "advance") {
      // A one-track "folder" wraps to the same id, and setting the
      // playlist cursor to its own current value is a no-op React bails
      // on — nothing would remount the media element to restart it. Replay
      // explicitly in that case so repeat "all" still loops a single track
      // instead of silently stopping (repeat "one" already covers a
      // multi-track folder replaying via the branch above).
      const next = stepSibling(activeOrderRef.current, activeId, 1);
      if (next === activeId) {
        const media = mediaRef.current;
        if (media) {
          media.currentTime = 0;
          void media.play();
        }
      }
      else {
        step(1);
      }
    }
  }

  function handleSeek(ratio: number): void {
    const media = mediaRef.current;
    if (!media || !(duration > 0))
      return;
    const time = ratio * duration;
    media.currentTime = time;
    setCurrentTime(time);
  }

  function toggleMute(): void {
    setPlayerVolume(playerVolume > 0 ? 0 : lastVolumeRef.current);
  }

  function cycleSpeed(): void {
    const idx = SPEEDS.indexOf(rate);
    setRate(SPEEDS[(idx + 1) % SPEEDS.length]);
  }

  function cycleRepeat(): void {
    setRepeat(r => (r === "off" ? "all" : r === "all" ? "one" : "off"));
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

  // The Slider's own arrow-key handling stops propagation before this ever
  // sees it, so a focused scrub/volume slider isn't double-handled.
  useBareArrowKeys(focused, step, togglePlay);

  // A node with a contentRef but no blob store entry is missing, not
  // loading — treat it the same as no track selected instead of spinning
  // forever (the same fix ViewerApp got for review-backlog #18).
  const blobMissing = isBlobMissing(node, blobStatus);

  if (!activeId || !node || blobMissing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-2 select-none">
        <Music className="size-7" strokeWidth={1.4} />
        <span className="text-13">
          {activeId ? "This file is no longer available" : "Open an audio or video file from Files"}
        </span>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="grid h-full place-items-center">
        <span className="size-[calc(10px*var(--ui-scale))] animate-pulse rounded-full bg-accent" />
      </div>
    );
  }

  const video = isVideoNode(node);
  const hasPlaylist = siblings.length > 1;
  const transportButton = toolbarIconButtonClass("size-7");
  const toggleButton = (active: boolean) =>
    `grid size-7 place-items-center rounded-[6px] enabled:hover:bg-ph disabled:opacity-35 ${
      active ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent" : "text-ink-2 enabled:hover:text-ink"
    }`;
  const speedButton
    = "grid h-7 min-w-7 place-items-center rounded-[6px] px-1 text-11 font-medium text-ink-2 tabular-nums enabled:hover:bg-ph enabled:hover:text-ink";

  const VolumeIcon = playerVolume === 0 ? VolumeX : playerVolume < 0.5 ? Volume1 : Volume2;
  const scrubRatio = duration > 0 ? currentTime / duration : 0;

  const mediaEvents = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => setCurrentTime(e.currentTarget.currentTime),
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => setDuration(e.currentTarget.duration),
    onDurationChange: (e: React.SyntheticEvent<HTMLMediaElement>) => setDuration(e.currentTarget.duration),
    onEnded: handleEnded,
  };

  return (
    <div className="flex h-full min-h-0">
      {hasPlaylist && (
        <div className="w-40 flex-none overflow-auto p-1.5 hairline-r">
          {siblings.map(track => (
            <button
              key={track.id}
              type="button"
              className={`block w-full truncate rounded-btn px-2 py-1 text-left text-12 ${
                track.id === activeId ? "bg-accent-strong text-white" : "text-ink hover:bg-ph"
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
                // No explicit `poster`: the video's own first frame renders
                // once loaded (paused, currentTime 0) — a free best-effort
                // stand-in for artwork without a thumbnail pipeline.
                <video
                  key={activeId}
                  ref={(el) => { mediaRef.current = el; }}
                  src={blobUrl}
                  autoPlay
                  className="max-h-full max-w-full"
                  {...mediaEvents}
                />
              )
            : (
                <>
                  <audio
                    key={activeId}
                    ref={(el) => { mediaRef.current = el; }}
                    src={blobUrl}
                    autoPlay
                    className="hidden"
                    {...mediaEvents}
                  />
                  <div className="flex flex-col items-center gap-3 text-ink-2">
                    <Music className="size-16" strokeWidth={1} />
                    <span className="max-w-64 truncate text-13 font-medium text-ink">{node.name}</span>
                  </div>
                </>
              )}
        </div>
        <div className="flex flex-none flex-col gap-1.5 px-3 py-2 hairline-t">
          <div className="flex items-center gap-2">
            <span className="w-10 flex-none text-right font-mono text-11 text-ink-2 tabular-nums">
              {formatDuration(currentTime)}
            </span>
            <Slider value={scrubRatio} onChange={handleSeek} ariaLabel="Seek" step={0.01} className="flex-1" />
            <span className="w-10 flex-none font-mono text-11 text-ink-2 tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous track"
              disabled={siblings.length < 2}
              className={transportButton}
              onClick={() => step(-1)}
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              className={transportButton}
              onClick={togglePlay}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              aria-label="Next track"
              disabled={siblings.length < 2}
              className={transportButton}
              onClick={() => step(1)}
            >
              <SkipForward className="size-4" />
            </button>
            <div className="mx-1 h-4 w-px bg-hairline" />
            <button
              type="button"
              aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
              aria-pressed={shuffle}
              disabled={siblings.length < 2}
              className={toggleButton(shuffle)}
              onClick={() => setShuffle(s => !s)}
            >
              <Shuffle className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Repeat: ${repeat}`}
              aria-pressed={repeat !== "off"}
              className={toggleButton(repeat !== "off")}
              onClick={cycleRepeat}
            >
              {repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
            </button>
            <button type="button" aria-label={`Playback speed ${rate}×`} className={speedButton} onClick={cycleSpeed}>
              {`${rate}×`}
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" aria-label={playerVolume === 0 ? "Unmute" : "Mute"} className={transportButton} onClick={toggleMute}>
                <VolumeIcon className="size-4" />
              </button>
              <Slider value={playerVolume} onChange={setPlayerVolume} ariaLabel="Volume" className="w-16" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
