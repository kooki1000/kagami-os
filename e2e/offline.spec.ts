import { expect, test } from "@playwright/test";
import { boot, collectErrors, createFolder, openFiles } from "./helpers";

// F2 (offline indicator) + F1 (installable/offline-capable PWA), Phase 12.
// "Offline" here means presence only — no sync queue exists yet (that's
// Phase 13/A4) — so these specs check the indicator and that the shell
// keeps working locally, not that anything gets queued for later upload.
test.describe("offline", () => {
  test("shows an indicator and keeps the shell interactive when connectivity drops mid-session", async ({ page, context }) => {
    const errors = collectErrors(page);
    // Open Files *before* going offline — it's React.lazy-loaded, and its
    // chunk has to actually fetch over the (still-live) network the first
    // time; offline should only ever cut off *new* fetches, not code this
    // session already has.
    await openFiles(page);
    await expect(page.getByRole("status", { name: "Offline" })).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.getByRole("status", { name: "Offline" })).toBeVisible();
    await expect(page.getByText("You're offline")).toBeVisible();

    // The shell stays fully usable — this is local-first fs data (IndexedDB),
    // unrelated to the network drop.
    await createFolder(page, "Offline Folder");

    await context.setOffline(false);
    await expect(page.getByRole("status", { name: "Offline" })).toHaveCount(0);
    await expect(page.getByText("Back online")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("boots fully from cache with no network at all (airplane-mode boot)", async ({ page, context }) => {
    const errors = collectErrors(page);

    // First visit, online: registers the service worker (F1). A page's own
    // first load can't be served by the worker it's in the middle of
    // installing, so one more online reload is needed for the *next* load's
    // requests to actually pass through the now-active worker and populate
    // its cache.
    await boot(page);
    await page.waitForFunction(
      () => navigator.serviceWorker?.controller !== null,
      undefined,
      { timeout: 15_000 },
    );
    await page.reload();
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();

    // Now go fully offline and reload again — this load has no network at
    // all, so a successful render proves the cached shell, not a lucky race.
    await context.setOffline(true);
    await page.reload();

    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
    await expect(page.locator("[data-dock-app=\"settings\"]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kagami" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Offline" })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
