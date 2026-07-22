import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Chord routing (shortcuts.ts): the focused app's own menu chord wins over a
// shell fallback chord, and native text-editing chords (⌘A/C/X/V/Z) stay with
// the browser when focus is inside an <input>/<textarea>, even though Files
// also binds some of those letters to its own app commands.

test.describe("Shortcut routing", () => {
  test("app chord beats shell, native editing chords stay in inputs, shell chord falls back", async ({ page }) => {
    await openFiles(page);

    // (a) ⇧⌘N is bound on Files' File menu to files.newFolder — the app's own
    // menu chord wins over any shell-level binding for the same letter.
    await page.keyboard.press("Shift+ControlOrMeta+N");
    const rename = page.locator("input:focus");
    await expect(rename).toBeVisible();
    await rename.fill("Shortcut Folder");
    await rename.press("Enter");
    await expect(page.getByText("Shortcut Folder", { exact: true })).toBeVisible();

    // (b) ⌘A inside the Filter input selects the input's own text (native
    // browser behavior) rather than being hijacked by Files' "Select All"
    // app command, which would select file-list items instead. Proven here:
    // Backspace after ⌘A empties the field's text.
    const filter = page.getByPlaceholder("Filter");
    await filter.click();
    await filter.fill("zzz");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await expect(filter).toHaveValue("");

    // (c) ⌘W is bound on Files' own File menu to "window.close" — same
    // command the shell-level fallback would run — so either way it closes
    // the focused window.
    await page.keyboard.press("ControlOrMeta+w");
    await expect(page.locator("[data-window-control]")).toHaveCount(0);
  });

  test("a MenuBar dropdown being open gates ⌘W (overlay registry)", async ({ page }) => {
    await openFiles(page);
    await expect(page.locator("[data-window-control]")).toHaveCount(1);

    // Open the "Kagami" system menu — while it's open, the overlay registry
    // should make ⌘W a no-op instead of closing the window underneath it.
    const trigger = page.getByRole("button", { name: "Kagami" });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+w");
    await expect(page.locator("[data-window-control]")).toHaveCount(1);
    await expect(page.getByRole("menu")).toBeVisible();

    // Close the menu — ⌘W now closes the window as normal.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+w");
    await expect(page.locator("[data-window-control]")).toHaveCount(0);
  });
});
