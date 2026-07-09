import { expect, test } from "@playwright/test";

test.describe("boot", () => {
  test("cold boot renders Welcome, dock and menu bar with no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error")
        errors.push(msg.text());
    });
    page.on("pageerror", err => errors.push(err.message));

    await page.goto("/");

    // The Welcome window greets a fresh boot.
    await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();

    // Dock has the built-in apps; menu bar shows the brand menu.
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
    await expect(page.locator("[data-dock-app=\"settings\"]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kagami" })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
