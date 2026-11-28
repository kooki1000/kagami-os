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

    // Non-ASCII source survives the trip into the frame intact.
    await expect(frame.locator("#open")).toHaveText("Open…");

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

    // The badge is the app's own (dock.setBadge), and its menu is in the menu
    // bar while the window is focused (menus.set).
    await expect(page.locator("[data-dock-app=\"scratchpad\"] [data-dock-badge]")).toHaveText("1");
    await page.getByRole("button", { name: "Draft", exact: true }).click();
    await page.getByRole("menuitem", { name: "Clear Draft" }).click();
    await expect(frame.locator("#text")).toHaveValue("");

    // Revoke one capability while the window is open: writes stop, reads don't.
    await openApp(page, "settings");
    await page.getByRole("switch", { name: "Allow Scratchpad to use fs.write:documents" }).click();
    await press("save");
    await expect(status).toHaveText("save: capability_denied");
    await press("load");
    await expect(status).toHaveText("load: ok");

    // The private data folder needs no grant, so the draft saves regardless,
    // and is still there after a reload (D8.10).
    // Typing goes to the focused element, so bring Scratchpad forward and click
    // into the field first, as a user would: Firefox won't insert text into a
    // frame that has no focus while Settings holds it.
    await openApp(page, "scratchpad");
    await frame.locator("#text").click();
    await frame.locator("#text").press("ControlOrMeta+a");
    await frame.locator("#text").pressSequentially("kept across reloads");
    await expect(frame.locator("#text")).toHaveValue("kept across reloads");
    await expect(frame.locator("#draft")).toHaveText("draft: saved 19 bytes");
    // Give the write-through IndexedDB persist a moment before we reload.
    await page.waitForTimeout(500);
    await page.locator("[data-dock-app=\"scratchpad\"]").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Pin to Dock" }).click();
    await page.goto("/?fresh");
    await openApp(page, "scratchpad");
    const reopened = page.frameLocator("iframe[title=\"scratchpad\"]");
    await expect(reopened.locator("#draft")).toHaveText("draft: restored 19 bytes");
    await expect(reopened.locator("#text")).toHaveValue("kept across reloads");

    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();

    // Uninstall: window, dock tile and Apps-pane entry all go.
    await page.getByRole("button", { name: "Uninstall Scratchpad" }).click();
    await page.getByRole("button", { name: "Confirm uninstall of Scratchpad" }).click();
    await expect(page.getByText("\"Scratchpad\" uninstalled")).toBeVisible();
    await expect(page.locator("iframe[title=\"scratchpad\"]")).toHaveCount(0);
    await expect(page.locator("[data-dock-app=\"scratchpad\"]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Uninstall Scratchpad" })).toHaveCount(0);
  });
});
