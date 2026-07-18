import type { Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { createFolder, openFiles } from "./helpers";

// D5 media player: opening audio/video files (a second binary consumer of
// B1's blob storage, alongside Viewer) and the folder-scoped playlist
// (Next/Previous, both the on-screen transport buttons and the Playback
// menu's appCommand wiring). Each test runs in its own browser context, so
// IndexedDB starts clean.

function focusedWindow(page: Page) {
  return page.locator("[data-window-focused=\"true\"]");
}

test.describe("Media Player (D5)", () => {
  test("uploading an audio file opens it in Player with an <audio> element", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles({
      name: "song.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("stand-in bytes — only the declared mimeType routes this to Player"),
    });
    await expect(page.getByText("song.mp3", { exact: true })).toBeVisible();

    await page.getByText("song.mp3", { exact: true }).dblclick();
    const player = focusedWindow(page);
    await expect(player.locator("[data-window-title]")).toHaveText("song.mp3");
    await expect(player.locator("audio")).toHaveAttribute("src", /^blob:/);
  });

  test("uploading a video file opens it in Player with a <video> element", async ({ page }) => {
    await openFiles(page);
    await page.locator("input[type=\"file\"]").first().setInputFiles({
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("stand-in bytes — only the declared mimeType routes this to Player"),
    });
    await expect(page.getByText("clip.mp4", { exact: true })).toBeVisible();

    await page.getByText("clip.mp4", { exact: true }).dblclick();
    const player = focusedWindow(page);
    await expect(player.locator("[data-window-title]")).toHaveText("clip.mp4");
    await expect(player.locator("video")).toHaveAttribute("src", /^blob:/);
  });

  test("Next/Previous cycle through the folder's playlist, on-screen and via the Playback menu", async ({ page }) => {
    await openFiles(page);
    await createFolder(page, "Playlist Box");
    await page.getByText("Playlist Box", { exact: true }).dblclick();
    for (const name of ["01.mp3", "02.mp3", "03.mp3"]) {
      await page.locator("input[type=\"file\"]").first().setInputFiles({
        name,
        mimeType: "audio/mpeg",
        buffer: Buffer.from(name),
      });
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await page.getByText("01.mp3", { exact: true }).dblclick();
    const player = focusedWindow(page);
    const title = player.locator("[data-window-title]");
    await expect(title).toHaveText("01.mp3");

    // On-screen transport button.
    await player.getByRole("button", { name: "Next track", exact: true }).click();
    await expect(title).toHaveText("02.mp3");

    // The Playback menu's "Next Track" item routes through the same
    // appCommand bus Files' menu items use — proves the menu wiring, not
    // just the button's direct call. (MenuBar is shell chrome, not nested
    // under the window, so it's queried unscoped.) The button's accessible
    // name also includes its shortcut hint ("Next Track ⌘]"), and a
    // case-sensitive prefix match keeps it from colliding with the
    // lowercase "Next track" transport button elsewhere on the page.
    await page.getByRole("button", { name: "Playback", exact: true }).click();
    await page.getByRole("button", { name: /^Next Track/ }).click();
    await expect(title).toHaveText("03.mp3");

    // Wraps back around to the first track.
    await player.getByRole("button", { name: "Next track", exact: true }).click();
    await expect(title).toHaveText("01.mp3");

    // Previous wraps the other way, and the playlist sidebar is directly
    // clickable too.
    await player.getByRole("button", { name: "Previous track", exact: true }).click();
    await expect(title).toHaveText("03.mp3");
    await player.getByRole("button", { name: "01.mp3", exact: true }).click();
    await expect(title).toHaveText("01.mp3");
  });
});
