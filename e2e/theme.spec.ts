import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// Catalog #10: themeStore/settingsStore persist preference + accent/wallpaper
// to localStorage independent of the IndexedDB fs adapter, and inline vars
// on <html> reflect the resolved theme — this guards both the live apply and
// that a reload rehydrates the same choices.

test.describe("Appearance: theme + accent + wallpaper persistence", () => {
  test("dark mode and a non-default accent survive a reload", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await expect(page.getByRole("button", { name: "Dark" })).toBeVisible();

    const readTheme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const readAccent = () => page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());

    const accentBefore = await readAccent();

    // The <html> attribute/CSS vars land in a React effect after the click
    // resolves, so poll rather than read once.
    await page.getByRole("button", { name: "Dark" }).click();
    await expect.poll(readTheme).toBe("dark");

    // Accent row renders before the Wallpaper row, so "Iris" here is the swatch.
    await page.getByRole("button", { name: "Iris" }).first().click();
    await expect.poll(readAccent).not.toBe(accentBefore);
    const accentAfter = await readAccent();

    // "Iris" here is the wallpaper swatch (DOM order disambiguates).
    await page.getByRole("button", { name: "Iris" }).last().click();

    await page.reload();
    await boot(page);

    await expect.poll(readTheme).toBe("dark");
    await expect.poll(readAccent).toBe(accentAfter);
  });
});
