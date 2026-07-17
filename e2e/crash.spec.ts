import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// #15 Forced app crash → error card; shell survives. The `devcrash` app
// (src/apps/devcrash) only registers when the `e2e_crash` flag is on, so it
// must be seeded via localStorage *before* boot — the flag is read
// synchronously at `registry.ts` module-evaluation time, which happens
// during the app bundle's first execution on this page load.

test.describe("Forced app crash (#15)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kagami:flag:e2e_crash", "on"));
  });

  test("crash card renders, shell survives, Reload app recovers", async ({ page }) => {
    await boot(page);

    // A healthy window open beforehand, to prove the crash doesn't take
    // down anything but its own window.
    await openApp(page, "files");
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();

    await openApp(page, "devcrash");
    await expect(page.getByText("Crash Test stopped working")).toBeVisible();
    const reload = page.getByRole("button", { name: "Reload app" });
    await expect(reload).toBeVisible();

    // Rest of the shell is unaffected: dock, menu bar, and the earlier
    // Files window are all still there and functional.
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kagami" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
    await expect(page.locator("[data-window-id]")).toHaveCount(2);

    // DevCrashApp reads the flag fresh on every render (see its own
    // comment for why) — flip it off before reloading so the remount
    // actually recovers instead of crashing again.
    await page.evaluate(() => localStorage.setItem("kagami:flag:e2e_crash", "off"));
    await reload.click();
    await expect(page.getByText("Crash Test stopped working")).toHaveCount(0);
    await expect(page.getByText("Recovered.")).toBeVisible();
  });
});
