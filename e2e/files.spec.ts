import { expect, test } from "@playwright/test";

// Exact text targets the item's name label, never the longer toast body.
const NAME = "E2E Folder";

test.describe("Files lifecycle", () => {
  test("create, rename, trash and restore a folder", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();

    // Open Files from the dock.
    await page.locator("[data-dock-app=\"files\"]").click();
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();

    // Create a folder — it lands in inline-rename mode with the field focused.
    await page.getByRole("button", { name: "New folder" }).click();
    const rename = page.locator("input:focus");
    await rename.fill(NAME);
    await rename.press("Enter");
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();

    // Move it to Trash via the context menu; it leaves the current folder.
    await page.getByText(NAME, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "Move to Trash" }).click();
    await expect(page.getByText(NAME, { exact: true })).toHaveCount(0);

    // It now lives in the Trash.
    await page.getByRole("button", { name: /Trash/ }).first().click();
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();

    // Restore it, then confirm it's back under Home.
    await page.getByText(NAME, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("button", { name: "Home" }).click();
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();
  });
});
