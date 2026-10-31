import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Accessibility checks (pnpm test:a11y) against the production build served by astro preview.
// They need an up-to-date ./dist, so run pnpm build first.
if (!existsSync("dist/index.html")) {
  throw new Error("No ./dist to test. Run pnpm build first.");
}

const port = 4325;

// Inside the Claude Code sandbox (the backlog loop) Chromium can't start in its usual
// multi-process mode; e2e/test.ts handles the rest. See docs/research/loop-sandbox.md.
const sandboxed = Boolean(process.env.HTTPS_PROXY);

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["Desktop Chrome"],
    launchOptions: sandboxed
      ? { args: ["--no-sandbox", "--single-process", "--no-zygote"] }
      : {},
  },
  webServer: {
    command: `astro preview --ignore-lock --port ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
  },
});
