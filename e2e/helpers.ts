import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Navigate to a cold boot, wait for the Welcome window to greet it, then
 * close that window. App.tsx always opens Welcome on a fresh boot — closing
 * it here gives every spec built on `boot()` a clean, single-window slate
 * instead of having to account for a stray extra window in every
 * window-count assertion.
 *
 * Uses the `?fresh` bypass (C1) rather than plain `/`: several specs call
 * `boot()` again after a `page.reload()` mid-test to get back to this same
 * clean slate, and by then a window may well have been open when session
 * restore's debounced save last fired — without the bypass, that restore
 * would win over the "always Welcome" contract this helper promises.
 */
export async function boot(page: Page): Promise<void> {
  await page.goto("/?fresh");
  await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();
  await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
  await expect(page.locator("[data-window-id]")).toHaveCount(0);
}

export function openApp(page: Page, id: string) {
  return page.locator(`[data-dock-app="${id}"]`).click();
}

/** Boot, then open Files from the dock and wait for its toolbar. */
export async function openFiles(page: Page): Promise<void> {
  await boot(page);
  await openApp(page, "files");
  await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
}

/** New folder → lands in inline-rename with the field focused → name it. */
export async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New folder" }).click();
  const rename = page.locator("input:focus");
  await rename.fill(name);
  await rename.press("Enter");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/** Console/page errors collected for a "no errors" assertion. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", e => errors.push(e.message));
  return errors;
}
