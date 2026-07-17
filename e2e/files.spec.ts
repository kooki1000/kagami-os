import { expect, test } from "@playwright/test";
import { createFolder, openFiles } from "./helpers";

// Exact text targets the item's name label, never the longer toast body.
const NAME = "E2E Folder";

test.describe("Files lifecycle", () => {
  test("create, rename, trash and restore a folder", async ({ page }) => {
    await openFiles(page);

    // Create a folder — it lands in inline-rename mode with the field focused.
    await createFolder(page, NAME);

    // Move it to Trash via the context menu; it leaves the current folder.
    await page.getByText(NAME, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "Move to Trash" }).click();
    await expect(page.getByText(NAME, { exact: true })).toHaveCount(0);

    // It now lives in the Trash.
    await page.getByRole("button", { name: /Trash/ }).first().click();
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();

    // Restore it, then confirm it's back under Home.
    await page.getByText(NAME, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("button", { name: "Home" }).click();
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();
  });

  // Completes catalog #4 — plan §4.12: the "move via DnD" leg wasn't covered
  // yet. Files' item rows use real HTML5 draggable/dragstart/drop (dnd.ts),
  // so this rides Playwright's dragTo helper (synthesizes the dragover/drop
  // sequence) rather than raw page.mouse steps, which HTML5 DnD ignores.
  // Native DnD is the flakiest interaction across engines — Chromium-only
  // per the plan's flakiness policy (§7); the underlying move is already
  // covered store-side by fsStore.test.ts.
  test("drag and drop moves an item into a folder", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "HTML5 DnD synthesis is unreliable on Firefox/WebKit");

    await openFiles(page);

    await createFolder(page, "Target Folder");
    await createFolder(page, "Movable Item");

    const source = page.getByText("Movable Item", { exact: true });
    const target = page.getByText("Target Folder", { exact: true });
    await source.dragTo(target);

    // It left the current folder…
    await expect(page.getByText("Movable Item", { exact: true })).toHaveCount(0);

    // …and now lives inside the target.
    await target.dblclick();
    await expect(page.getByText("Movable Item", { exact: true })).toBeVisible();
  });
});
