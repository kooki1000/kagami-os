import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { boot, collectErrors, openApp, openFiles } from "./helpers";

/**
 * The code editor (D4, step 16b).
 *
 * Two things here are worth more than the editing itself: that a `.ts` and a
 * `.json` open at all — before this work they hit "Can't open this file",
 * because the browser reports `video/mp2t` for one and nothing for the other —
 * and that a file survives the round-trip to disk and back.
 */

function codeWindow(page: Page) {
  return page.locator("[data-window-id]", { hasText: "Code" });
}

function editor(page: Page) {
  return page.locator("[data-code-editor] .cm-content");
}

async function uploadAndOpen(page: Page, fixture: string, name: string): Promise<void> {
  await openFiles(page);
  await page.locator("input[type=\"file\"]").first().setInputFiles(fixture);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByText(name, { exact: true }).dblclick();
  await expect(editor(page)).toBeVisible();
}

test.describe("Code editor", () => {
  test("opens a TypeScript file, highlighted, with its language named", async ({ page }) => {
    const errors = collectErrors(page);
    await uploadAndOpen(page, "e2e/fixtures/sample.ts", "sample.ts");

    await expect(editor(page)).toContainText("export function greet");
    await expect(page.locator("[data-code-filename]")).toHaveText("sample.ts");
    // The status bar names the language the parser was chosen for; the
    // highlighted spans prove the parser actually loaded and ran.
    await expect(page.locator("[data-code-language]")).toHaveText("TypeScript");
    await expect(editor(page).locator(".cm-line span").first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("a JSON file opens too — it had no app at all before", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.json", "sample.json");
    await expect(editor(page)).toContainText("kagami-fixture");
    await expect(page.locator("[data-code-language]")).toHaveText("JSON");
  });

  test("an edit autosaves and survives a reload", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.ts", "sample.ts");

    await editor(page).click();
    await page.keyboard.type("// edited by the spec\n");
    await expect(page.locator("[data-code-status]")).toHaveText("Editing…");
    await expect(page.locator("[data-code-status]")).toHaveText("Saved");

    await page.reload();
    // Session restore reopens the window on the same file (C1).
    await expect(editor(page)).toContainText("// edited by the spec");
  });

  test("the sidebar lists the folder's files and switches between them", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles([
      "e2e/fixtures/sample.ts",
      "e2e/fixtures/sample.json",
    ]);
    await expect(page.getByText("sample.json", { exact: true })).toBeVisible();
    await page.getByText("sample.ts", { exact: true }).dblclick();
    await expect(editor(page)).toContainText("export function greet");

    const win = codeWindow(page);
    await win.locator("[data-code-file=\"sample.json\"]").click();
    await expect(editor(page)).toContainText("kagami-fixture");
    await expect(page.locator("[data-code-language]")).toHaveText("JSON");

    await win.locator("[data-code-file=\"sample.ts\"]").click();
    await expect(editor(page)).toContainText("export function greet");
  });

  test("Open With sends a code file to Notes and remembers it", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.ts");
    await expect(page.getByText("sample.ts", { exact: true })).toBeVisible();

    await page.getByText("sample.ts", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Open With/ }).click();
    await page.getByRole("menuitem", { name: "Notes", exact: true }).click();
    await expect(page.locator("[data-window-id]", { hasText: "Notes" })).toBeVisible();

    // The choice persists as the default for this type, and Settings can see
    // and undo it (U5).
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Default Apps" }).click();
    const row = page.getByLabel("Default app for TypeScript");
    await expect(row).toHaveValue("notes");
    await page.getByRole("button", { name: "Reset" }).first().click();
    await expect(row).toHaveValue("code");
  });

  test("the View menu toggles line numbers, and the choice persists", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.ts", "sample.ts");
    const gutters = page.locator("[data-code-editor] .cm-gutters");
    await expect(gutters).toBeVisible();

    await page.getByRole("button", { name: "View", exact: true }).click();
    await page.getByRole("menuitem", { name: "Line Numbers", exact: true }).click();
    await expect(gutters).toHaveCount(0);

    await page.reload();
    await expect(editor(page)).toBeVisible();
    await expect(page.locator("[data-code-editor] .cm-gutters")).toHaveCount(0);
  });

  test("a bare launch offers to make a file rather than showing nothing", async ({ page }) => {
    await boot(page);
    await openApp(page, "code");
    await expect(codeWindow(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "New File" })).toBeVisible();
  });
});
