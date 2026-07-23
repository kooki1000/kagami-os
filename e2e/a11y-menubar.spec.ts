import { expect, test } from "@playwright/test";
import { boot } from "./helpers";

// MenuBar ARIA roles + arrow-key traversal (H1 a11y pass). The "Kagami"
// system menu is always present (unlike app menus, which need a focused
// app), so it's the stable target for these assertions.

test.describe("MenuBar accessibility", () => {
  test("exposes menu/menuitem roles and haspopup/expanded on the trigger", async ({ page }) => {
    await boot(page);

    const trigger = page.getByRole("button", { name: "Kagami" });
    await expect(trigger).toHaveAttribute("aria-haspopup", "true");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "About Kagami OS" })).toBeVisible();
  });

  test("ArrowDown/ArrowUp move the highlight, Escape closes and returns focus", async ({ page }) => {
    await boot(page);

    const trigger = page.getByRole("button", { name: "Kagami" });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    // Nothing highlighted yet — the menu just opened.
    await expect(page.locator("[data-highlighted=\"true\"]")).toHaveCount(0);

    await page.keyboard.press("ArrowDown");
    const items = page.getByRole("menuitem");
    await expect(items.nth(0)).toHaveAttribute("data-highlighted", "true");

    await page.keyboard.press("ArrowDown");
    await expect(items.nth(0)).not.toHaveAttribute("data-highlighted", "true");
    await expect(items.nth(1)).toHaveAttribute("data-highlighted", "true");

    await page.keyboard.press("ArrowUp");
    await expect(items.nth(0)).toHaveAttribute("data-highlighted", "true");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  // H1: icon-only system controls (search/appearance/notifications) carry
  // an `aria-label` instead of relying on their glyph; sampled here to
  // confirm the pattern stays queryable by accessible name.
  test("icon-only system controls expose an accessible name", async ({ page }) => {
    await boot(page);

    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle appearance" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
  });
});
