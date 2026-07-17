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
    await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();

    // Reopen Notes — the just-edited note is newest, so it's reselected.
    await openApp(page, "notes");
    await expect(page.getByRole("textbox")).toHaveValue(marker);
  });
});
