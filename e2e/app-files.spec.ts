import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { boot, openApp } from "./helpers";

// Step 17 (D8.11) — an installed app opens files. "Peek" asks for no
// capabilities at all and declares `fileTypes`, so everything it can read it
// was handed: the file it was opened with, or the one the user picked in the
// shell's dialog.

const PEEK_ENTRY = `${readFileSync("sdk/kagami-client.js", "utf8")}
const out = document.createElement("pre");
out.id = "out";
document.body.append(out);
const show = (lines) => { out.textContent = lines.join("\\n"); };

const pick = document.createElement("button");
pick.id = "pick";
pick.textContent = "Pick";
pick.addEventListener("click", async () => {
  const entry = await kagami.fs.pick(["text/*"]);
  show([entry ? "picked: " + (await kagami.fs.readText(entry.id)) : "picked: nothing"]);
});
document.body.append(pick);

(async () => {
  const info = await kagami.info();
  const lines = ["file: " + (info.fileId ? await kagami.fs.readText(info.fileId) : "none")];
  const attempts = {
    list: () => kagami.fs.list("documents"),
    write: () => kagami.fs.write("documents", "x.txt", "x"),
    remove: () => kagami.fs.delete(info.fileId),
  };
  for (const [name, attempt] of Object.entries(attempts)) {
    try { await attempt(); lines.push(name + ": allowed"); }
    catch (error) { lines.push(name + ": " + error.code); }
  }
  show(lines);
})();
`;

function peekBundle(): Buffer {
  const manifest = { id: "peek", name: "Peek", version: "1.0.0", entry: "entry.js", capabilities: [], fileTypes: ["text/plain"] };
  return Buffer.from(zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "entry.js": strToU8(PEEK_ENTRY) }));
}

test.describe("Installed apps open files (step 17, D8.11)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kagami:flag:third_party_apps", "on"));
  });

  test("an app reads the file it was opened with, and nothing else", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles({ name: "peek.zip", mimeType: "application/zip", buffer: peekBundle() });
    await expect(page.getByRole("dialog", { name: "Install Peek" })).toContainText("text/plain");
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await expect(page.getByText("\"Peek\" installed")).toBeVisible();

    // Installing doesn't take over: text still opens in Notes by default.
    await page.getByRole("button", { name: "Default Apps" }).click();
    await expect(page.getByLabel("Default app for Text documents")).not.toHaveValue("peek");

    await openApp(page, "files");
    await page.locator("input[type=\"file\"]").first().setInputFiles("e2e/fixtures/sample.txt");
    await page.getByText("sample.txt", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Open With/ }).click();
    await page.getByRole("menuitem", { name: "Peek", exact: true }).click();

    const frame = page.frameLocator("iframe[title=\"peek\"]");
    const sample = readFileSync("e2e/fixtures/sample.txt", "utf8").trim();
    await expect(frame.locator("#out")).toContainText(`file: ${sample}`);
    await expect(frame.locator("#out")).toContainText("list: capability_denied");
    await expect(frame.locator("#out")).toContainText("write: capability_denied");
    await expect(frame.locator("#out")).toContainText("remove: capability_denied");
  });

  test("fs.pick draws the shell's dialog and grants only what's chosen", async ({ page }) => {
    await boot(page);
    await openApp(page, "settings");
    await page.getByRole("button", { name: "Apps", exact: true }).click();
    await page.locator("input[type=\"file\"]").first().setInputFiles({ name: "peek.zip", mimeType: "application/zip", buffer: peekBundle() });
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await page.getByRole("button", { name: "Open", exact: true }).click();

    const frame = page.frameLocator("iframe[title=\"peek\"]");
    await expect(frame.locator("#out")).toContainText("file: none");

    // Cancelling grants nothing.
    await frame.locator("#pick").dispatchEvent("click");
    const dialog = page.getByRole("dialog", { name: "Choose a file for Peek" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(frame.locator("#out")).toContainText("picked: nothing");

    // Choosing one reads it.
    await frame.locator("#pick").dispatchEvent("click");
    await dialog.getByRole("button", { name: "Home" }).click();
    await dialog.getByRole("button", { name: "Documents" }).click();
    await dialog.getByRole("button", { name: /^todo\.md/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(frame.locator("#out")).toContainText("picked: ");
    await expect(frame.locator("#out")).not.toContainText("picked: nothing");
  });
});
