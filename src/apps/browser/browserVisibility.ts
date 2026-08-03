/**
 * When the native child webview may be shown (U17).
 *
 * The webview always paints above the main webview's DOM — there is no
 * z-ordering between them — so it has to hide whenever the shell needs to
 * draw over its content region. That used to be approximated as "only while
 * this window is focused", which is far stricter than the constraint: an
 * unfocused Browser window that nothing actually covers can keep rendering
 * its page, which is the ordinary two-windows-side-by-side case.
 *
 * What counts as covering it is decided here, from the window list alone.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of a window this test needs: where it is, how high it stacks, whether it paints at all. */
export interface OccludingWindow {
  id: string;
  rect: Rect;
  zIndex: number;
  minimized: boolean;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

/**
 * Whether anything the shell stacks above `windowId` covers `content`.
 *
 * Deliberately *not* accounted for:
 *
 * - **Window drop shadows**, which extend well past a window's rect. A shadow
 *   falling across the page gets clipped by it. Padding the test by the shadow
 *   radius would fix that by blanking the page whenever a window came within
 *   ~30px — hiding a whole page to preserve a shadow is the wrong trade.
 * - **The dock and menu bar.** A focused Browser window already paints over
 *   both when it overlaps them; treating them as occluders here would make an
 *   unfocused window hide where a focused one doesn't, which is backwards.
 *
 * A missing window reads as occluded: no geometry to test means no basis for
 * showing a native view over the shell.
 */
export function isContentOccluded(
  content: Rect,
  windows: OccludingWindow[],
  windowId: string,
): boolean {
  const self = windows.find(w => w.id === windowId);
  if (!self)
    return true;
  return windows.some(other =>
    other.id !== windowId
    && !other.minimized
    && other.zIndex > self.zIndex
    && overlaps(content, other.rect),
  );
}
