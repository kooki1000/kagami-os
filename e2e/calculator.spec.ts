import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { boot, collectErrors, openApp } from "./helpers";

function calcWindow(page: Page) {
  return page.locator("[data-window-id]", { hasText: "Calculator" });
}

function display(page: Page) {
  return calcWindow(page).locator("div.tabular-nums").first();
}

test.describe("Calculator (step 16b, D7)", () => {
  test("a basic arithmetic chain evaluates correctly", async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await openApp(page, "calculator");
    const win = calcWindow(page);

    await win.getByRole("button", { name: "1", exact: true }).click();
    await win.getByRole("button", { name: "2", exact: true }).click();
    await win.getByRole("button", { name: "+", exact: true }).click();
    await win.getByRole("button", { name: "8", exact: true }).click();
    await win.getByRole("button", { name: "=", exact: true }).click();
    await expect(display(page)).toHaveText("20");

    expect(errors).toEqual([]);
  });

  test("a scientific function evaluates correctly", async ({ page }) => {
    await boot(page);
    await openApp(page, "calculator");
    const win = calcWindow(page);

    await win.getByRole("button", { name: "1", exact: true }).click();
    await win.getByRole("button", { name: "6", exact: true }).click();
    await win.getByRole("button", { name: "√x", exact: true }).click();
    await expect(display(page)).toHaveText("4");
  });

  test("division by zero shows Error, escaped only by Clear", async ({ page }) => {
    await boot(page);
    await openApp(page, "calculator");
    const win = calcWindow(page);

    await win.getByRole("button", { name: "5", exact: true }).click();
    await win.getByRole("button", { name: "÷", exact: true }).click();
    await win.getByRole("button", { name: "0", exact: true }).click();
    await win.getByRole("button", { name: "=", exact: true }).click();
    await expect(display(page)).toHaveText("Error");

    // Digits are refused while in the error state — only Clear escapes it.
    await win.getByRole("button", { name: "1", exact: true }).click();
    await expect(display(page)).toHaveText("Error");

    await win.getByRole("button", { name: "C", exact: true }).click();
    await expect(display(page)).toHaveText("0");
  });
});
