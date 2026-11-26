import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

/**
 * End-to-end tests (H5) run against a production preview build across the
 * three engines the roadmap commits to: Chromium, Firefox, and WebKit.
 * Unit suites (Vitest) stay under `src/**`; these live in `e2e/`.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Half the cores. A single worker ran the suite serially; measured locally
  // on 4 cores, chromium dropped from 4.1 min to 1.4 min at 100% with no
  // flakes. Firefox/WebKit are heavier, so keep headroom — retries are the
  // backstop.
  workers: isCI ? "50%" : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
