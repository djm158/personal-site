import { test as base } from "@playwright/test";

// Inside the Claude Code sandbox (the backlog loop) Chromium runs single-process, which
// crashes when a browser opens a second context, so each test gets a browser of its own.
// Everywhere else this is Playwright's own `test`. See docs/research/loop-sandbox.md.
export const test = process.env.HTTPS_PROXY
  ? base.extend({
      page: async ({ playwright, launchOptions, baseURL, viewport }, use) => {
        const browser = await playwright.chromium.launch(launchOptions);
        const context = await browser.newContext({ baseURL, viewport });
        await use(await context.newPage());
        await browser.close();
      },
    })
  : base;

export { expect } from "@playwright/test";
