import { expect, test } from "@playwright/test";
import { boot, createFolder, openFiles } from "./helpers";

// Scenario #5 from the H5 catalog: the two-step Empty Trash confirm is a
// data-loss path, so it guards both the confirm gesture and that the deletion
// actually persists across a reload (deleteForever write-through to IndexedDB).

test.describe("Files Empty Trash", () => {
  test("two-step confirm permanently deletes, and it stays gone after reload", async ({ page }) => {
    await openFiles(page);

    // Create a folder and send it to the Trash.
    await createFolder(page, "Doomed");
    await page.getByText("Doomed", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    await expect(page.getByText("Doomed", { exact: true })).toHaveCount(0);

    // It's in the Trash now.
    await page.getByRole("button", { name: /Trash/ }).first().click();
    await expect(page.getByText("Doomed", { exact: true })).toBeVisible();

    // First click arms the confirm; the label flips. A stray reload here must
    // not have destroyed anything — but a second click does.
    await page.getByRole("button", { name: "Empty Trash" }).click();
    await expect(page.getByRole("button", { name: "Click again to confirm" })).toBeVisible();
    await page.getByRole("button", { name: "Click again to confirm" }).click();

    await expect(page.getByText("Doomed", { exact: true })).toHaveCount(0);
    await expect(page.getByText("The Trash is empty")).toBeVisible();

    // The permanent delete survives a full reload — it was never a soft hide.
    await page.waitForTimeout(500); // let the write-through IndexedDB persist land
    await page.reload();
    await boot(page);
    await page.locator("[data-dock-app=\"files\"]").click();
    await page.getByRole("button", { name: /Trash/ }).first().click();
    await expect(page.getByText("Doomed", { exact: true })).toHaveCount(0);
    await expect(page.getByText("The Trash is empty")).toBeVisible();
  });
});
