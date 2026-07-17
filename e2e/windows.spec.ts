import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// WM drag/snap/restore/close (catalog #2). Window.tsx drags the title bar via
// raw pointer events (not HTML5 dragstart), so this drives page.mouse
// down/move/up directly. Dropping within SNAP_EDGE_PX (8px) of the left edge
// triggers windowStore.snapWindow, resizing to half the viewport; dragging a
// snapped window's title bar again peels it back to restoreRect on the very
// first pointerdown of that drag — no separate "un-snap" gesture needed.
// Pointer-drag timing is the flakiest part of this seam across engines, so
// every move uses multiple steps and assertions only look at the committed
// (post-mouse.up) rect, never the mid-drag preview.

// Polls (rather than a single read) so a still-settling layout under load
// doesn't produce a one-off flaky mismatch — retries until the geometry
// lands within tolerance or the default expect timeout elapses.
async function expectApprox(
  read: () => Promise<number | undefined>,
  expected: number,
  tolerance: number,
): Promise<void> {
  await expect.poll(read).toBeGreaterThan(expected - tolerance);
  await expect.poll(read).toBeLessThan(expected + tolerance);
}

test.describe("Window manager drag / snap / restore / close", () => {
  test("drag to the left edge snaps, dragging back restores, then close", async ({ page }) => {
    await openFiles(page);

    const win = page.locator("[data-window-id]");
    await expect(win).toHaveCount(1);
    // Window.tsx animates a new window in with a 180ms transform/opacity
    // transition (scale 0.96 → 1) — reading boundingBox() before it settles
    // captures a mid-transition, scaled-down width, so a later "restored"
    // read (well past any transition) would never match it.
    await page.waitForTimeout(250);
    const baseline = await win.boundingBox();
    if (!baseline)
      throw new Error("window not laid out");

    const titleY = baseline.y + 15;
    const titleCenterX = baseline.x + baseline.width / 2;

    // Drag the title bar to the left screen edge — x=2 is inside the 8px
    // snap zone, so releasing there snaps the window to the left half.
    await page.mouse.move(titleCenterX, titleY);
    await page.mouse.down();
    await page.mouse.move(2, titleY, { steps: 15 });
    await page.mouse.up();

    const viewport = page.viewportSize();
    if (!viewport)
      throw new Error("no viewport size");

    await expectApprox(async () => (await win.boundingBox())?.width, viewport.width / 2, 4);
    await expectApprox(async () => (await win.boundingBox())?.x, 0, 4);

    const snapped = await win.boundingBox();
    if (!snapped)
      throw new Error("window not laid out after snap");

    // Drag the now-snapped title bar back toward center — the very first
    // pointerdown of this drag peels the window back to its restoreRect.
    const snappedTitleY = snapped.y + 15;
    await page.mouse.move(snapped.x + snapped.width / 2, snappedTitleY);
    await page.mouse.down();
    await page.mouse.move(viewport.width / 2, snappedTitleY, { steps: 15 });
    await page.mouse.up();

    await expectApprox(async () => (await win.boundingBox())?.width, baseline.width, 4);
    await expectApprox(async () => (await win.boundingBox())?.height, baseline.height, 4);

    // Close it via the window control.
    await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);
  });
});
