import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// Window.tsx drives its minimize animation via inline style.transition, not
// a CSS keyframe, so `prefers-reduced-motion` can't reach it through a media
// query alone — it reads useReducedMotion() itself and compresses both the
// transition duration *and* the setTimeout that gates when minimizeWindow()
// actually fires (see Window.tsx's `minimizeMs`). This spec pins that
// end-to-end behavior: under the default media environment the minimize
// takes close to its full ~240ms, and under emulated "reduce motion" it
// completes almost immediately.
//
// emulateMedia must run before the app boots — useReducedMotion mirrors
// themeStore's pattern of reading matchMedia(...) once at module scope, so
// the preference has to be in place before that module first evaluates.

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

  test("reduced motion: minimizing a window completes almost instantly", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFiles(page);
    const elapsed = await minimizeElapsedMs(page);
    // Window.tsx's REDUCED_MOTION_MS is 20ms; bounded well under the
    // default path's 240ms so the two cases can never be confused.
    expect(elapsed).toBeLessThan(100);
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
