import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// Catalog #10: themeStore/settingsStore persist the theme preference, the
// chosen look and its overrides to localStorage independent of the IndexedDB
// fs adapter, and inline vars on <html> reflect them — this guards both the
// live apply and that a reload rehydrates the same choices.
//
// The <html> attribute and CSS vars land in a React effect after each click
// resolves, so every assertion polls rather than reading once.

function readTheme(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.dataset.theme);
}

function readVar(page: import("@playwright/test").Page, name: string) {
  return () => page.evaluate(
    property => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    name,
  );
}

test.describe("Appearance: theme + look persistence", () => {
  test("dark mode and a non-default look survive a reload", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await expect(page.getByRole("button", { name: "Dark" })).toBeVisible();

    const readAccent = readVar(page, "--accent");
    const readWall = readVar(page, "--wall");
    const accentBefore = await readAccent();

    await page.getByRole("button", { name: "Dark" }).click();
    await expect.poll(() => readTheme(page)).toBe("dark");

    // Looks are a radiogroup — one choice sets accent, control duotone and
    // wallpaper together, which is the whole point of the model.
    await page.getByRole("radio", { name: "Slate" }).click();
    await expect.poll(readAccent).not.toBe(accentBefore);
    const accentAfter = await readAccent();
    const wallAfter = await readWall();

    await page.reload();
    await boot(page);

    await expect.poll(() => readTheme(page)).toBe("dark");
    await expect.poll(readAccent).toBe(accentAfter);
    await expect.poll(readWall).toBe(wallAfter);
  });

  test("a wallpaper design chosen under Customize survives a reload", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");

    const readWall = readVar(page, "--wall");
    const wallBefore = await readWall();

    await page.getByRole("button", { name: "Customize" }).click();
    await page.getByRole("radio", { name: "Contour" }).click();
    await expect.poll(readWall).not.toBe(wallBefore);
    const wallAfter = await readWall();

    await page.reload();
    await boot(page);

    await expect.poll(readWall).toBe(wallAfter);
  });

  test("the material control retints the chrome and persists", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");

    const readFilter = readVar(page, "--chrome-filter");
    await expect.poll(readFilter).toContain("blur(18px)");

    await page.getByRole("button", { name: "Opaque" }).click();
    await expect.poll(readFilter).toBe("none");

    await page.reload();
    await boot(page);

    await expect.poll(readFilter).toBe("none");
  });
});
