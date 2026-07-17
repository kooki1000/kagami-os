import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// Dock pin/unpin persistence, running indicator, and Settings-driven
// size/position relayout (plan §4.7, catalog #11) — dockStore + Dock.tsx.
test.describe("Dock pin, running indicator, and relayout", () => {
  test("running dot, pin survives close, and Settings resizes/repositions tiles", async ({ page }) => {
    await boot(page);

    // Every app manifest ships pinned by default (src/apps/*/index.ts), so
    // there's no naturally-unpinned tile at boot to exercise the "unpinned
    // but running" state. Unpin Notes while it's running instead — the tile
    // keeps rendering off the running-app set, which is exactly the case
    // the running-dot exists to distinguish.
    await openApp(page, "notes");
    const tile = page.locator("[data-dock-app=\"notes\"]");
    await expect(tile).toBeVisible();

    await tile.click({ button: "right" });
    await page.getByRole("button", { name: "Unpin from Dock" }).click();
    await expect(tile.locator("[data-dock-running]")).toBeVisible();

    // Pin it back, then close the window — the tile should persist (now
    // pinned, not running), and the running dot should be gone.
    await tile.click({ button: "right" });
    await page.getByRole("button", { name: "Pin to Dock" }).click();
    await page.locator("[aria-label=\"close window\"]").click();
    await expect(tile).toBeVisible();
    await expect(tile.locator("[data-dock-running]")).toHaveCount(0);

    // Settings > Dock: size relayout grows the tile.
    const beforeSize = await tile.boundingBox();
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Dock" }).click();
    await page.getByRole("button", { name: "Large" }).click();
    await expect.poll(async () => (await tile.boundingBox())?.width)
      .toBeGreaterThan(beforeSize!.width);

    // Position relayout: moving the dock to the left edge shifts the tile
    // toward x=0 (it was bottom-centered before).
    const beforePosition = await tile.boundingBox();
    await page.getByRole("button", { name: "Left" }).click();
    await expect.poll(async () => (await tile.boundingBox())?.x)
      .toBeLessThan(beforePosition!.x - 50);

    // Unpin now that the app isn't running — the tile should leave the dock.
    await tile.click({ button: "right" });
    await page.getByRole("button", { name: "Unpin from Dock" }).click();
    await expect(tile).toHaveCount(0);
  });
});
