import { expect, test } from "@playwright/test";
import { collectErrors, openApp, openFiles } from "./helpers";

// H2 (i18n scaffolding): a smoke check only — no RTL layout work has been
// done, just proof that flipping the document direction doesn't visibly
// break the shell. Full RTL support is future work alongside a real second
// locale (see ROADMAP.md's H2 entry).
test.describe("RTL smoke test", () => {
  test("flipping document direction keeps the shell visible and interactive", async ({ page }) => {
    const errors = collectErrors(page);
    await openFiles(page);

    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });

    // Shell chrome stays visible under the flip.
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kagami" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();

    // Basic interactivity: switching apps still works under the flip.
    await openApp(page, "settings");
    await expect(page.getByRole("button", { name: "Appearance" })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
