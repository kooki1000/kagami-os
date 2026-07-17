import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// B5 clipboard: Copy/Cut/Paste over the ⌘C/⌘X/⌘V chords. `ControlOrMeta` maps
// to ⌘ on WebKit and Ctrl elsewhere; either way shortcuts.ts resolves the same
// "⌘C" menu chord and routes it to the focused Files window.

async function openFiles(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();
  await page.locator("[data-dock-app=\"files\"]").click();
  await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
}

async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New folder" }).click();
  const rename = page.locator("input:focus");
  await rename.fill(name);
  await rename.press("Enter");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test.describe("Files clipboard (B5)", () => {
  test("Copy then Paste duplicates into the same folder with a deduped name", async ({ page }) => {
    await openFiles(page);
    await createFolder(page, "Src");
    await page.getByText("Src", { exact: true }).dblclick();
    await createFolder(page, "doc");

    // Copy the selection, then paste it back into the same folder.
    await page.getByText("doc", { exact: true }).click();
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("ControlOrMeta+v");

    // The original survives and the paste lands as a deduped "doc 2".
    await expect(page.getByText("doc", { exact: true })).toBeVisible();
    await expect(page.getByText("doc 2", { exact: true })).toBeVisible();
  });

  test("Cut then Paste moves the item into another folder", async ({ page }) => {
    await openFiles(page);
    await createFolder(page, "From");
    await createFolder(page, "To");

    // Put a note inside "From" and stage it as a Cut.
    await page.getByText("From", { exact: true }).dblclick();
    await createFolder(page, "note");
    await page.getByText("note", { exact: true }).click();
    await page.keyboard.press("ControlOrMeta+x");

    // Navigate into "To" and paste — the original moves here.
    await page.getByRole("button", { name: "Home" }).first().click();
    await page.getByText("To", { exact: true }).dblclick();
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.getByText("note", { exact: true })).toBeVisible();

    // …and it no longer exists back in "From".
    await page.getByRole("button", { name: "Home" }).first().click();
    await page.getByText("From", { exact: true }).dblclick();
    await expect(page.getByText("note", { exact: true })).toHaveCount(0);
  });
});
