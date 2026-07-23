import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// H1: Tab should stay within the focused window's own controls rather than
// leaking into a background window or the browser/menu-bar/dock chrome.
// Two windows are open throughout so a leak has somewhere concrete (the
// other window) to land in, not just "nowhere" — a stronger repro than a
// single-window test, which an unbounded Tab leak into the menu bar or dock
// wouldn't fail either.
test.describe("Window Tab focus trap (H1)", () => {
  test("Tab and Shift+Tab cycle within the focused window, never landing in the background window or shell chrome", async ({ page }) => {
    await boot(page);
    await openApp(page, "files");
    await openApp(page, "settings");

    const windowIds = await page.locator("[data-window-id]").evaluateAll(
      els => els.map(el => el.getAttribute("data-window-id")),
    );
    expect(windowIds).toHaveLength(2);
    const focusedId = await page.locator("[data-window-focused=\"true\"]").getAttribute("data-window-id");
    const backgroundId = windowIds.find(id => id !== focusedId);
    expect(focusedId).toBeTruthy();
    expect(backgroundId).toBeTruthy();

    async function activeWindowId(): Promise<string | null> {
      return page.evaluate(() => document.activeElement?.closest("[data-window-id]")?.getAttribute("data-window-id") ?? null);
    }

    // More presses than any window plausibly has focusable controls, so a
    // wrap failure (landing outside the trap) would have already shown up.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const id = await activeWindowId();
      expect(id).toBe(focusedId);
      expect(id).not.toBe(backgroundId);
    }

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Shift+Tab");
      const id = await activeWindowId();
      expect(id).toBe(focusedId);
      expect(id).not.toBe(backgroundId);
    }
  });
});
