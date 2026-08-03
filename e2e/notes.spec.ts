import { expect, test } from "@playwright/test";
import { boot, noteEditor, openApp } from "./helpers";

test.describe("Notes persistence", () => {
  test("an edit survives a full page reload", async ({ page }) => {
    const marker = `E2E persisted note ${Date.now()}`;

    await boot(page);

    // Open Notes; the newest document is selected into the editor.
    await openApp(page, "notes");
    const editor = noteEditor(page);
    await expect(editor).toBeVisible();

    // Replace the content and wait for the debounced autosave to land.
    await editor.fill(marker);
    await expect(page.getByText("Saved")).toBeVisible();
    // Give the write-through IndexedDB persist a moment before we reload.
    await page.waitForTimeout(500);

    await page.reload();

    // Session restore (C1) reopens the Notes window with the same note
    // already selected — no dock click, no Welcome, needed. (Falling back
    // to "just-edited note is newest" would pass either way, so this checks
    // the window came back at all first.)
    await expect(page.locator("[data-window-id]")).toHaveCount(1);
    await expect(noteEditor(page)).toHaveText(marker);
  });
});

// D9: the editor renders the document instead of showing markdown source.
// The file on disk is still plain `.md` — these specs check both halves of
// that, since either one alone would be the wrong app.
test.describe("Notes WYSIWYG (D9)", () => {
  test("a seeded note renders as formatted text, with no markup showing", async ({ page }) => {
    await boot(page);
    await openApp(page, "notes");

    const editor = noteEditor(page);
    await expect(editor.locator("h1")).toHaveText("To-do");
    await expect(editor.locator("ul li").first()).toBeVisible();
    // The characters that produced the formatting are gone from the view.
    await expect(editor).not.toContainText("# To-do");
    await expect(editor).not.toContainText("**");
  });

  test("the toolbar formats the selection, and the markdown behind it survives a reload", async ({ page }) => {
    await boot(page);
    await openApp(page, "notes");

    const editor = noteEditor(page);
    await editor.fill("plain words");
    // Double-click selects the word under the cursor in every engine —
    // Home/Shift+Arrow don't agree across them on macOS. The button must not
    // steal focus, or there'd be no selection left to format by the time it
    // runs.
    // Position it inside the first word: an unpositioned double-click lands
    // in the middle of the line, which is the gap between the two.
    await editor.getByText("plain words").dblclick({ position: { x: 8, y: 8 } });
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(editor.locator("strong")).toHaveText("plain");

    await expect(page.getByText("Saved")).toBeVisible();
    await page.waitForTimeout(500);
    await page.reload();

    // Bold came back as bold — meaning it was written as `**plain**` and
    // parsed again, not held in memory.
    await expect(noteEditor(page).locator("strong")).toHaveText("plain");
  });

  test("task items are checkable, and the checkbox writes through to the file", async ({ page }) => {
    await boot(page);
    await openApp(page, "notes");

    const editor = noteEditor(page);
    await editor.fill("call mum");
    await page.getByRole("button", { name: "Task list", exact: true }).click();

    const checkbox = editor.locator("input[type=\"checkbox\"]");
    await expect(checkbox).toHaveCount(1);
    await checkbox.check();
    await expect(page.getByText("Saved")).toBeVisible();
    await page.waitForTimeout(500);

    await page.reload();
    // The old preview drew checkboxes read-only; this one persists as
    // `- [x] call mum` and comes back checked.
    await expect(noteEditor(page).locator("input[type=\"checkbox\"]")).toBeChecked();
  });

  test("find highlights every match in place, without leaving the document", async ({ page }) => {
    await boot(page);
    await openApp(page, "notes");

    const editor = noteEditor(page);
    await editor.fill("alpha beta alpha gamma alpha");
    await page.keyboard.press("Meta+f");
    await page.getByPlaceholder("Find").fill("alpha");

    await expect(page.locator(".notes-find-match")).toHaveCount(3);
    // Stepping marks one of them as current rather than replacing the set.
    await page.getByPlaceholder("Find").press("Enter");
    await expect(page.locator(".notes-find-active")).toHaveCount(1);
    await expect(page.locator(".notes-find-match")).toHaveCount(3);

    await page.getByRole("button", { name: "Toggle replace" }).click();
    await page.getByPlaceholder("Replace").fill("omega");
    await page.getByRole("button", { name: "Replace All" }).click();
    await expect(editor).toHaveText("omega beta omega gamma omega");
  });

  test("pasted HTML keeps its text and drops everything else", async ({ page, browserName }) => {
    // Chromium only: a synthetic ClipboardEvent carrying a DataTransfer is
    // the only way to drive paste without real clipboard permissions, and
    // Firefox/WebKit don't deliver one to the editor. The guarantee itself
    // is engine-independent and unit-tested for every case in
    // editorSchema.test.ts — this is the smoke test that the real paste
    // pipeline reaches the same schema.
    test.skip(browserName !== "chromium", "synthetic paste events aren't delivered outside chromium");
    await boot(page);
    await openApp(page, "notes");

    const editor = noteEditor(page);
    await editor.fill("");
    await editor.click();

    // The schema is what makes this safe (ROADMAP §6 decision 8): a node
    // type it doesn't declare cannot exist in the document at all.
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/html", "<p><strong>kept</strong><img src=x onerror=\"alert(1)\"><a href=\"javascript:alert(1)\">link text</a></p>");
      document.querySelector(".notes-prose")?.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });

    await expect(editor.locator("strong")).toHaveText("kept");
    await expect(editor).toContainText("link text");
    await expect(editor.locator("img")).toHaveCount(0);
    await expect(editor.locator("a")).toHaveCount(0);
  });
});
