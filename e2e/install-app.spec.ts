import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
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

  test("uninstalling removes the app and lets it be installed again (D8.6)", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();

    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/hello-world-app.zip");
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await expect(page.getByText("\"Hello World\" installed")).toBeVisible();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.frameLocator("iframe[title=\"hello-world\"]").locator("#hello")).toBeVisible();

    // Settings is single-instance, so its dock tile raises it above the app's window.
    await openApp(page, "settings");
    // The Apps pane lists it with what it was granted; Uninstall needs a second click.
    await page.getByRole("button", { name: "Uninstall Hello World" }).click();
    await page.getByRole("button", { name: "Confirm uninstall of Hello World" }).click();
    await expect(page.getByText("\"Hello World\" uninstalled")).toBeVisible();
    await expect(page.getByRole("button", { name: "Uninstall Hello World" })).toHaveCount(0);
    // Its open window went with it.
    await expect(page.locator("iframe[title=\"hello-world\"]")).toHaveCount(0);

    // Gone from the registry and the VFS, so the same bundle installs cleanly again.
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/hello-world-app.zip");
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await expect(page.getByText("\"Hello World\" installed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Uninstall Hello World" })).toBeVisible();
  });

  // D8.7 — revoking a capability takes effect in a window that's already
  // open. The probe asks the shell to read the Documents folder, which isn't
  // a file: a granted call fails with `not_found`, an ungranted one with
  // `capability_denied`, so the error code says which side of the gate it hit.
  test("revoking a capability denies a running window's next call, no reload (D8.7)", async ({ page }) => {
    const manifest = { id: "probe", name: "Probe", version: "1.0.0", entry: "entry.js", capabilities: ["fs.read:documents"] };
    const entry = `
      const button = document.createElement("button");
      button.id = "probe";
      button.textContent = "Probe";
      const out = document.createElement("div");
      out.id = "result";
      document.body.append(button, out);
      window.addEventListener("message", (event) => {
        if (event.source === window.parent && event.data?.kind === "kagami.sandbox.response")
          out.textContent = event.data.ok ? "ok" : event.data.error.code;
      });
      button.addEventListener("click", () => {
        window.parent.postMessage({ kind: "kagami.sandbox.request", id: String(Math.random()), method: "fs.read", params: { id: "documents" } }, "*");
      });
    `;
    const buffer = Buffer.from(zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "entry.js": strToU8(entry) }));

    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles({ name: "probe.zip", mimeType: "application/zip", buffer });
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await page.getByRole("button", { name: "Open", exact: true }).click();

    // Settings sits on top of the probe's window from here on, so the button
    // is fired with dispatchEvent rather than a hit-tested click.
    const frame = page.frameLocator("iframe[title=\"probe\"]");
    const probe = () => frame.locator("#probe").dispatchEvent("click");
    await probe();
    await expect(frame.locator("#result")).toHaveText("not_found");

    await openApp(page, "settings");
    await page.getByRole("switch", { name: "Allow Probe to use fs.read:documents" }).click();

    // Same window, same frame, no reload.
    await probe();
    await expect(frame.locator("#result")).toHaveText("capability_denied");

    // Restoring what the app asked for restores access just as live.
    await openApp(page, "settings");
    await page.getByRole("switch", { name: "Allow Probe to use fs.read:documents" }).click();
    await probe();
    await expect(frame.locator("#result")).toHaveText("not_found");
  });
});
