import type { Page } from "@playwright/test";
import { expect, test } from "./test";

// The cyclist easter egg: five clicks on the hero avatar start the ride, five more end it.
// The clock is Playwright's, so a ride of several seconds takes none.

const clickAvatar = async (page: Page, times: number) => {
  const avatar = page.getByRole("button", {
    name: "Illustrated portrait of Dan",
  });
  for (let i = 0; i < times; i++) await avatar.click();
};

const noSidewaysScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

// 760 is the narrowest the avatar shows at, and where it sits above the text
for (const width of [1280, 760]) {
  test(`at ${width}px, five clicks start the ride and five more end it`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.goto("/");
    const layer = page.locator("[data-ride-layer]");
    const ring = page.locator("[data-ride-ring]");
    const hint = page.locator("[data-ride-hint]");
    const toast = page.getByRole("status");

    await clickAvatar(page, 4);
    await expect(hint).toHaveText("one more and…");
    await expect(layer).toBeHidden();

    await clickAvatar(page, 1);
    await expect(toast).toHaveText("Out for a ride.");
    await expect(hint).toBeEmpty();
    await expect(layer).toBeVisible();
    // the avatar no longer changes the theme
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");

    // long enough to ride in, climb and lap; he's still going, and the page is no wider
    for (let second = 0; second < 20; second++) {
      await page.clock.runFor(1000);
      expect(await noSidewaysScroll(page)).toBe(true);
    }
    await expect(layer).toBeVisible();
    await expect(ring).toHaveAttribute("data-ridden");

    await clickAvatar(page, 4);
    await expect(hint).toHaveText("one more and he's off…");
    await clickAvatar(page, 1);
    await expect(toast).toHaveText("Heading out — see ya.");

    const pageHeight = () =>
      page.evaluate(() => document.documentElement.scrollHeight);
    const height = await pageHeight();
    for (let second = 0; second < 10; second++) {
      await page.clock.runFor(1000);
      expect(await noSidewaysScroll(page)).toBe(true);
    }
    await expect(layer).toBeHidden();
    await expect(ring).not.toHaveAttribute("data-ridden");
    expect(await pageHeight()).toBe(height);
  });
}

test("with reduced motion, five clicks only show the toast", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await clickAvatar(page, 5);
  await expect(page.getByRole("status")).toHaveText("Out for a ride.");
  await expect(page.locator("[data-ride-layer]")).toBeHidden();
});

test("the ride ends if the window gets too narrow for the avatar", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await clickAvatar(page, 5);
  const layer = page.locator("[data-ride-layer]");
  await expect(layer).toBeVisible();

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(layer).toBeHidden();
});
