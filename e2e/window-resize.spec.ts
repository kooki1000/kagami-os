import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Regression: the window store's viewport is fed by App.tsx's `resize`
// listener, but nothing re-laid-out the windows when it changed. A maximized
// window kept the *old* screen's dimensions, and a window near the old
// bottom/right edge could end up stranded past the new one with its title bar
// unreachable — no way to drag it back.

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
    // screen, or it can never be grabbed again.
    const box = await win.boundingBox();
    expect(box!.x).toBeLessThanOrEqual(700 - 80);
    expect(box!.y).toBeLessThanOrEqual(500 - 40);
    expect(box!.y).toBeGreaterThanOrEqual(30);
  });
});
