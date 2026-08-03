import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Navigate to a cold boot and leave the page on a clean, zero-window slate, so
 * specs don't have to account for a stray extra window in every window-count
 * assertion.
 *
 * Welcome greets the *first* boot of an install and only that one — App.tsx
 * records `welcomeSeen` rather than inferring first-run from "session restore
 * found nothing". Several specs call `boot()` twice (once, then again after a
 * mid-test reload), so the second call must expect no Welcome window at all.
 * Which case applies is read from `welcomeSeen` *before* navigating, since a
 * boot is the only thing that can flip it — reading afterwards would race the
 * launch it triggers.
 *
 * Uses the `?fresh` bypass (C1) rather than plain `/`: by the second call a
 * window may well have been open when session restore's debounced save last
 * fired, and restoring it would defeat the clean slate this helper promises.
 */
export async function boot(page: Page): Promise<void> {
  const alreadyGreeted = await welcomeSeen(page);
  await page.goto("/?fresh");
  await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
  if (!alreadyGreeted) {
    await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();
    await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
  }
  await expect(page.locator("[data-window-id]")).toHaveCount(0);
}

/**
 * Has this browser context already been greeted? A context that hasn't
 * navigated yet is still on `about:blank`, where reading `localStorage` throws
 * — which is itself the first-boot answer.
 */
async function welcomeSeen(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const raw = localStorage.getItem("kagami-settings");
      return raw ? JSON.parse(raw)?.state?.welcomeSeen === true : false;
    })
    .catch(() => false);
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

/**
 * Notes' editing surface. Since D9 it's a contenteditable ProseMirror
 * document rather than a `<textarea>`, so specs assert on its *text* rather
 * than an input value — the rendered document is what the user sees, and
 * the markdown behind it only exists on disk.
 */
export function noteEditor(page: Page) {
  return page.locator(".notes-prose");
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

/**
 * Polls (rather than a single read) so a still-settling layout under load
 * doesn't produce a one-off flaky mismatch — retries until the geometry
 * lands within tolerance or the default expect timeout elapses. Used by the
 * window drag/snap specs, whose asserted values are pixel measurements off
 * an animated, pointer-driven layout.
 */
export async function expectApprox(
  read: () => Promise<number | undefined>,
  expected: number,
  tolerance: number,
): Promise<void> {
  await expect.poll(read).toBeGreaterThan(expected - tolerance);
  await expect.poll(read).toBeLessThan(expected + tolerance);
}
