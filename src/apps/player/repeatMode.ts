/**
 * U12: repeat modes for the Player's `onEnded` handler.
 *
 * Semantics (decided here, since the roadmap left the exact "off" vs "all"
 * split open): "off" plays the folder once through in order and stops after
 * the last track — the closer reading of the roadmap's own exit criterion
 * ("plays a 10-track folder start to finish"), since looping past the finish
 * forever doesn't read as "start to finish" so much as "forever." "all"
 * loops the whole folder indefinitely (wraps past the last track back to the
 * first). "one" always replays the current track regardless of position.
 */
export type RepeatMode = "off" | "one" | "all";

export type EndedAction = "replay" | "advance" | "stop";

export interface OnEndedInput {
  repeat: RepeatMode;
  /**
   * Whether stepping forward from the current track lands on a *different*
   * track without wrapping — i.e. the current track isn't the last one in
   * the active play order (shuffled or not). `false` for a single-track
   * "folder" too, since there's nowhere to advance to either way.
   */
  hasNext: boolean;
}

/**
 * Pure decision for what `onEnded` should do next, as a function of repeat
 * mode and position. `"advance"` always means "call the existing step(1)",
 * which wraps around by itself (`stepSibling`) — "all" reaching the end of
 * the folder and "off" moving from track 3 to track 4 both resolve to the
 * same action, just at different points in the folder.
 */
export function onEndedAction({ repeat, hasNext }: OnEndedInput): EndedAction {
  if (repeat === "one")
    return "replay";
  if (hasNext)
    return "advance";
  return repeat === "all" ? "advance" : "stop";
}
