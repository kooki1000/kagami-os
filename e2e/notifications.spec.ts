import { expect, test } from "@playwright/test";
import { createFolder, openFiles } from "./helpers";

const NAME = "Doomed";

// Trash toast Undo action + Notification Center read-state (plan §4.8, catalog #12).
// Covers notify()'s action.run() wiring in FilesApp's trashManyWithUndo and
// notificationStore's toast-vs-history/read-state split (openCenter marks all read).
test.describe("Trash toast Undo and Notification Center", () => {
  test("Undo restores the item, and opening the center clears the unread badge", async ({ page }) => {
    await openFiles(page);
    await createFolder(page, NAME);

    // Trash it — a toast with an Undo action appears.
    await page.getByText(NAME, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "Move to Trash" }).click();
    await expect(page.getByText("Moved to Trash")).toBeVisible();
    const undo = page.getByRole("button", { name: "Undo" });
    await expect(undo).toBeVisible();

    // Undo puts it back where it was, not in Trash.
    await undo.click();
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();

    // Trash it again, this time leave the toast alone.
    await page.getByText(NAME, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "Move to Trash" }).click();
    await expect(page.getByText("Moved to Trash")).toBeVisible();

    // The bell carries an unread badge (a conditionally-rendered child span —
    // assert its presence/absence rather than reading its exact count).
    const bell = page.getByRole("button", { name: "Notifications" });
    await expect(bell.locator("span")).toBeVisible();

    // Opening the center marks history read (and, as a side effect, clears
    // any still-showing toast) — the trashed-item entry is listed there.
    await bell.click();
    await expect(page.getByText("Moved to Trash").first()).toBeVisible();
    await expect(bell.locator("span")).toHaveCount(0);

    // Closing the center again leaves no lingering unread badge. The
    // center's own full-viewport backdrop (z-45) sits above the menu bar
    // (z-40) and visually intercepts the bell pixel while open — clicking it
    // closes the center exactly as a real click-outside would, but
    // Playwright's actionability check refuses a plain click on a covered
    // target, so force it through.
    await bell.click({ force: true });
    await expect(bell.locator("span")).toHaveCount(0);
  });
});
