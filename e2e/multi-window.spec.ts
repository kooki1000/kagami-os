import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Multi-instance window manager seams: Files' singleInstance is false, so
// ⌘N opens a second cascade-offset window; z-order/focus is a nextZ counter
// (not DOM order); minimize flies a window to its dock tile and the dock
// tile restores it; ⌘Q closes every window belonging to the focused app.

test.describe("Multi-window (Files)", () => {
  test("new window, refocus, minimize, dock-restore, quit-all", async ({ page }) => {
    await openFiles(page);

    // ⌘N opens a second, cascade-offset Files window.
    await page.keyboard.press("ControlOrMeta+n");
    await expect(page.locator("[data-window-control]")).toHaveCount(2);

    const ids = await page.locator("[data-window-id]").evaluateAll(
      els => els.map(el => el.getAttribute("data-window-id")),
    );
    expect(ids).toHaveLength(2);
    const [idA, idB] = ids as [string, string];

    // Exactly one window is focused at a time.
    async function focusedId(): Promise<string> {
      const focused = page.locator("[data-window-focused=\"true\"]");
      await expect(focused).toHaveCount(1);
      const id = await focused.getAttribute("data-window-id");
      if (!id)
        throw new Error("focused window missing data-window-id");
      return id;
    }

    const initiallyFocused = await focusedId();
    const other = initiallyFocused === idA ? idB : idA;

    // Click the other window's title bar (away from the control buttons,
    // which sit at the title bar's left edge) to bring it to front.
    await page.locator(`[data-window-id="${other}"]`).click({ position: { x: 300, y: 10 } });
    await expect(page.locator(`[data-window-id="${other}"]`)).toHaveAttribute("data-window-focused", "true");
    await expect(page.locator(`[data-window-id="${initiallyFocused}"]`)).toHaveAttribute("data-window-focused", "false");
    expect(await focusedId()).toBe(other);

    // Minimize the now-focused window — it flies to the dock and stops
    // rendering (WindowLayer skips minimized windows).
    await page.locator(`[data-window-id="${other}"] button[aria-label="minimize window"]`).click();
    await page.waitForTimeout(300);
    await expect(page.locator(`[data-window-id="${other}"]`)).toHaveCount(0);
    await expect(page.locator("[data-window-control]")).toHaveCount(1);

    // Dock.tsx's onTileClick only *restores* minimized instances when every
    // instance of the app is minimized — with one still visible, clicking
    // the tile just refocuses that visible one. Minimize the remaining
    // window too, so restore is actually the tile's only option.
    await page.locator(`[data-window-id="${initiallyFocused}"] button[aria-label="minimize window"]`).click();
    await page.waitForTimeout(300);
    await expect(page.locator("[data-window-control]")).toHaveCount(0);

    // Clicking the Files dock tile restores *every* minimized instance (C6),
    // not just one.
    await page.locator("[data-dock-app=\"files\"]").click();
    await expect(page.locator("[data-window-control]")).toHaveCount(2);

    // ⌘Q closes every window belonging to the focused app.
    await page.keyboard.press("ControlOrMeta+q");
    await expect(page.locator("[data-window-control]")).toHaveCount(0);
  });
});
