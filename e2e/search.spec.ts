import { expect, test } from "@playwright/test";
import { boot } from "./helpers";

test.describe("Global search (⌘K)", () => {
  test("finds a seeded file, opens it, and closes the overlay", async ({ page }) => {
    await boot(page);
    await expect(page.locator("[data-window-id]")).toHaveCount(0);

    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder("Search files and folders");
    await expect(input).toBeVisible();

    await input.fill("welcome");
    await expect(page.getByText("welcome.md")).toBeVisible();
    await expect(page.getByText("Home/Documents")).toBeVisible();

    await input.press("Enter");
    await expect(input).not.toBeVisible();
    await expect(page.locator("[data-window-id]")).toHaveCount(1);
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("Escape closes the overlay without opening anything", async ({ page }) => {
    await boot(page);

    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder("Search files and folders");
    await expect(input).toBeVisible();

    await input.press("Escape");
    await expect(input).not.toBeVisible();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);
  });

  test("the menu-bar search icon opens the same overlay", async ({ page }) => {
    await boot(page);

    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByPlaceholder("Search files and folders")).toBeVisible();
  });
});
