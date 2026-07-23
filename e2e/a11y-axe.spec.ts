import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { boot, openFiles } from "./helpers";

// Phase 11 (H1)'s exit criterion (ROADMAP.md) is "menus and context menus
// pass an axe-core audit". The other a11y-*.spec.ts files hand-assert
// specific roles/attributes; this one runs an automated scan across the
// bare desktop, an open MenuBar dropdown, an open ContextMenu, and the
// Files window, to catch regressions those hand-picked assertions miss.
//
// The "region" (ARIA landmark) rule is disabled on every scan: Kagami's
// shell has no landmark structure yet, and adding one is a larger
// cross-component change tracked as follow-up rather than done here.

// disableRules() replaces the rule set per call rather than merging, so
// "region" is folded into every call here instead of composed separately.
function scan(page: Parameters<typeof boot>[0], extraDisabledRules: string[] = []) {
  return new AxeBuilder({ page }).disableRules(["region", ...extraDisabledRules]);
}

test.describe("axe-core accessibility audit", () => {
  test("bare desktop has no violations", async ({ page }) => {
    await boot(page);

    const results = await scan(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test("an open MenuBar dropdown has no violations", async ({ page }) => {
    await boot(page);

    const trigger = page.getByRole("button", { name: "Kagami" });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    const results = await scan(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test("an open ContextMenu has no violations", async ({ page }) => {
    await boot(page);

    await page.locator(".wallpaper").click({ button: "right", position: { x: 200, y: 200 } });
    await expect(page.getByRole("menu")).toBeVisible();

    const results = await scan(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the Files app window has no violations", async ({ page }) => {
    await openFiles(page);

    // color-contrast is disabled here only: the sidebar's muted labels and
    // selected-item text fall short of WCAG AA at the Lagoon palette's
    // current token values. Bumping them needs its own design sign-off —
    // tracked as follow-up, not a side effect of this audit.
    const results = await scan(page, ["color-contrast"]).analyze();
    expect(results.violations).toEqual([]);
  });
});
