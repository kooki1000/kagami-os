import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// B14 (step 18) — the backup reminder, ROADMAP risk R1. Nothing recorded an
// export before, so a person had no way to see how stale their only copy was.

const DAY_MS = 24 * 60 * 60 * 1000;

test.describe("Backup reminder (B14)", () => {
  test("an export is recorded and shown in Settings", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "General" }).click();
    await expect(page.getByText("Last backup: Never")).toBeVisible();

    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export disk" }).click(),
    ]);
    await expect(page.getByText("Last backup: Today")).toBeVisible();
  });

  test("an old last backup triggers one reminder at boot", async ({ page }) => {
    // Seeded as persisted settings, before the app boots. Only the fields under
    // test: the rest of the state merges in from the defaults.
    await page.addInitScript((lastBackupAt) => {
      // Init scripts run on every navigation; seed once so the second boot sees what the first one persisted.
      if (!localStorage.getItem("kagami-settings"))
        localStorage.setItem("kagami-settings", JSON.stringify({ state: { lastBackupAt }, version: 2 }));
    }, Date.now() - 10 * DAY_MS);
    await page.goto("/?fresh");
    await expect(page.getByText("Back up your files")).toBeVisible();
    await expect(page.getByText("Your last backup was 10 days ago.")).toBeVisible();

    // Once per stretch: a second boot without a new backup stays quiet.
    await page.goto("/?fresh");
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
    await expect(page.getByText("Back up your files")).toHaveCount(0);
  });

  test("a fresh install isn't told it's overdue", async ({ page }) => {
    await boot(page);
    await expect(page.getByText("Back up your files")).toHaveCount(0);
  });
});
