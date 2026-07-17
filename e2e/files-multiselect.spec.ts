import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// B4 multi-select: click/⇧/⌘ ranges, bulk context-menu actions, and the
// keyboard affordances (Escape clears, Delete trashes). Each test runs in its
// own browser context, so IndexedDB — and therefore the Trash — starts clean.

async function openFiles(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();
  await page.locator("[data-dock-app=\"files\"]").click();
  await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
}

// New folder → lands in inline-rename with the field focused → name it.
async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New folder" }).click();
  const rename = page.locator("input:focus");
  await rename.fill(name);
  await rename.press("Enter");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

// Work inside a throwaway subfolder so the seeded Home items never interleave
// with the run of items a range/toggle test reasons about.
async function seedItemsInFolder(page: Page, box: string, items: string[]): Promise<void> {
  await createFolder(page, box);
  await page.getByText(box, { exact: true }).dblclick();
  for (const name of items)
    await createFolder(page, name);
}

test.describe("Files multi-select (B4)", () => {
  test("shift-range selects a contiguous run, then bulk Move to Trash", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Range Box", ["item-1", "item-2", "item-3"]);

    // Anchor on the first item; ⇧-click the last extends across the run.
    await page.getByText("item-1", { exact: true }).click();
    await page.getByText("item-3", { exact: true }).click({ modifiers: ["Shift"] });

    // Right-clicking a member of the selection keeps it and offers the bulk
    // action, whose label carries the live count.
    await page.getByText("item-2", { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "Move 3 Items to Trash" }).click();

    // All three leave the folder together.
    await expect(page.getByText(/item-[123]/)).toHaveCount(0);

    // …and all three land in the Trash.
    await page.getByRole("button", { name: /Trash/ }).first().click();
    for (const name of ["item-1", "item-2", "item-3"])
      await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test("⌘-click toggles non-adjacent items; Escape clears, Delete trashes", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Toggle Box", ["c-1", "c-2", "c-3"]);

    // Toggle-select the two outer items, deliberately skipping the middle one.
    await page.getByText("c-1", { exact: true }).click();
    await page.getByText("c-3", { exact: true }).click({ modifiers: ["ControlOrMeta"] });

    // Escape clears the selection — so the Delete that follows trashes nothing.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Delete");
    for (const name of ["c-1", "c-2", "c-3"])
      await expect(page.getByText(name, { exact: true })).toBeVisible();

    // Re-select the same non-adjacent pair; Delete trashes exactly those two.
    await page.getByText("c-1", { exact: true }).click();
    await page.getByText("c-3", { exact: true }).click({ modifiers: ["ControlOrMeta"] });
    await page.keyboard.press("Delete");

    await expect(page.getByText("c-1", { exact: true })).toHaveCount(0);
    await expect(page.getByText("c-3", { exact: true })).toHaveCount(0);
    // The skipped middle item is untouched — proof the toggle excluded it.
    await expect(page.getByText("c-2", { exact: true })).toBeVisible();
  });

  test("marquee drag rubber-band selects the items it crosses", async ({ page }) => {
    await openFiles(page);
    await seedItemsInFolder(page, "Marquee Box", ["m-1", "m-2", "m-3"]);

    const first = await page.getByText("m-1", { exact: true }).boundingBox();
    const last = await page.getByText("m-3", { exact: true }).boundingBox();
    if (!first || !last)
      throw new Error("marquee items not laid out");

    // Start on empty background below the single row, then drag up and across
    // the whole row. The >4px move engages the rubber band before the up.
    const startX = first.x + first.width / 2;
    const startY = Math.max(first.y + first.height, last.y + last.height) + 40;
    const endX = last.x + last.width / 2;
    const endY = Math.min(first.y, last.y) - 6;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 8 });
    await page.mouse.move(endX, endY, { steps: 8 });
    await page.mouse.up();

    // The marquee swept all three — the bulk context action confirms the count.
    await page.getByText("m-2", { exact: true }).click({ button: "right" });
    await expect(page.getByRole("button", { name: "Move 3 Items to Trash" })).toBeVisible();
  });
});
