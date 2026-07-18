import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { boot, openApp, openFiles } from "./helpers";

// B7: the Desktop folder's children render as icons directly on the
// wallpaper (not just reachable via the Files sidebar's "Desktop" place).
// Files is used only to seed content into the Desktop folder; the
// assertions target Desktop.tsx's own icon layer.

function desktopIcon(page: import("@playwright/test").Page, name: string) {
  return page.locator("[data-desktop-icon]").filter({ hasText: name });
}

test.describe("Desktop icons (B7)", () => {
  test("a file uploaded into the Desktop folder shows an icon that opens on double-click", async ({ page }) => {
    await openFiles(page);
    const filesWindow = page.locator("[data-window-id]");
    await page.getByRole("button", { name: "Desktop" }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    // Desktop.tsx renders its own icon for the same node the instant it
    // lands in the store, so this file now appears twice on the page (the
    // Files grid item and the Desktop icon behind it) — scope to the Files
    // window until it's closed below.
    await expect(filesWindow.getByText("sample.txt", { exact: true })).toBeVisible();

    // Close Files so "sample.txt" only exists once on the page (the Desktop icon).
    await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);

    const icon = desktopIcon(page, "sample.txt");
    await expect(icon).toBeVisible();
    await icon.dblclick();

    const notesWindow = page.locator("[data-window-id]").last();
    await expect(notesWindow.locator("[data-window-title]")).toHaveText("Notes");
    await expect(notesWindow.locator("textarea")).toHaveValue(/^Hello from an E2E upload fixture\.\s*$/);
  });

  test("double-clicking a Desktop folder opens Files scoped to that folder", async ({ page }) => {
    await openFiles(page);
    const filesWindow = page.locator("[data-window-id]");
    await page.getByRole("button", { name: "Desktop" }).click();
    await page.getByRole("button", { name: "New folder" }).click();
    const rename = page.locator("input:focus");
    await rename.fill("Desktop Box");
    await rename.press("Enter");
    await expect(filesWindow.getByText("Desktop Box", { exact: true })).toBeVisible();

    await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);

    await desktopIcon(page, "Desktop Box").dblclick();
    const reopened = page.locator("[data-window-id]").last();
    // The last (active/rightmost) breadcrumb is the current folder's name.
    await expect(reopened.getByRole("button", { name: "Desktop Box" })).toBeVisible();
  });

  test("dragging an icon repositions it and the position survives a reload", async ({ page }) => {
    await openFiles(page);
    const filesWindow = page.locator("[data-window-id]");
    await page.getByRole("button", { name: "Desktop" }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles({
      name: "note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("desktop drag fixture"),
    });
    await expect(filesWindow.getByText("note.txt", { exact: true })).toBeVisible();
    await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);

    const icon = desktopIcon(page, "note.txt");
    const before = await icon.boundingBox();
    if (!before)
      throw new Error("icon has no bounding box");

    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + 220, before.y + 180, { steps: 8 });
    await page.mouse.up();

    const after = await icon.boundingBox();
    if (!after)
      throw new Error("icon has no bounding box after drag");
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);

    await page.reload();
    await boot(page);
    const reloaded = await desktopIcon(page, "note.txt").boundingBox();
    if (!reloaded)
      throw new Error("icon has no bounding box after reload");
    expect(Math.abs(reloaded.x - after.x)).toBeLessThan(2);
    expect(Math.abs(reloaded.y - after.y)).toBeLessThan(2);
  });

  test("context menu: rename and Move to Trash on a Desktop icon", async ({ page }) => {
    await openFiles(page);
    const filesWindow = page.locator("[data-window-id]");
    await page.getByRole("button", { name: "Desktop" }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.svg");
    await expect(filesWindow.getByText("sample.svg", { exact: true })).toBeVisible();
    await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);

    await desktopIcon(page, "sample.svg").click({ button: "right" });
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const rename = page.locator("input:focus");
    await rename.fill("renamed.svg");
    await rename.press("Enter");
    await expect(desktopIcon(page, "renamed.svg")).toBeVisible();

    await desktopIcon(page, "renamed.svg").click({ button: "right" });
    await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
    await expect(page.locator("[data-desktop-icon]")).toHaveCount(0);
  });

  test("right-click on empty wallpaper offers New Folder", async ({ page }) => {
    await boot(page);
    await page.locator(".wallpaper").click({ button: "right", position: { x: 400, y: 400 } });
    await page.getByRole("button", { name: "New Folder", exact: true }).click();
    const rename = page.locator("input:focus");
    await rename.fill("Fresh Folder");
    await rename.press("Enter");
    await expect(desktopIcon(page, "Fresh Folder")).toBeVisible();

    // It's a real Desktop-folder child, reachable from Files too — at this
    // point the name appears twice on the page (the Desktop icon, plus the
    // Files grid item below), so scope to the newly opened window.
    await openApp(page, "files");
    const filesWindow = page.locator("[data-window-id]").last();
    await page.getByRole("button", { name: "Desktop" }).click();
    await expect(filesWindow.getByText("Fresh Folder", { exact: true })).toBeVisible();
  });
});
