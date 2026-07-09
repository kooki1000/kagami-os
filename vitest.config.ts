import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config (no Tailwind/React plugins) — the suites target the
// framework-agnostic stores and the shell engine, which run under Node.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
