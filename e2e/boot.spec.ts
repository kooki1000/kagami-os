import { expect, test } from "@playwright/test";
import { boot, collectErrors } from "./helpers";

test.describe("boot", () => {
  test("cold boot renders Welcome, dock and menu bar with no console errors", async ({ page }) => {
    const errors = collectErrors(page);

    await boot(page);

    // Dock has the built-in apps; menu bar shows the brand menu.
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
    await expect(page.locator("[data-dock-app=\"settings\"]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kagami" })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
