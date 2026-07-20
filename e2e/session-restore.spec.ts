import { expect, test } from "@playwright/test";
import { boot, openApp } from "./helpers";

// C1: window layout (rect/mode/minimized/focus) and, for apps that opt in
// (Notes/Viewer/Player), which file was open survive a reload.

test.describe("Session restore (C1)", () => {
  test("restores a maximized window's mode and a normal window's position across reload", async ({ page }) => {
    await boot(page);

    await openApp(page, "files");
    const files = page.locator("[data-window-id]").first();
    const filesId = await files.getAttribute("data-window-id");

    // Maximize Files via title-bar double-click (the only maximize trigger
    // that doesn't need a real drag gesture). Click away from the left-edge
    // window-control buttons and the (pointer-events: none) title text.
    await page.locator(`[data-window-id="${filesId}"]`).dblclick({ position: { x: 300, y: 10 } });
    await expect(files).toHaveCSS("width", await page.evaluate(() => `${window.innerWidth}px`));

    await openApp(page, "notes");
    const notes = page.locator("[data-window-id]").last();
    const notesId = await notes.getAttribute("data-window-id");
    expect(notesId).not.toBe(filesId);

    // Move the Notes window (still "normal") to a known position by dragging
    // its title bar, so restore has real geometry to check.
    const before = (await page.locator(`[data-window-id="${notesId}"]`).boundingBox())!;
    await page.mouse.move(before.x + 300, before.y + 10);
    await page.mouse.down();
    await page.mouse.move(before.x + 500, before.y + 160, { steps: 5 });
    await page.mouse.up();
    const movedRect = (await page.locator(`[data-window-id="${notesId}"]`).boundingBox())!;

    // Notes ends up focused (it was opened last); confirm before reloading.
    await expect(page.locator(`[data-window-id="${notesId}"]`)).toHaveAttribute("data-window-focused", "true");

    // Let the debounced session save (sessionStore's SAVE_DEBOUNCE_MS) fire
    // before reloading, or the restore would read a stale snapshot.
    await page.waitForTimeout(600);
    await page.reload();

    // Both windows come back — no Welcome window, no stray extras. Restored
    // windows get fresh ids (session restore doesn't promise id stability),
    // so windows are found by title text here rather than by the old ids.
    await expect(page.locator("[data-window-id]")).toHaveCount(2);

    const restoredFiles = page.locator("[data-window-id]").filter({ has: page.locator("[data-window-title]", { hasText: "Files" }) });
    await expect(restoredFiles).toBeVisible();
    await expect(restoredFiles).toHaveCSS("width", await page.evaluate(() => `${window.innerWidth}px`));

    const restoredNotes = page.locator("[data-window-id]").filter({ has: page.locator("[data-window-title]", { hasText: "Notes" }) });
    // A loose tolerance: this is checking "restore used the moved position,
    // not a fresh cascade spot" (which would be off by hundreds of px), not
    // pixel-perfect drag precision (which varies a few px per engine).
    const restoredRect = (await restoredNotes.boundingBox())!;
    expect(Math.abs(restoredRect.x - movedRect.x)).toBeLessThanOrEqual(20);
    expect(Math.abs(restoredRect.y - movedRect.y)).toBeLessThanOrEqual(20);

    // Notes was the focused window at save time.
    await expect(restoredNotes).toHaveAttribute("data-window-focused", "true");
  });

  test("reopening a file in Notes survives reload; closing every window doesn't resurrect Welcome", async ({ page }) => {
    await openFilesAndCreateNote(page);

    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByText("A desktop that lives in your browser")).toHaveCount(0);
    await expect(page.locator("[data-window-id]")).toHaveCount(1);
    await expect(page.locator("textarea")).toHaveValue("Hello from session restore");

    // Close the one remaining window, reload again: a session that restores
    // to zero windows must not resurrect Welcome.
    await page.locator("[data-window-control] button[aria-label=\"close window\"]").click();
    await expect(page.locator("[data-window-id]")).toHaveCount(0);
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByText("A desktop that lives in your browser")).toHaveCount(0);
    await expect(page.locator("[data-window-id]")).toHaveCount(0);
  });
});

async function openFilesAndCreateNote(page: Parameters<typeof boot>[0]) {
  await boot(page);
  await openApp(page, "notes");
  // The sidebar "+" (always rendered) rather than the empty-state "New Note"
  // button, which only shows up with zero notes — seed data ships two.
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.locator("textarea").fill("Hello from session restore");
  // Autosave debounce (NotesApp's AUTOSAVE_MS) before we reload.
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 2000 });
}
