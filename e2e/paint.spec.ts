import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { boot, collectErrors, openApp } from "./helpers";

function paintWindow(page: Page) {
  return page.locator("[data-window-id]", { hasText: "Paint" });
}

async function drawStroke(page: Page, win: ReturnType<typeof paintWindow>): Promise<void> {
  const box = await win.locator("canvas").boundingBox();
  if (!box)
    throw new Error("canvas has no layout box");
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 80, { steps: 5 });
  await page.mouse.up();
}

test.describe("Paint (step 16b, D7)", () => {
  test("a drawn stroke saves as a real PNG file in Files > Pictures", async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await openApp(page, "paint");
    const win = paintWindow(page);
    await drawStroke(page, win);

    await win.getByRole("button", { name: "Save to Pictures" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByText("“Drawing.png” was added to Pictures.")).toBeVisible();

    await openApp(page, "files");
    const filesWin = page.locator("[data-window-id]", { hasText: "Files" });
    await filesWin.getByRole("button", { name: "Pictures", exact: true }).click();
    await expect(filesWin.getByText("Drawing.png", { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("undo removes the last stroke and disables itself once history is empty", async ({ page }) => {
    await boot(page);
    await openApp(page, "paint");
    const win = paintWindow(page);
    const undoButton = win.getByRole("button", { name: "Undo" });
    await expect(undoButton).toBeDisabled();

    await drawStroke(page, win);
    await expect(undoButton).toBeEnabled();

    await undoButton.click();
    await expect(undoButton).toBeDisabled();
  });
});
