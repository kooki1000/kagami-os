import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// Catalog #9: the Terminal's shell.ts engine is a pure interpreter over the
// same fsStore Files renders — this guards that writes/overwrites/trashing
// done via the REPL round-trip into the exact same VFS Files shows.

test.describe("Terminal ↔ Files round-trip", () => {
  test("mkdir/cd/echo/cat/rm land in the same VFS Files renders", async ({ page }) => {
    await boot(page);
    await openApp(page, "terminal");

    // Terminal is the only window open, so the prompt input is unambiguous.
    const input = page.locator("input");
    await expect(input).toBeVisible();

    async function run(cmd: string): Promise<void> {
      await input.fill(cmd);
      await input.press("Enter");
    }

    await run("mkdir demo");
    await run("cd demo");
    await run("echo hi > note.txt");
    await run("cat note.txt");
    await expect(page.getByText("hi", { exact: true })).toBeVisible();

    // Overwrite (not append) — the new cat output must be exactly "bye",
    // not the old "hi" content still tacked on.
    await run("echo bye > note.txt");
    await run("cat note.txt");
    await expect(page.getByText("bye", { exact: true })).toBeVisible();

    await run("rm note.txt");
    await expect(page.getByText("moved 'note.txt' to Trash", { exact: true })).toBeVisible();

    // Cross-check: the folder Terminal's mkdir created is visible in Files,
    // and the rm'd file is gone from it.
    await openApp(page, "files");
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
    await page.getByText("demo", { exact: true }).dblclick();
    await expect(page.getByText("note.txt", { exact: true })).toHaveCount(0);
  });
});
