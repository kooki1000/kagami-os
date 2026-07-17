import { expect, test } from "@playwright/test";
import { openApp, openFiles } from "./helpers";

// Catalog #7: opening a text file routes to Notes (singleInstance) — this
// guards the reuse + payload-identity behavior: opening a second file must
// re-select it in the SAME Notes window, not spawn a new one, and re-opening
// a previously-open file must re-select it correctly.

test.describe("Open with → Notes reuse and payload identity", () => {
  test("switching between seeded files reuses one Notes window", async ({ page }) => {
    await openFiles(page);
    // "Documents" also names a sidebar Places entry, so target the grid
    // item's own hook rather than ambiguous text.
    await page.locator("[data-node-name=\"Documents\"]").dblclick();

    await page.getByText("welcome.md", { exact: true }).dblclick();
    // Files' own Filter <input> is also an implicit textbox and stays
    // mounted (in the still-open Files window) alongside Notes, so
    // `getByRole("textbox")` alone is ambiguous — Notes' editor is the only
    // <textarea> on the page.
    const editor = page.locator("textarea");
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue(/^# Welcome to your Kagami drive/);

    // Refocus Files (still inside Documents) and open a second file.
    await openApp(page, "files");
    await page.getByText("ideas.md", { exact: true }).dblclick();
    await expect(editor).toHaveValue(/^# Ideas/);
    // Exactly one Files window + one Notes window — a second Notes window
    // opening for ideas.md would push this to 3.
    await expect(page.locator("[data-window-control]")).toHaveCount(2);

    // Re-open the first file — the same window re-selects it.
    await openApp(page, "files");
    await page.getByText("welcome.md", { exact: true }).dblclick();
    await expect(editor).toHaveValue(/^# Welcome to your Kagami drive/);
    await expect(page.locator("[data-window-control]")).toHaveCount(2);
  });
});
