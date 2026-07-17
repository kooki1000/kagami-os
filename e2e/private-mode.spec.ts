import { expect, test } from "@playwright/test";
import { boot, collectErrors, createFolder, openApp } from "./helpers";

// Scenario #14 from the H5 catalog. Per docs/e2e-test-plan.md §5.1 option
// (B): no dismissible "your session won't be saved" banner exists yet
// (building one is a separate feature decision), so this is scoped to what
// is real today — idbAdapter.ts's `typeof indexedDB === "undefined"` guard
// falls back to an in-memory no-op StorageAdapter, so the OS boots and is
// fully usable without IndexedDB, it just doesn't persist across a reload.
// The banner is intentionally not asserted here.
test.describe("private mode (no IndexedDB)", () => {
  test.beforeEach(async ({ page }) => {
    // addInitScript is registered on the browser context, so it re-applies
    // before every subsequent navigation — including the reload below —
    // not just the first page load.
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", {
        value: undefined,
        configurable: true,
      });
    });
  });

  test("boots and functions normally, but a session's writes do not survive reload", async ({ page }) => {
    const errors = collectErrors(page);

    await boot(page);

    // Same boot.spec.ts assertions: the shell is fully present, not degraded.
    await expect(page.locator("[data-dock-app=\"files\"]")).toBeVisible();
    await expect(page.locator("[data-dock-app=\"settings\"]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kagami" })).toBeVisible();

    // The in-memory fallback still backs normal fs writes for this session.
    await openApp(page, "files");
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
    await createFolder(page, "Ephemeral");

    // Reload with IndexedDB still blocked: the folder above was never
    // written to durable storage, so the fresh in-memory store comes back
    // empty rather than the OS hanging or crashing on the missing backend.
    await page.reload();
    await boot(page);
    await openApp(page, "files");
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
    await expect(page.getByText("Ephemeral", { exact: true })).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
