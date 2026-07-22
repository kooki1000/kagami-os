import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Quarter snap + keyboard window ops (C4). Corner-drag reuses windows.spec.ts's
// raw pointer-event approach (Window.tsx drags via pointer capture, not HTML5
// dragstart) — dropping within the corner band of an X edge now snaps to a
// quarter instead of a half. Keyboard ops (⌃⌥←/→/↑/↓) exercise
// windowShortcuts.ts's arrowSnapDirection predicate end to end.

async function expectApprox(
  read: () => Promise<number | undefined>,
  expected: number,
  tolerance: number,
): Promise<void> {
  await expect.poll(read).toBeGreaterThan(expected - tolerance);
  await expect.poll(read).toBeLessThan(expected + tolerance);
}

test.describe("Quarter snap (drag to corner)", () => {
  test("drag to the top-left corner snaps to a quarter", async ({ page }) => {
    await openFiles(page);

    const win = page.locator("[data-window-id]");
    await expect(win).toHaveCount(1);
    await page.waitForTimeout(250);
    const baseline = await win.boundingBox();
    if (!baseline)
      throw new Error("window not laid out");

    const titleY = baseline.y + 15;
    const titleCenterX = baseline.x + baseline.width / 2;

    // (2, 2) is inside both the 8px X-edge zone and the corner band near the
    // top — releasing there snaps to the top-left quarter, not the left half.
    await page.mouse.move(titleCenterX, titleY);
    await page.mouse.down();
    await page.mouse.move(2, 2, { steps: 15 });
    await page.mouse.up();

    const viewport = page.viewportSize();
    if (!viewport)
      throw new Error("no viewport size");

    await expectApprox(async () => (await win.boundingBox())?.width, viewport.width / 2, 4);
    await expectApprox(async () => (await win.boundingBox())?.height, (viewport.height - 30) / 2, 6);
    await expectApprox(async () => (await win.boundingBox())?.x, 0, 4);
  });
});

test.describe("Keyboard window ops (⌃⌥←/→/↑/↓)", () => {
  test("⌃⌥→ snaps right, ⌃⌥↑ maximizes, ⌃⌥↓ restores to normal", async ({ page }) => {
    await openFiles(page);

    const win = page.locator("[data-window-id]");
    await expect(win).toHaveCount(1);
    await page.waitForTimeout(250);
    const baseline = await win.boundingBox();
    if (!baseline)
      throw new Error("window not laid out");

    await page.locator("[data-window-id]").click({ position: { x: 300, y: 10 } });

    const viewport = page.viewportSize();
    if (!viewport)
      throw new Error("no viewport size");

    await page.keyboard.press("Control+Alt+ArrowRight");
    await expectApprox(async () => (await win.boundingBox())?.width, viewport.width / 2, 4);
    await expectApprox(async () => (await win.boundingBox())?.x, viewport.width / 2, 4);

    await page.keyboard.press("Control+Alt+ArrowUp");
    await expectApprox(async () => (await win.boundingBox())?.width, viewport.width, 4);
    await expectApprox(async () => (await win.boundingBox())?.x, 0, 4);

    await page.keyboard.press("Control+Alt+ArrowDown");
    await expectApprox(async () => (await win.boundingBox())?.width, baseline.width, 4);
    await expectApprox(async () => (await win.boundingBox())?.height, baseline.height, 4);
  });
});
