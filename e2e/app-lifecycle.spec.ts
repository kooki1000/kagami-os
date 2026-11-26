import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { boot, openApp } from "./helpers";

// Step 17 (D8.8) — the whole third-party app lifecycle on the reference app
// (`examples/scratchpad`): install from a bundle, run it, use what it was
// granted, revoke one capability while its window is open, uninstall. The
// bundle is zipped from the example's own files, so this also fails if the
// reference app stops being installable.

function scratchpadBundle(): Buffer {
  const files: Record<string, Uint8Array> = {};
  for (const name of ["manifest.json", "entry.js"])
    files[name] = strToU8(readFileSync(`examples/scratchpad/${name}`, "utf8"));
  return Buffer.from(zipSync(files));
}

test.describe("Reference app lifecycle (step 17, D8.8)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kagami:flag:third_party_apps", "on"));
  });

  test("install → run → revoke → uninstall", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();

    // Install: the consent screen names every capability before anything is written.
    await page.locator("input[type=\"file\"]").first().setInputFiles({ name: "scratchpad.zip", mimeType: "application/zip", buffer: scratchpadBundle() });
    const consent = page.getByRole("dialog", { name: "Install Scratchpad" });
    await expect(consent.getByText("fs.write:documents", { exact: true })).toBeVisible();
    await expect(consent.getByText("fs.read:documents", { exact: true })).toBeVisible();
    await expect(consent.getByText("notifications", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await page.getByRole("button", { name: "Open", exact: true }).click();

    // Run: it lives in the dock and its window draws real content. Settings
    // is raised over it later, so in-frame buttons use dispatchEvent.
    await expect(page.locator("[data-dock-app=\"scratchpad\"]")).toBeVisible();
    const frame = page.frameLocator("iframe[title=\"scratchpad\"]");
    const status = frame.locator("#status");
    const press = (id: string) => frame.locator(`#${id}`).dispatchEvent("click");

    // window.setTitle needs no capability.
    await frame.locator("#text").fill("Shopping list\nmilk");
    await expect(page.locator("[data-window-id]").getByText("Shopping list", { exact: true })).toBeVisible();

    // fs.write then fs.read round-trip through the shell.
    await press("save");
    await expect(status).toHaveText("save: ok");
    await frame.locator("#text").fill("overwritten");
    await press("load");
    await expect(status).toHaveText("load: ok");
    await expect(frame.locator("#text")).toHaveValue("Shopping list\nmilk");

    await press("notify");
    await expect(status).toHaveText("notify: ok");

    // Revoke one capability while the window is open: writes stop, reads don't.
    await openApp(page, "settings");
    await page.getByRole("switch", { name: "Allow Scratchpad to use fs.write:documents" }).click();
    await press("save");
    await expect(status).toHaveText("save: capability_denied");
    await press("load");
    await expect(status).toHaveText("load: ok");

    // Uninstall: window, dock tile and Apps-pane entry all go.
    await page.getByRole("button", { name: "Uninstall Scratchpad" }).click();
    await page.getByRole("button", { name: "Confirm uninstall of Scratchpad" }).click();
    await expect(page.getByText("\"Scratchpad\" uninstalled")).toBeVisible();
    await expect(page.locator("iframe[title=\"scratchpad\"]")).toHaveCount(0);
    await expect(page.locator("[data-dock-app=\"scratchpad\"]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Uninstall Scratchpad" })).toHaveCount(0);
  });
});
