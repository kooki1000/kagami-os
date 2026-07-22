import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openApp, openFiles } from "./helpers";

// ⌥Tab / ⌃⌥Tab app switcher (C2). The chord is platform-branched
// (windowShortcuts.ts's isSwitcherChord) — real ⌥Tab is free on macOS but
// plain Alt+Tab is OS-reserved on Windows/Linux, so this reads the same
// platform check the app itself uses (lib/format.ts's isMacPlatform) rather
// than hardcoding one chord, so the spec passes regardless of which OS the
// browser under test reports.

async function switcherModifiers(page: Page): Promise<string[]> {
  const mac = await page.evaluate(() => {
    const platform = (navigator as unknown as { userAgentData?: { platform?: string } })
      .userAgentData
      ?.platform ?? navigator.platform ?? navigator.userAgent;
    return /mac/i.test(platform);
  });
  return mac ? ["Alt"] : ["Control", "Alt"];
}

test.describe("App switcher (⌥Tab / ⌃⌥Tab)", () => {
  test("holding the modifier and pressing Tab opens the switcher on the previous app; releasing focuses it", async ({ page }) => {
    await openFiles(page);
    await openApp(page, "notes");
    await expect(page.locator("[data-window-id]")).toHaveCount(2);
    await expect(page.locator("[data-window-focused=\"true\"]")).toHaveAttribute("data-window-id", /.+/);

    const modifiers = await switcherModifiers(page);
    for (const m of modifiers) await page.keyboard.down(m);
    await page.keyboard.press("Tab");

    const dialog = page.getByRole("dialog", { name: "App switcher" });
    await expect(dialog).toBeVisible();
    // Notes is focused, so the switcher opens with Files (the previous app)
    // highlighted, not Notes itself.
    await expect(page.locator("[data-switcher-app=\"files\"]")).toHaveClass(/ring-accent/);

    for (const m of modifiers) await page.keyboard.up(m);
    await expect(dialog).toHaveCount(0);

    // Releasing the modifier committed the highlighted app (Files).
    const focused = page.locator("[data-window-focused=\"true\"]");
    await expect(focused).toHaveCount(1);
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
  });

  test("Escape closes the switcher without changing focus", async ({ page }) => {
    await openFiles(page);
    await openApp(page, "notes");

    const initiallyFocused = await page.locator("[data-window-focused=\"true\"]").getAttribute("data-window-id");

    const modifiers = await switcherModifiers(page);
    for (const m of modifiers) await page.keyboard.down(m);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("dialog", { name: "App switcher" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "App switcher" })).toHaveCount(0);
    for (const m of modifiers) await page.keyboard.up(m);

    await expect(page.locator("[data-window-focused=\"true\"]")).toHaveAttribute("data-window-id", initiallyFocused!);
  });
});

test.describe("Cycle windows of the focused app (⌃`)", () => {
  test("focuses the next window of the same app, wrapping around", async ({ page }) => {
    await openFiles(page);
    await page.keyboard.press("ControlOrMeta+n");
    await expect(page.locator("[data-window-id]")).toHaveCount(2);

    const ids = await page.locator("[data-window-id]").evaluateAll(
      els => els.map(el => el.getAttribute("data-window-id")),
    );
    const focusedBefore = await page.locator("[data-window-focused=\"true\"]").getAttribute("data-window-id");

    await page.keyboard.press("Control+Backquote");

    const focusedAfter = await page.locator("[data-window-focused=\"true\"]").getAttribute("data-window-id");
    expect(focusedAfter).not.toBe(focusedBefore);
    expect(ids).toContain(focusedAfter);
  });
});
