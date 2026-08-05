import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// Step 17 (D8.5) — the install flow's own accept criterion (ROADMAP.md
// §4): installing a bundle from outside the repo makes it launchable with
// no reload. `hello-world-app.zip` (e2e/fixtures) is a manifest.json +
// entry.js pair built the way a real third-party author would ship one —
// its entry script runs inside the sandboxed frame and writes real DOM
// content, so this proves the whole VFS-scan → blob: URL → sandboxed
// script-execution pipeline end to end, not just that the bundle parsed.
// The "apps" Settings section only registers behind the third_party_apps
// flag, same seeded-before-boot pattern sandbox.spec.ts uses for
// app_sandbox — the flag is read at module-eval time.

test.describe("Install a third-party app (step 17, D8.5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kagami:flag:third_party_apps", "on"));
  });

  test("installing a bundle from outside the repo makes it launchable with no reload", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();

    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/hello-world-app.zip");

    // The consent screen shows exactly what's requested before anything is
    // written to disk.
    await expect(page.getByRole("dialog", { name: "Install Hello World" })).toBeVisible();
    await expect(page.getByText("notifications", { exact: true })).toBeVisible();
    await expect(page.getByText("fs.write:hello-world-data", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Install", exact: true }).click();
    await expect(page.getByText("\"Hello World\" installed")).toBeVisible();

    // No reload: launch it straight from the install toast's action.
    await page.getByRole("button", { name: "Open", exact: true }).click();

    const frame = page.frameLocator("iframe[title=\"hello-world\"]");
    await expect(frame.locator("#hello")).toHaveText("Hello from a third-party app!");
  });

  test("refuses installing the same app id twice", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();

    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/hello-world-app.zip");
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await expect(page.getByText("\"Hello World\" installed")).toBeVisible();

    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/hello-world-app.zip");
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await expect(page.getByText("Couldn't install app")).toBeVisible();
    await expect(page.getByText("already installed")).toBeVisible();
  });
});
