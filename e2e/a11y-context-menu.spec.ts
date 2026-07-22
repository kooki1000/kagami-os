import { expect, test } from "@playwright/test";
import { boot } from "./helpers";

// Review-backlog #1: context menus clipped off the bottom/right of the
// viewport because the old positioning used hardcoded 200px/190px guesses
// instead of measuring the real rendered menu. Review-backlog #9: Escape
// didn't close a menu at all. Both are fixed in ContextMenu.tsx by measuring
// the mounted menu and clamping it, plus wiring useFocusTrap.
test.describe("ContextMenu viewport clamping and Escape (review-backlog #1, #9)", () => {
  test("a menu opened near the bottom-right corner stays fully within the viewport, and Escape closes it", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await boot(page);

    // Create a folder on the Desktop via the background context menu (same
    // flow as desktop-icons.spec.ts's "right-click on empty wallpaper" case),
    // then drag it hard into the bottom-right corner of the viewport.
    await page.locator(".wallpaper").click({ button: "right", position: { x: 200, y: 200 } });
    await page.getByRole("menuitem", { name: "New Folder", exact: true }).click();
    const rename = page.locator("input:focus");
    await rename.fill("Corner Folder");
    await rename.press("Enter");

    const icon = page.locator("[data-desktop-icon]").filter({ hasText: "Corner Folder" });
    await expect(icon).toBeVisible();

    const box = await icon.boundingBox();
    if (!box)
      throw new Error("icon has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(880, 580, { steps: 8 });
    await page.mouse.up();

    // Right-click it right at the corner — the review-backlog #1 repro.
    await icon.click({ button: "right" });
    const menu = page.getByRole("menu").first();
    await expect(menu).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport)
      throw new Error("no viewport size");
    const menuBox = await menu.boundingBox();
    if (!menuBox)
      throw new Error("menu has no bounding box");
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.y).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);

    // Escape closes it (review-backlog #9).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});
