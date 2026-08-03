import { expect, test } from "@playwright/test";
import { createFolder, openFiles } from "./helpers";

const NAME = "Icon Folder";

/**
 * The glyph rendered inside a grid tile, identified by its SVG contents.
 * Deliberately the whole `innerHTML` rather than a `<path d>`: several Lucide
 * icons (Monitor, Image) are built from `<rect>`/`<line>` and have no `<path>`
 * at all, so keying on one would silently never resolve for them.
 */
function tileGlyph(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("option", { name: new RegExp(name) }).locator("svg").first();
}

test.describe("Files custom icons", () => {
  test("a chosen glyph and tint apply, persist across a cold boot, and reset", async ({ page }) => {
    await openFiles(page);
    await createFolder(page, NAME);

    const glyph = tileGlyph(page, NAME);
    const defaultGlyph = await glyph.innerHTML();

    await page.getByRole("option", { name: new RegExp(NAME) }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Customize Icon…" }).click();

    const panel = page.getByRole("dialog", { name: `Customize icon for ${NAME}` });
    await expect(panel).toBeVisible();
    await panel.getByRole("radio", { name: "Projects", exact: true }).click();
    await panel.getByRole("radio", { name: "Purple", exact: true }).click();
    // Live preview updates before anything is committed.
    await expect(panel.getByRole("radio", { name: "Projects", exact: true })).toHaveAttribute("aria-checked", "true");
    await panel.getByRole("button", { name: "Apply" }).click();
    await expect(panel).toHaveCount(0);

    await expect(async () => expect(await glyph.innerHTML()).not.toBe(defaultGlyph)).toPass();
    const customGlyph = await glyph.innerHTML();

    // Survives a cold boot: the icon lives on the node, in IndexedDB, which
    // `?fresh` leaves alone (it only bypasses session restore).
    await openFiles(page);
    await expect(async () => expect(await tileGlyph(page, NAME).innerHTML()).toBe(customGlyph)).toPass();

    // Reset puts the mime/system default back.
    await page.getByRole("option", { name: new RegExp(NAME) }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Customize Icon…" }).click();
    const reopened = page.getByRole("dialog", { name: `Customize icon for ${NAME}` });
    await reopened.getByRole("button", { name: "Reset" }).click();
    await reopened.getByRole("button", { name: "Apply" }).click();
    await expect(async () => expect(await tileGlyph(page, NAME).innerHTML()).toBe(defaultGlyph)).toPass();
  });

  test("the seeded system folders no longer share one identical glyph", async ({ page }) => {
    await openFiles(page);
    const paths = await Promise.all(
      ["Desktop", "Documents", "Downloads", "Pictures"].map(name =>
        tileGlyph(page, name).innerHTML(),
      ),
    );
    expect(new Set(paths).size).toBe(paths.length);
  });
});

test.describe("Files view preferences", () => {
  test("view mode is remembered per folder", async ({ page }) => {
    await openFiles(page);

    await page.getByRole("button", { name: "View as detail" }).click();
    await expect(page.getByRole("button", { name: "View as detail" })).toHaveAttribute("aria-pressed", "true");

    // A different folder keeps its own (default) mode...
    await page.getByRole("option", { name: /Documents/ }).dblclick();
    await expect(page.getByRole("button", { name: "View as grid" })).toHaveAttribute("aria-pressed", "true");

    // ...and ⌘[ (Back) — a chord the dispatcher used to drop entirely —
    // returns to Home, still in details.
    await page.keyboard.press("Meta+BracketLeft");
    await expect(page.getByRole("button", { name: "View as detail" })).toHaveAttribute("aria-pressed", "true");

    // And the choice outlives a cold boot — it's in localStorage, not state.
    await openFiles(page);
    await expect(page.getByRole("button", { name: "View as detail" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the status bar reports the selection", async ({ page }) => {
    await openFiles(page);
    await page.getByRole("option", { name: /Documents/ }).click();
    await expect(page.getByText(/1 selected,/)).toBeVisible();
    await page.getByRole("option", { name: /Pictures/ }).click({ modifiers: ["Meta"] });
    await expect(page.getByText(/2 selected,/)).toBeVisible();
  });
});
