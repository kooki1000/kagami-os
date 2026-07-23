import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Viewer zoom / fit / rotate / resize-refit (catalog #8). All toolbar
// buttons already carry aria-labels; the zoom readout is a plain <span>
// showing either "Fit" or a rounded percentage, and rotation is read off the
// <img>'s inline `transform: rotate(${deg}deg)` style — there's no separate
// numeric readout for it. The fitted-mode refit runs off a ResizeObserver, so
// the post-resize assertion polls rather than waiting a fixed timeout, since
// that timing differs across engines (especially WebKit).

test.describe("Viewer zoom / fit / rotate / refit", () => {
  test("zoom in, rotate, fit, then resize keeps fitted mode in sync", async ({ page }) => {
    await openFiles(page);

    // "Pictures" also names a sidebar Places entry, so target the grid
    // item's own hook rather than ambiguous text.
    await page.locator("[data-node-name=\"Pictures\"]").dblclick();
    await page.getByText("lagoon-dusk.svg", { exact: true }).dblclick();

    // The Files window (still open behind Viewer) renders its own <img>
    // thumbnails for every image in the current folder, so scope to the
    // most recently opened window — new windows always append last, both
    // in the store's array and therefore in DOM order (windowStore.ts's
    // openWindow: `windows: [...state.windows, win]`).
    const img = page.locator("img").last();
    await expect(img).toBeVisible();

    // Matched by content ("Fit" or a rounded percentage), not styling —
    // there's no aria-label on this readout span.
    const readout = page.locator("span").filter({ hasText: /^(?:Fit|\d+%)$/ });
    await expect(readout).toHaveText("Fit");

    // Two "Zoom in" clicks leave fitted mode and show a percentage.
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const afterTwo = await readout.textContent();
    expect(afterTwo).toMatch(/^\d+%$/);

    // One more click monotonically increases the percentage.
    const before = Number(afterTwo!.replace("%", ""));
    await page.getByRole("button", { name: "Zoom in" }).click();
    const after = Number((await readout.textContent())!.replace("%", ""));
    expect(after).toBeGreaterThan(before);

    // Rotate right by 90deg — the img's inline transform reflects it.
    await page.getByRole("button", { name: "Rotate right" }).click();
    const transform = await img.evaluate(el => (el as HTMLImageElement).style.transform);
    expect(transform).toContain("rotate(90deg)");

    // Zoom to fit returns the readout to "Fit".
    await page.getByRole("button", { name: "Zoom to fit" }).click();
    await expect(readout).toHaveText("Fit");

    // Resize the Viewer window from its south-east corner handle and confirm
    // fitted mode recomputes (stays "Fit") once the ResizeObserver settles.
    // Same append-last reasoning as `img` above — `.filter({ has: img })`
    // won't work here since Playwright re-evaluates a `.last()` locator
    // relative to each candidate, matching the Files window's own last
    // thumbnail too.
    const viewerWindow = page.locator("[data-window-id]").last();
    const rect = await viewerWindow.boundingBox();
    if (!rect)
      throw new Error("viewer window not laid out");

    const handleX = rect.x + rect.width - 4;
    const handleY = rect.y + rect.height - 4;
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 150, handleY + 150, { steps: 15 });
    await page.mouse.up();

    await expect.poll(() => readout.textContent()).toBe("Fit");
  });
});

// Prev/Next-within-folder + slideshow (D2). Seed data's Pictures folder
// ships three images, which is enough to prove both single-step navigation
// and full wraparound without uploading fixtures. Order isn't hardcoded —
// the test reads whichever image Files opens first and just asserts the
// title cycles through three distinct names before repeating.
test.describe("Viewer prev/next + slideshow (D2)", () => {
  function focusedWindow(page: import("@playwright/test").Page) {
    return page.locator("[data-window-focused=\"true\"]");
  }

  test("Next/Previous cycle through the folder's images, buttons and arrow keys alike, and wrap around", async ({ page }) => {
    await openFiles(page);
    await page.locator("[data-node-name=\"Pictures\"]").dblclick();

    const firstThumb = page.locator("[data-node-id]").first();
    const firstName = await firstThumb.getAttribute("data-node-name");
    await firstThumb.dblclick();

    const viewer = focusedWindow(page);
    const title = viewer.locator("[data-window-title]");
    await expect(title).toHaveText(firstName!);

    const seen = [firstName!];
    await viewer.getByRole("button", { name: "Next image" }).click();
    seen.push((await title.textContent())!);
    await viewer.getByRole("button", { name: "Next image" }).click();
    seen.push((await title.textContent())!);

    // Three images, three distinct names visited.
    expect(new Set(seen).size).toBe(3);

    // A fourth Next wraps back to the first image.
    await viewer.getByRole("button", { name: "Next image" }).click();
    await expect(title).toHaveText(firstName!);

    // Previous wraps the other way.
    await viewer.getByRole("button", { name: "Previous image" }).click();
    await expect(title).toHaveText(seen[2]);

    // Bare arrow keys drive the same cursor — click the image body first so
    // the key events target the window rather than the Files list behind it.
    await viewer.locator("img").click();
    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText(firstName!);
    await page.keyboard.press("ArrowLeft");
    await expect(title).toHaveText(seen[2]);
  });

  test("slideshow play/pause auto-advances through the folder", async ({ page }) => {
    await openFiles(page);
    await page.locator("[data-node-name=\"Pictures\"]").dblclick();

    const firstThumb = page.locator("[data-node-id]").first();
    const firstName = await firstThumb.getAttribute("data-node-name");
    await firstThumb.dblclick();

    const viewer = focusedWindow(page);
    const title = viewer.locator("[data-window-title]");
    await expect(title).toHaveText(firstName!);

    await viewer.getByRole("button", { name: "Play slideshow" }).click();
    await expect(viewer.getByRole("button", { name: "Pause slideshow" })).toBeVisible();
    await expect.poll(() => title.textContent(), { timeout: 6000 }).not.toBe(firstName);

    const advanced = await title.textContent();
    await viewer.getByRole("button", { name: "Pause slideshow" }).click();
    await expect(viewer.getByRole("button", { name: "Play slideshow" })).toBeVisible();

    // Give a tick that would have fired if the interval were still running,
    // then confirm the image really did stop moving.
    await page.waitForTimeout(3200);
    await expect(title).toHaveText(advanced!);
  });
});
