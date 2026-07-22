import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Window.tsx drives its minimize animation via inline style, not a CSS
// keyframe, so prefers-reduced-motion needs useReducedMotion() directly — it
// compresses both the transition duration and the setTimeout gating when
// minimizeWindow() fires (see `minimizeMs`). This spec pins that: default
// motion takes ~240ms, reduced motion finishes almost instantly.
//
// emulateMedia must run before the app boots. Its prefers-reduced-motion
// emulation is reliable only on Chromium (confirmed by direct measurement —
// Firefox is noisy, WebKit intermittently ignores it outright), so the
// reduced-motion case is Chromium-only, same flakiness class as
// files.spec.ts's HTML5 DnD test, not an app bug.

async function minimizeElapsedMs(page: import("@playwright/test").Page): Promise<number> {
  const win = page.locator("[data-window-id]");
  await expect(win).toHaveCount(1);

  const start = Date.now();
  await win.locator("button[aria-label=\"minimize window\"]").click();
  await expect(win).toHaveCount(0);
  return Date.now() - start;
}

test.describe("prefers-reduced-motion", () => {
  test("default motion: minimizing a window takes close to its full duration", async ({ page }) => {
    await openFiles(page);
    const elapsed = await minimizeElapsedMs(page);
    // Window.tsx's MINIMIZE_MS is 240ms; allow generous slack either side
    // for CI scheduling jitter while still proving it didn't collapse to
    // the reduced-motion path.
    expect(elapsed).toBeGreaterThan(150);
  });

  test("reduced motion: minimizing a window completes almost instantly", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "emulateMedia's prefers-reduced-motion emulation is unreliable on Firefox/WebKit");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFiles(page);
    const elapsed = await minimizeElapsedMs(page);
    // Window.tsx's REDUCED_MOTION_MS is 20ms; bounded well under the
    // default path's 240ms so the two cases can never be confused.
    expect(elapsed).toBeLessThan(150);
  });
});

test.describe(":focus-visible ring", () => {
  test("tabbing to a control shows a visible outline", async ({ page }) => {
    await openFiles(page);
    await page.keyboard.press("Tab");

    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body)
        return null;
      const style = getComputedStyle(el);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });

    expect(outline).not.toBeNull();
    expect(outline?.outlineStyle).toBe("solid");
    expect(outline?.outlineWidth).not.toBe("0px");
  });
});
