import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// Step 16a exit criteria (ROADMAP.md §8): a sandboxed frame cannot reach
// localStorage, cookies, IndexedDB, or the network — asserted by negative
// tests, not by inspection — and a capability the manifest didn't request
// is refused by the shell, with the refusal logged rather than silent.
// The `sandboxDemo` app (flag `app_sandbox`) only registers with the flag
// on, same pattern as `devcrash`/`e2e_crash` — seeded via localStorage
// before boot, since the flag is read at registry.ts module-eval time.

test.describe("Capability sandbox (step 16a)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kagami:flag:app_sandbox", "on"));
  });

  test("allowed fs.read, denied fs.read, notification, and sandbox escape attempts", async ({ page }) => {
    await boot(page);

    // Seed a real file inside the granted "fs.read:documents" scope via
    // Terminal, then read its true node id off Files' data-node-id hook —
    // capability scoping is id-based, not path-based, so the demo app
    // needs a real id to prove an allowed read.
    await openApp(page, "terminal");
    const shellInput = page.locator("input");
    await shellInput.fill("cd Documents");
    await shellInput.press("Enter");
    await shellInput.fill("echo hello > probe.txt");
    await shellInput.press("Enter");

    await openApp(page, "files");
    await page.locator("[data-node-name=\"Documents\"]").dblclick();
    const probeId = await page.locator("[data-node-name=\"probe.txt\"]").getAttribute("data-node-id");
    expect(probeId).toBeTruthy();

    await openApp(page, "sandboxDemo");
    const frame = page.frameLocator("iframe[title=\"sandboxDemo\"]");

    // Allowed: the id sits inside the granted scope.
    await frame.locator("#read-id").fill(probeId!);
    await frame.locator("#read-btn").click();
    await expect(frame.locator("#read-result")).toContainText("ok: probe.txt");

    // Denied: no granted capability covers this id — it doesn't even need
    // to exist, since the capability check runs before any fs lookup.
    await frame.locator("#read-id").fill("not-a-granted-id");
    await frame.locator("#read-btn").click();
    await expect(frame.locator("#read-result")).toContainText("denied: capability_denied");

    // Allowed notification — assert the real shell toast, not just the
    // frame's own self-report of success.
    await frame.locator("#notify-btn").click();
    await expect(frame.locator("#notify-result")).toContainText("ok: fired");
    await expect(page.getByText("Sandbox demo", { exact: true })).toBeVisible();

    // Escape attempts: every direct (bridge-bypassing) access must fail.
    await frame.locator("#escape-btn").click();
    await expect(frame.locator("#escape-result")).toContainText("localStorage: blocked");
    await expect(frame.locator("#escape-result")).not.toContainText("SANDBOX FAILED");

    // The load-bearing assertion, from the TOP-LEVEL page rather than the
    // frame's own report: without sandbox="allow-scripts" (no
    // allow-same-origin), this same-origin script would share exactly this
    // storage with the parent. Seeing nothing land here is what proves the
    // opaque origin actually took effect, not merely what the frame claims.
    const topStorage = await page.evaluate(() => ({
      localStorage: localStorage.getItem("sandbox-escape-probe"),
      cookie: document.cookie,
    }));
    expect(topStorage.localStorage).toBeNull();
    expect(topStorage.cookie).not.toContain("sandbox-escape-probe");
  });

  test("a capability the manifest didn't declare is refused and logged, not silently dropped", async ({ page }) => {
    const denials: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" && message.text().includes("[sandbox] capability denied"))
        denials.push(message.text());
    });

    await boot(page);
    await openApp(page, "sandboxDemo");
    const frame = page.frameLocator("iframe[title=\"sandboxDemo\"]");

    await frame.locator("#read-id").fill("anything");
    await frame.locator("#read-btn").click();
    await expect(frame.locator("#read-result")).toContainText("denied");
    expect(denials.length).toBeGreaterThan(0);
  });
});
