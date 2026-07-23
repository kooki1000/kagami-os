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

// Terminal engine v2 (D3): cp/mv, head/tail/grep, pipes between builtins,
// `open`, and Tab completion. Runs against the seeded Documents/Downloads
// content (seed.ts) rather than fixtures created inline, since it exercises
// path-aware arguments across pre-existing folders.
test.describe("Terminal engine v2 (D3)", () => {
  test("cp/mv/head/grep/pipes round-trip through the same VFS Files renders", async ({ page }) => {
    await boot(page);
    await openApp(page, "terminal");

    const input = page.locator("input");
    await expect(input).toBeVisible();

    async function run(cmd: string): Promise<void> {
      await input.fill(cmd);
      await input.press("Enter");
    }

    await run("cd Documents");
    await run("cp welcome.md welcome-copy.md");
    await run("mv ideas.md notes.md");

    await run("head -n 1 welcome-copy.md");
    await expect(page.getByText("# Welcome to your Kagami drive", { exact: true })).toBeVisible();

    await run("cat notes.md | grep terminal");
    await expect(page.getByText("- A terminal that speaks to this same file system", { exact: true })).toBeVisible();

    // Cross-check in Files: the copy and the rename land in the same VFS,
    // and the pre-rename name is gone.
    await openApp(page, "files");
    await page.locator("[data-node-name=\"Documents\"]").dblclick();
    await expect(page.locator("[data-node-name=\"welcome-copy.md\"]")).toBeVisible();
    await expect(page.locator("[data-node-name=\"notes.md\"]")).toBeVisible();
    await expect(page.locator("[data-node-name=\"ideas.md\"]")).toHaveCount(0);
  });

  test("open launches the file's associated app", async ({ page }) => {
    await boot(page);
    await openApp(page, "terminal");

    const input = page.locator("input");
    await input.fill("open Documents/welcome.md");
    await input.press("Enter");

    const notesWindow = page.locator("[data-window-focused=\"true\"]");
    await expect(notesWindow.locator("[data-window-title]")).toHaveText("Notes");
    await expect(notesWindow.locator("textarea")).toHaveValue(/Everything you see in Files lives/);
  });

  test("Tab completes a unique command name and a unique path segment", async ({ page }) => {
    await boot(page);
    await openApp(page, "terminal");

    const input = page.locator("input");
    await input.fill("mk");
    await input.press("Tab");
    await expect(input).toHaveValue("mkdir");

    await input.fill("cd Doc");
    await input.press("Tab");
    await expect(input).toHaveValue("cd Documents/");
  });
});
