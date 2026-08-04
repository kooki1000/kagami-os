import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Regression: `setViewport` was fed by App.tsx's resize listener but never
// re-laid-out the windows — maximized ones kept the old screen's dimensions,
// and edge-adjacent ones could strand their title bar out of reach.

test.describe("windows track viewport resizes", () => {
  test("a maximized window re-fills the viewport after the browser shrinks", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFiles(page);

    const win = page.locator("[data-window-id]");
    await win.locator("button[aria-label=\"zoom window\"]").click();
    await expect.poll(async () => (await win.boundingBox())?.width).toBe(1280);

    await page.setViewportSize({ width: 820, height: 620 });

    await expect.poll(async () => (await win.boundingBox())?.width).toBe(820);
    await expect.poll(async () => (await win.boundingBox())?.height).toBe(620 - 30);
  });

  test("a window near the edge stays reachable after the browser shrinks", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFiles(page);

    const win = page.locator("[data-window-id]");
    const title = win.locator("[data-window-title]");

    // Drag the window down to the bottom-right of the large viewport.
    const start = await title.boundingBox();
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
    await page.mouse.down();
    await page.mouse.move(1150, 820, { steps: 8 });
    await page.mouse.up();

    await page.setViewportSize({ width: 700, height: 500 });

    // At least 80px of the window and its whole title bar must remain on
    // screen, or it can never be grabbed again. Polled, like the maximize
    // case above: the clamp runs from App.tsx's resize listener through a
    // React commit, so reading the box straight after `setViewportSize`
    // races it — and read too early it returns the *pre*-clamp position,
    // which is exactly the failure this test is meant to describe.
    await expect.poll(async () => (await win.boundingBox())!.x).toBeLessThanOrEqual(700 - 80);
    const box = await win.boundingBox();
    expect(box!.y).toBeLessThanOrEqual(500 - 40);
    expect(box!.y).toBeGreaterThanOrEqual(30);
  });
});
