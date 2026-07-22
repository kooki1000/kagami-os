import { expect, test } from "@playwright/test";
import { openFiles } from "./helpers";

// B3 download to host OS (plan §4.11): single-file download and
// folder-as-zip (Web Worker) via the item context menu, both routed through
// download.ts's triggerDownload <a download> click.

test.describe("Files download (B3)", () => {
  test("downloads a seeded file with its own filename", async ({ page }) => {
    await openFiles(page);
    // "Documents" also names a sidebar Places entry, so target the grid
    // item's own hook rather than ambiguous text.
    await page.locator("[data-node-name=\"Documents\"]").dblclick();

    await page.getByText("welcome.md", { exact: true }).click({ button: "right" });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      // Non-exact name matching would also hit the sidebar's "Downloads"
      // Places entry, since it contains "Download" as a prefix.
      page.getByRole("menuitem", { name: "Download", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("welcome.md");
  });

  test("downloads a folder as a zip", async ({ page }) => {
    await openFiles(page);

    await page.locator("[data-node-name=\"Documents\"]").click({ button: "right" });
    const [download] = await Promise.all([
      // Zipping runs off the main thread in zipWorker.ts — allow extra time.
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("menuitem", { name: "Download as Zip" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("Documents.zip");
  });
});
