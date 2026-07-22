import { expect, test } from "@playwright/test";
import { createFolder, openFiles } from "./helpers";

// B8 file metadata & properties: byte-size accounting (files + recursive
// folder rollup) and the "Get Info" panel. Fixture sizes are read straight
// off disk (`sample.txt` 34 bytes, `sample.svg` 167 bytes) so the assertions
// don't hardcode numbers unrelated to the actual files. Each test runs in
// its own browser context, so IndexedDB starts clean.

test.describe("Files metadata & Get Info (B8)", () => {
  test("Get Info shows kind, size, and location for an uploaded file", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    await expect(page.getByText("sample.txt", { exact: true })).toBeVisible();

    await page.getByText("sample.txt", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Get Info" }).click();

    const dialog = page.getByRole("dialog", { name: "sample.txt info" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("34 bytes")).toBeVisible();
    await expect(dialog.getByText("Home", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("a folder's Get Info size is the recursive rollup of everything inside it", async ({ page }) => {
    await openFiles(page);
    await createFolder(page, "Rollup Box");
    await page.getByText("Rollup Box", { exact: true }).dblclick();
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    await expect(page.getByText("sample.txt", { exact: true })).toBeVisible();

    await createFolder(page, "Nested");
    await page.getByText("Nested", { exact: true }).dblclick();
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.svg");
    await expect(page.getByText("sample.svg", { exact: true })).toBeVisible();

    // Back out two levels (Nested → Rollup Box → Home) to see "Rollup Box"
    // as an item rather than be standing inside it.
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByText("Rollup Box", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Get Info" }).click();

    // 34 (direct) + 167 (one level deeper, inside "Nested") = 201 bytes —
    // proves the rollup recurses past the immediate children.
    await expect(
      page.getByRole("dialog", { name: "Rollup Box info" }).getByText("201 bytes"),
    ).toBeVisible();
  });

  test("⌘I opens Get Info for the selected item, and the list view shows its size", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    await expect(page.getByText("sample.txt", { exact: true })).toBeVisible();

    await page.getByText("sample.txt", { exact: true }).click();
    await page.keyboard.press("ControlOrMeta+i");
    const dialog = page.getByRole("dialog", { name: "sample.txt info" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "View as list" }).click();
    await expect(page.getByRole("cell", { name: "34 bytes" })).toBeVisible();
  });

  test("Escape closes the Get Info dialog, and focus moves into it on open", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    await expect(page.getByText("sample.txt", { exact: true })).toBeVisible();

    await page.getByText("sample.txt", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Get Info" }).click();

    const dialog = page.getByRole("dialog", { name: "sample.txt info" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("focus returns to whatever was focused before Get Info opened, and Tab can't leave the dialog", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    await expect(page.getByText("sample.txt", { exact: true })).toBeVisible();

    // Select the file, then explicitly focus a toolbar control that stays
    // mounted for the dialog's whole lifetime — unlike the context menu's own
    // "Get Info" button, which unmounts the instant it's clicked, so it can't
    // be the thing focus restores to.
    await page.getByText("sample.txt", { exact: true }).click();
    const filter = page.getByPlaceholder("Filter");
    await filter.click();
    await expect(filter).toBeFocused();

    await page.keyboard.press("ControlOrMeta+i");
    const dialog = page.getByRole("dialog", { name: "sample.txt info" });
    const closeButton = dialog.getByRole("button", { name: "Close" });
    await expect(closeButton).toBeFocused();

    // Only one focusable element in the panel, so Tab should keep focus on
    // it rather than let focus escape to the rest of the page.
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(filter).toBeFocused();
  });
});
