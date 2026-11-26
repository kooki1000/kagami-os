import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// B13 (step 18) — a backup is the whole desktop, not just the files: the
// look, preferences and installed-app grants come back with the disk. This
// is its exit criterion: export, lose everything, import, and the settings an
// installed app was granted are the ones that were exported (here, with one
// capability revoked, so "restored" can't be confused with "re-granted").

async function wipeStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(db => db.name
        ? new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(db.name!);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          })
        : Promise.resolve()),
    );
  });
}

test.describe("Whole-desktop backup (B13)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kagami:flag:third_party_apps", "on"));
  });

  test("settings, installed apps and their grants survive export, wipe and import", async ({ page, browserName }) => {
    // Same driver limitation export-import.spec.ts records: WebKit can't read a download's bytes back.
    test.skip(browserName === "webkit", "Playwright's WebKit driver can't read a completed download's bytes back in this environment");

    await boot(page);

    // A setting, an installed app, and a revoked capability.
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Menu Bar" }).click();
    await page.getByRole("switch", { name: "Show seconds in the clock" }).click();
    await page.getByRole("button", { name: "Apps", exact: true }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/hello-world-app.zip");
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await expect(page.getByText("\"Hello World\" installed")).toBeVisible();
    await page.getByRole("switch", { name: "Allow Hello World to use notifications" }).click();

    await page.getByRole("button", { name: "General" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export disk" }).click(),
    ]);
    const zipPath = await download.path();
    expect(zipPath).toBeTruthy();

    // Lose everything, then restore.
    await wipeStorage(page);
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Menu Bar" }).click();
    await expect(page.getByRole("switch", { name: "Show seconds in the clock" })).not.toBeChecked();

    await page.getByRole("button", { name: "General" }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles(zipPath!);
    await page.getByRole("button", { name: "Click again to replace the disk" }).click();
    await expect(page.getByText("Disk restored")).toBeVisible();
    await expect(page.getByText("with your settings")).toBeVisible();

    // The setting is back, live, with no reload.
    await page.getByRole("button", { name: "Menu Bar" }).click();
    await expect(page.getByRole("switch", { name: "Show seconds in the clock" })).toBeChecked();

    // The app is installed again, with exactly the grants it had: one kept, one still revoked.
    await page.getByRole("button", { name: "Apps", exact: true }).click();
    await expect(page.getByRole("button", { name: "Uninstall Hello World" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Allow Hello World to use notifications" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Allow Hello World to use fs.write:hello-world-data" })).toBeChecked();
  });

  // B15 — the other way to bring a backup in: add it, don't restore it.
  test("importing into a folder adds the files and changes nothing else", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Playwright's WebKit driver can't read a completed download's bytes back in this environment");

    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "General" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export disk" }).click(),
    ]);
    const zipPath = await download.path();
    expect(zipPath).toBeTruthy();

    // A setting changed after the backup was made: a restore would undo it, a merge mustn't.
    await page.getByRole("button", { name: "Menu Bar" }).click();
    await page.getByRole("switch", { name: "Show seconds in the clock" }).click();
    await page.getByRole("button", { name: "General" }).click();

    // The second file input is "Import into a folder"; the first is the destructive restore.
    await page.locator("input[type=\"file\"]").nth(1).setInputFiles(zipPath!);
    await expect(page.getByText("Backup imported")).toBeVisible();
    await page.getByRole("button", { name: "Open", exact: true }).click();

    // Files opens on the new folder, which holds the exported tree as plain folders.
    await expect(page.locator("[data-node-name=\"Home\"]")).toBeVisible();
    await expect(page.locator("[data-node-name=\"Trash\"]")).toBeVisible();

    await openApp(page, "settings");
    await page.getByRole("button", { name: "Menu Bar" }).click();
    await expect(page.getByRole("switch", { name: "Show seconds in the clock" })).toBeChecked();
  });
});
