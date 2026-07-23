import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// H1: Tab must stay within the focused window's controls, not leak into a
// background window or shell chrome. Two windows are kept open so a leak
// has a background window to land in — a single-window test wouldn't catch
// a leak into the menu bar or dock either.
test.describe("Window Tab focus trap (H1)", () => {
  test("Tab and Shift+Tab cycle within the focused window, never landing in the background window or shell chrome", async ({ page }) => {
    await boot(page);
    await openApp(page, "files");
    await openApp(page, "settings");

    const windowIds = await page.locator("[data-window-id]").evaluateAll(
      els => els.map(el => el.getAttribute("data-window-id")),
    );
    expect(windowIds).toHaveLength(2);
    const focusedWindow = page.locator("[data-window-focused=\"true\"]");
    const focusedId = await focusedWindow.getAttribute("data-window-id");
    const backgroundId = windowIds.find(id => id !== focusedId);
    expect(focusedId).toBeTruthy();
    expect(backgroundId).toBeTruthy();

    // Seed focus inside the window — the trap only contains Tab once focus
    // has actually entered (opening from the dock doesn't move focus in
    // itself), standing in for a user click before tabbing around.
    await focusedWindow.getByRole("button", { name: "close window" }).focus();

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
