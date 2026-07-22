import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// B11: the context menu's "Open With ▸" submenu, backed by a settings-store
// association registry (generalizing openFile.ts's hardcoded mime table).
// Each browser context starts with a clean IndexedDB *and* localStorage, so
// there's never a stale association from a previous test.

test.describe("Files: Open With submenu (B11)", () => {
  test("opens an image via Open With → Viewer, with the current default checked", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.svg");
    await expect(page.getByText("sample.svg", { exact: true })).toBeVisible();

    await page.getByText("sample.svg", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Open With/ }).click();
    // The checkmark prefix ("✓  ") proves the built-in mime-family default
    // (image/* → viewer) is what the menu reports as current, not just that
    // an app happens to be named "Viewer" somewhere on the page (the dock
    // tile shares that accessible name with no checkmark).
    const viewerEntry = page.getByRole("menuitem", { name: "✓  Viewer", exact: true });
    await expect(viewerEntry).toBeVisible();
    await viewerEntry.click();

    const viewerWindow = page.locator("[data-window-id]").last();
    await expect(viewerWindow.locator("[data-window-title]")).toHaveText("sample.svg");
    await expect(viewerWindow.locator("img")).toBeVisible();
  });

  test("opens a text file via Open With → Notes, and the choice sticks as the default on the next open", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    await expect(page.getByText("sample.txt", { exact: true })).toBeVisible();

    await page.getByText("sample.txt", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Open With/ }).click();
    await page.getByRole("menuitem", { name: "✓  Notes", exact: true }).click();

    // Notes is single-instance, so its window title stays "Notes" rather
    // than following the open file (unlike Viewer/Player); the selected
    // file is reflected in the editor content instead.
    const notesWindow = page.locator("[data-window-id]").last();
    await expect(notesWindow.locator("[data-window-title]")).toHaveText("Notes");
    const editor = notesWindow.locator("textarea");
    await expect(editor).toHaveValue(/^Hello from an E2E upload fixture\.\s*$/);
    await notesWindow.locator("[data-window-control] button[aria-label=\"close window\"]").click();

    // Plain double-click (no Open With) re-derives the same app, since
    // openFileWithApp persisted "text/plain" → "notes" via settingsStore.
    await page.getByText("sample.txt", { exact: true }).dblclick();
    const reopened = page.locator("[data-window-id]").last();
    await expect(reopened.locator("[data-window-title]")).toHaveText("Notes");
    await expect(reopened.locator("textarea")).toHaveValue(/^Hello from an E2E upload fixture\.\s*$/);
  });
});
