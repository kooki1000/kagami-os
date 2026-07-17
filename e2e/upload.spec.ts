import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// B2 upload from host OS (plan §4.10). Drives the hidden file <input> behind
// the "Upload files" toolbar button directly with setInputFiles — no OS
// dialog to simulate, and it fires the same onChange handler a real pick
// would. OS drag-and-drop of host files can't be simulated in Playwright, so
// this covers the <input> fallback path, not the drag path.

test.describe("Files upload (B2)", () => {
  test("uploading a text file and an image adds both, and the image opens in Viewer", async ({ page }) => {
    await openFiles(page);

    // The files-input and folder-input hidden inputs are adjacent and share
    // no distinguishing attributes — the files case is the first on the page.
    await page.locator("input[type=\"file\"]").first().setInputFiles([
      "e2e/fixtures/sample.txt",
      "e2e/fixtures/sample.svg",
    ]);

    // handleUpload's notify() title, read from FilesApp.tsx: "Uploaded N files".
    await expect(page.getByText("Uploaded 2 files")).toBeVisible();
    await expect(page.getByText("sample.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("sample.svg", { exact: true })).toBeVisible();

    // Opening the uploaded image proves the bytes actually resolved through
    // the blob store, not just that a node was created.
    await page.getByText("sample.svg", { exact: true }).dblclick();
    await expect(page.locator("img")).toBeVisible();
  });
});
