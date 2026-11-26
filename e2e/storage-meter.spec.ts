import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// C5 (step 18) — the storage meter, ROADMAP risk R1: nothing showed how full
// the browser's quota was, and there is no server-side copy to fall back on.
// The specs stub the browser's estimate for a deterministic figure rather
// than asserting on real usage.

test.describe("Storage meter (C5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Replaced wholesale: some engines don't expose a StorageManager to patch.
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: {
          estimate: async () => ({ usage: 900 * 1024 * 1024, quota: 1000 * 1024 * 1024 }),
          persist: async () => true,
        },
      });
    });
  });

  test("Settings shows usage against quota and warns when it's nearly full", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "General" }).click();
    await expect(page.getByRole("meter", { name: "Storage used" })).toHaveAttribute("aria-valuenow", "90");
    await expect(page.getByText("About 900 MB of 1000 MB used (90%).")).toBeVisible();
    await expect(page.getByText("Space is running low.")).toBeVisible();
  });

  test("the menu-bar item is off until it's enabled", async ({ page }) => {
    await boot(page);
    await expect(page.getByRole("status", { name: "Storage 90% used" })).toHaveCount(0);

    await openApp(page, "settings");
    await page.getByRole("button", { name: "Menu Bar" }).click();
    await page.getByRole("switch", { name: "Show Storage meter" }).click();
    await expect(page.getByRole("status", { name: "Storage 90% used" })).toBeVisible();
  });
});
