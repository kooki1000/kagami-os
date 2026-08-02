import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { boot, collectErrors, openApp } from "./helpers";

function clockWindow(page: Page) {
  return page.locator("[data-window-id]", { hasText: "Clock" });
}

test.describe("Clock (step 16b, D7)", () => {
  test("the stopwatch starts, pauses, and holds its value while paused", async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await openApp(page, "clock");
    const win = clockWindow(page);

    await win.getByRole("button", { name: "Stopwatch", exact: true }).click();
    await win.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForTimeout(1200);
    await win.getByRole("button", { name: "Pause", exact: true }).click();

    const readout = win.locator("div.font-mono:visible").first();
    const held = await readout.textContent();
    await page.waitForTimeout(500);
    await expect(readout).toHaveText(held ?? "");

    expect(errors).toEqual([]);
  });

  test("a countdown timer reaching zero fires a completion notification", async ({ page }) => {
    await boot(page);
    await openApp(page, "clock");
    const win = clockWindow(page);

    await win.getByRole("button", { name: "Timer", exact: true }).click();
    await win.getByLabel("Minutes").fill("0");
    await win.getByLabel("Seconds").fill("1");
    await win.getByRole("button", { name: "Start", exact: true }).click();

    await expect(page.getByText("Timer finished")).toBeVisible({ timeout: 3000 });
  });
});
