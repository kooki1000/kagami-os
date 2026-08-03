import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { collectErrors, openApp, openFiles } from "./helpers";

// D6 (step 16b): PDF viewing, the capability sandbox's first real
// (non-demo) consumer. e2e/sandbox.spec.ts already proves the bridge's
// generic escape-proofing (storage/cookies/network) against the sandboxDemo
// app — these specs stay Documents-specific: opening a real PDF, page nav,
// zoom, and the step-16 exit criterion (ROADMAP.md §8) that a hostile PDF
// renders without script execution or a CSP violation.
//
// The assertions target the *host* chrome rather than anything inside the
// frame: the toolbar moved out to React so it could follow the theme, and
// the frame now only reports its state over `ui.setState`. Asserting on what
// the user actually sees also means these specs cover the bridge round-trip.

function focusedWindow(page: Page) {
  return page.locator("[data-window-focused=\"true\"]");
}

function documentsFrame(page: Page) {
  return page.frameLocator("iframe[title=\"documents\"]");
}

/** The toolbar's "Page [n] of [m]" pair, as a `"1 of 2"` string. */
async function pageInfo(page: Page): Promise<string> {
  const value = await page.getByLabel("Page number").inputValue();
  const total = await focusedWindow(page).getByText(/^of \d+$/).textContent();
  return `${value} ${total ?? ""}`.trim();
}

function zoomLabel(page: Page) {
  return focusedWindow(page).getByText(/^\d+%$/);
}

async function uploadAndOpen(page: Page, fixture: string, name: string) {
  await openFiles(page);
  await page.locator("input[type=\"file\"]").first().setInputFiles(fixture);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByText(name, { exact: true }).dblclick();
  // The toolbar only populates once the frame reports "ready".
  await expect(page.getByLabel("Page number")).toBeVisible();
}

test.describe("Documents (step 16b, D6)", () => {
  test("opening a PDF renders the first page inside the sandbox", async ({ page }) => {
    const errors = collectErrors(page);
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");

    const win = focusedWindow(page);
    await expect(win.locator("[data-window-title]")).toHaveText("sample.pdf");

    expect(await pageInfo(page)).toBe("1 of 2");
    await expect(zoomLabel(page)).toHaveText("100%");

    const box = await documentsFrame(page).locator("#page").boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test("the Go menu navigates between pages", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");
    expect(await pageInfo(page)).toBe("1 of 2");

    await page.getByRole("button", { name: "Go" }).click();
    await page.getByRole("menuitem", { name: "Next Page" }).click();
    await expect.poll(() => pageInfo(page)).toBe("2 of 2");

    await page.getByRole("button", { name: "Go" }).click();
    await page.getByRole("menuitem", { name: "Previous Page" }).click();
    await expect.poll(() => pageInfo(page)).toBe("1 of 2");
  });

  test("the toolbar navigates and zooms without going through the menus", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");

    // Previous is disabled on page 1, Next isn't.
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect.poll(() => pageInfo(page)).toBe("2 of 2");
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();

    // Typing a page number jumps straight there.
    await page.getByLabel("Page number").fill("1");
    await page.getByLabel("Page number").press("Enter");
    await expect.poll(() => pageInfo(page)).toBe("1 of 2");

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoomLabel(page)).toHaveText("120%");
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect(zoomLabel(page)).toHaveText("100%");
  });

  test("the View menu zooms in and out", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");
    await expect(zoomLabel(page)).toHaveText("100%");

    await page.getByRole("button", { name: "View", exact: true }).click();
    await page.getByRole("menuitem", { name: "Zoom In" }).click();
    await expect(zoomLabel(page)).toHaveText("120%");

    await page.getByRole("button", { name: "View", exact: true }).click();
    await page.getByRole("menuitem", { name: "Zoom Out" }).click();
    await expect(zoomLabel(page)).toHaveText("100%");
  });

  // The reason the chrome moved out of the frame at all: a `srcdoc` document
  // inherits no CSS custom properties, so everything it drew was hardcoded to
  // the light theme and stayed light no matter what the user picked.
  test("the viewer follows the dark theme", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");

    // The frame's own backdrop, painted from the `--surface-2` the host pushes
    // over the theme event. Reading it *inside* the iframe is the point: this
    // is the surface that used to be hardcoded light and unreachable.
    const frameBackdrop = () => documentsFrame(page).locator("body")
      .evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    const lightFrame = await frameBackdrop();

    // Switch through Settings, the way a user does. Poking `data-theme`
    // directly wouldn't do: the tokens are written inline on <html> by a React
    // effect keyed on the store, so faking the attribute leaves the values
    // themselves light and proves nothing.
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Dark" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

    await expect.poll(frameBackdrop).not.toBe(lightFrame);
  });

  test("opened bare from the dock, shows an empty state instead of a broken frame", async ({ page }) => {
    await openFiles(page); // boots and gets past Welcome
    await openApp(page, "documents");
    await expect(page.getByText("No document open.")).toBeVisible();
    // With nothing loaded, the transport controls are unusable rather than lying.
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
    await expect(page.getByLabel("Page number")).toHaveCount(0);
  });

  // Step-16 exit criterion (ROADMAP.md §8). hostile.pdf's /OpenAction would
  // fire app.alert()/this.print() in a scripting-enabled viewer; getDocument()
  // never wires that API, so it's just inert data — the same closed-vocabulary
  // guarantee D1's markdown preview shipped with (§6 decision 8).
  test("a hostile PDF (embedded JavaScript) renders inertly with no console errors", async ({ page }) => {
    const errors = collectErrors(page);
    let dialogFired = false;
    page.on("dialog", () => {
      dialogFired = true;
    });

    await uploadAndOpen(page, "e2e/fixtures/hostile.pdf", "hostile.pdf");
    expect(await pageInfo(page)).toBe("1 of 1");

    expect(dialogFired).toBe(false);
    expect(errors).toEqual([]);
  });
});
