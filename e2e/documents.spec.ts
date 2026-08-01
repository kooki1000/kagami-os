import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { collectErrors, openApp, openFiles } from "./helpers";

// D6 (step 16b): PDF viewing, the capability sandbox's first real
// (non-demo) consumer. e2e/sandbox.spec.ts already proves the bridge's
// generic escape-proofing (storage/cookies/network) against the sandboxDemo
// app — these specs stay Documents-specific: opening a real PDF, page nav,
// zoom, and the step-16 exit criterion (ROADMAP.md §8) that a hostile PDF
// renders without script execution or a CSP violation.

function focusedWindow(page: Page) {
  return page.locator("[data-window-focused=\"true\"]");
}

function documentsFrame(page: Page) {
  return page.frameLocator("iframe[title=\"documents\"]");
}

async function uploadAndOpen(page: Page, fixture: string, name: string) {
  await openFiles(page);
  await page.locator("input[type=\"file\"]").first().setInputFiles(fixture);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByText(name, { exact: true }).dblclick();
}

test.describe("Documents (step 16b, D6)", () => {
  test("opening a PDF renders the first page inside the sandbox", async ({ page }) => {
    const errors = collectErrors(page);
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");

    const win = focusedWindow(page);
    await expect(win.locator("[data-window-title]")).toHaveText("sample.pdf");

    const frame = documentsFrame(page);
    await expect(frame.locator("#pageinfo")).toHaveText("Page 1 of 2 · 100%");
    const box = await frame.locator("#page").boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test("the Go menu navigates between pages", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");
    const frame = documentsFrame(page);
    await expect(frame.locator("#pageinfo")).toHaveText("Page 1 of 2 · 100%");

    await page.getByRole("button", { name: "Go" }).click();
    await page.getByRole("menuitem", { name: "Next Page" }).click();
    await expect(frame.locator("#pageinfo")).toHaveText("Page 2 of 2 · 100%");

    await page.getByRole("button", { name: "Go" }).click();
    await page.getByRole("menuitem", { name: "Previous Page" }).click();
    await expect(frame.locator("#pageinfo")).toHaveText("Page 1 of 2 · 100%");
  });

  test("the View menu zooms in and out", async ({ page }) => {
    await uploadAndOpen(page, "e2e/fixtures/sample.pdf", "sample.pdf");
    const frame = documentsFrame(page);
    await expect(frame.locator("#pageinfo")).toHaveText("Page 1 of 2 · 100%");

    await page.getByRole("button", { name: "View", exact: true }).click();
    await page.getByRole("menuitem", { name: "Zoom In" }).click();
    await expect(frame.locator("#pageinfo")).toContainText("120%");

    await page.getByRole("button", { name: "View", exact: true }).click();
    await page.getByRole("menuitem", { name: "Zoom Out" }).click();
    await expect(frame.locator("#pageinfo")).toContainText("100%");
  });

  test("opened bare from the dock, shows an empty state instead of a broken frame", async ({ page }) => {
    await openFiles(page); // boots and gets past Welcome
    await openApp(page, "documents");
    const frame = documentsFrame(page);
    await expect(frame.locator("#status-text")).toHaveText("No document open.");
  });

  // Step-16 exit criterion (ROADMAP.md §8): a deliberately hostile PDF
  // fixture renders without script execution and without a CSP violation.
  // hostile.pdf carries an /OpenAction JavaScript entry that would call
  // app.alert()/this.print() in a scripting-enabled viewer — getDocument()
  // here never wires the scripting API at all, so it's inert data, the same
  // "closed vocabulary" guarantee D1's markdown preview shipped with
  // (§6 decision 8), just enforced by pdf.js's API surface instead of a
  // hand-rolled parser.
  test("a hostile PDF (embedded JavaScript) renders inertly with no console errors", async ({ page }) => {
    const errors = collectErrors(page);
    let dialogFired = false;
    page.on("dialog", () => {
      dialogFired = true;
    });

    await uploadAndOpen(page, "e2e/fixtures/hostile.pdf", "hostile.pdf");
    const frame = documentsFrame(page);
    await expect(frame.locator("#pageinfo")).toHaveText("Page 1 of 1 · 100%");

    expect(dialogFired).toBe(false);
    expect(errors).toEqual([]);
  });
});
