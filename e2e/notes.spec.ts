import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

test.describe("Notes persistence", () => {
  test("an edit survives a full page reload", async ({ page }) => {
    const marker = `E2E persisted note ${Date.now()}`;

    await boot(page);

    // Open Notes; the newest document is selected into the editor.
    await openApp(page, "notes");
    const editor = page.getByRole("textbox");
    await expect(editor).toBeVisible();

    // Replace the content and wait for the debounced autosave to land.
    await editor.fill(marker);
    await expect(page.getByText("Saved")).toBeVisible();
    // Give the write-through IndexedDB persist a moment before we reload.
    await page.waitForTimeout(500);

    await page.reload();

    // Session restore (C1) reopens the Notes window with the same note
    // already selected — no dock click, no Welcome, needed. (Falling back
    // to "just-edited note is newest" would pass either way, so this checks
    // the window came back at all first.)
    await expect(page.locator("[data-window-id]")).toHaveCount(1);
    await expect(page.getByRole("textbox")).toHaveValue(marker);
  });
});
