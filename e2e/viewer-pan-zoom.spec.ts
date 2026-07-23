import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Viewer drag-to-pan + wheel/trackpad-pinch zoom (D2). Pointer-drag panning
// uses real Pointer Events (not HTML5 draggable DnD, which is the flaky
// surface this repo tags Chromium-only) — window drag/snap specs already
// drive the same page.mouse primitives across all three engines, so this
// stays untagged too.

test.describe("Viewer pan + wheel zoom", () => {
  test("drag pans a zoomed-in image, and ctrl+wheel zooms", async ({ page }) => {
    await openFiles(page);

    await page.locator("[data-node-name=\"Pictures\"]").dblclick();
    await page.getByText("lagoon-dusk.svg", { exact: true }).dblclick();

    const img = page.locator("img").last();
    await expect(img).toBeVisible();

    const readout = page.locator("span").filter({ hasText: /^(?:Fit|\d+%)$/ });
    await expect(readout).toHaveText("Fit");

    // Zoom in enough that the image overflows the body and panning kicks in.
    for (let i = 0; i < 8; i++)
      await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(readout).not.toHaveText("Fit");

    const body = page.locator("[data-window-id]").last().locator("div.overflow-auto");
    await expect(body).toHaveCSS("cursor", "grab");

    const beforeScroll = await body.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));

    const box = await body.boundingBox();
    if (!box)
      throw new Error("viewer body not laid out");
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 80, centerY - 60, { steps: 10 });
    await page.mouse.up();

    const afterScroll = await body.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
    expect(afterScroll.left !== beforeScroll.left || afterScroll.top !== beforeScroll.top).toBe(true);

    // Zoom to fit, then ctrl+wheel (trackpad pinch) zooms back in.
    await page.getByRole("button", { name: "Zoom to fit" }).click();
    await expect(readout).toHaveText("Fit");

    // Playwright's `mouse.wheel` has no modifier param — holding Control via
    // the keyboard is what puts `ctrlKey: true` on the dispatched wheel
    // event, which is how a real trackpad pinch gesture is distinguished
    // from a plain scroll (see ViewerApp.tsx's native wheel listener).
    await page.mouse.move(centerX, centerY);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");

    await expect(readout).not.toHaveText("Fit");
  });
});
