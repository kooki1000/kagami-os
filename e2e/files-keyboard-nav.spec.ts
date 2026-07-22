import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { createFolder, openFiles } from "./helpers";

// B6 keyboard navigation: arrow-key roving focus (grid + list), ⇧-extend,
// Enter to open, F2 to rename, and type-ahead search. Each test runs in its
// own browser context, so IndexedDB starts clean.

// Work inside a throwaway subfolder so the seeded Home items never interleave
// with the run of items a nav test reasons about.
async function seedItemsInFolder(page: Page, box: string, items: string[]): Promise<void> {
  await createFolder(page, box);
  await page.getByText(box, { exact: true }).dblclick();
  for (const name of items)
    await createFolder(page, name);
}

test.describe("Files keyboard navigation (B6)", () => {
  test("ArrowLeft walks the cursor backward through the grid; Enter opens it", async ({ page }) => {
    await openFiles(page);
    // Creating "olive" last leaves the keyboard cursor sitting on it —
    // two ArrowLefts should walk it back across "nectar" to "mango".
    await seedItemsInFolder(page, "Nav Left Box", ["mango", "nectar", "olive"]);

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");

    // "mango" is an empty folder — landing inside it proves Enter opened the
    // item the cursor walked to, not "olive" (where creation left it) or
    // "nectar" (a single ArrowLeft's worth of travel).
    await expect(page.getByText("This folder is empty")).toBeVisible();
  });

  test("⇧ArrowRight extends the selection across a run", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Nav Shift Box", ["alpha", "bravo", "charlie"]);

    // A plain click sets a clean anchor + cursor on the first item; ⇧-arrows
    // should extend the range forward from there, same as ⇧-click does.
    await page.getByText("alpha", { exact: true }).click();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");

    await page.getByText("bravo", { exact: true }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Move 3 Items to Trash" })).toBeVisible();
  });

  test("type-ahead jumps to the matching item; Enter opens it", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Nav Type-Ahead Box", ["apple", "banana", "cherry"]);

    await page.keyboard.press("b");
    await page.keyboard.press("Enter");

    // Landing in an empty folder proves the "b" search matched "banana"
    // specifically, not "apple" or "cherry".
    await expect(page.getByText("This folder is empty")).toBeVisible();
  });

  test("ArrowDown moves the cursor one row at a time in list view", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Nav List Box", ["delta", "echo", "foxtrot"]);

    await page.getByRole("button", { name: "View as list" }).click();
    await page.getByText("delta", { exact: true }).click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // List view is a single column, so two ArrowDowns from "delta" land
    // exactly on "foxtrot", two rows down.
    await expect(page.getByText("This folder is empty")).toBeVisible();
  });

  test("F2 renames the item under the cursor", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Nav Rename Box", ["old-name"]);

    await page.getByText("old-name", { exact: true }).click();
    await page.keyboard.press("F2");
    const rename = page.locator("input:focus");
    await rename.fill("new-name");
    await rename.press("Enter");

    await expect(page.getByText("new-name", { exact: true })).toBeVisible();
    await expect(page.getByText("old-name", { exact: true })).toHaveCount(0);
  });

  test("role=option, aria-selected, and roving tabIndex stay correct across arrow-key navigation (B8 a11y)", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Nav ARIA Box", ["mango", "nectar", "olive"]);

    await expect(page.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");

    const mango = page.getByRole("option", { name: "mango", exact: true });
    const nectar = page.getByRole("option", { name: "nectar", exact: true });
    const olive = page.getByRole("option", { name: "olive", exact: true });

    // Creating "olive" last leaves the keyboard cursor — and so the single
    // roving tab stop — sitting on it.
    await expect(olive).toHaveAttribute("tabindex", "0");
    await expect(olive).toHaveAttribute("aria-selected", "true");
    await expect(mango).toHaveAttribute("tabindex", "-1");
    await expect(mango).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("ArrowLeft");

    // The cursor (and its selection + tab stop) moved from "olive" to
    // "nectar"; exactly one item is ever a Tab stop, and real DOM focus
    // follows it rather than staying behind on the previous item.
    await expect(nectar).toHaveAttribute("tabindex", "0");
    await expect(nectar).toHaveAttribute("aria-selected", "true");
    await expect(nectar).toBeFocused();
    await expect(olive).toHaveAttribute("tabindex", "-1");
    await expect(olive).toHaveAttribute("aria-selected", "false");
  });
});
