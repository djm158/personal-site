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

// 580 is the hero breakpoint, the narrowest the avatar shows at
for (const width of [1280, 580]) {
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
    // and on the ring he's never cut off by the right edge of the screen
    const rider = page.locator("[data-ride-rider]");
    for (let tick = 0; tick < 80; tick++) {
      await page.clock.runFor(250);
      expect(await noSidewaysScroll(page)).toBe(true);
      if ((await ring.getAttribute("data-ridden")) !== null) {
        const box = await rider.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
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

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(layer).toBeHidden();
});

test("the avatar's eyes follow the cyclist, then go back to the cursor", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  // how far the pupils have moved from centre, in the avatar's SVG units (4.5 at most)
  const pupils = async () => {
    const transform = await page
      .locator("[data-pupils]")
      .getAttribute("transform");
    const [x, y] = (transform ?? "translate(0 0)").match(/-?[\d.]+/g)!;
    return { x: Number(x), y: Number(y) };
  };

  // he sets off from the bottom left, and the eyes go to him though the cursor is on the avatar
  await clickAvatar(page, 5);
  await page.clock.runFor(100);
  expect((await pupils()).x).toBeLessThan(-2);
  expect((await pupils()).y).toBeGreaterThan(0);

  // the cursor is ignored while he's out
  await page.mouse.move(1270, 80);
  await page.clock.runFor(100);
  expect((await pupils()).x).toBeLessThan(-2);

  // on the ring the eyes go round with him: to each side, and up and down
  const seen = { left: false, right: false, up: false, down: false };
  for (let tick = 0; tick < 100; tick++) {
    await page.clock.runFor(200);
    const { x, y } = await pupils();
    seen.left ||= x < -3;
    seen.right ||= x > 3;
    seen.up ||= y < -3;
    seen.down ||= y > 3;
  }
  expect(seen).toEqual({ left: true, right: true, up: true, down: true });

  // once he's gone, they return to where the cursor was left: up and to the right
  await clickAvatar(page, 5);
  await page.mouse.move(1270, 80);
  await page.clock.runFor(10_000);
  await expect(page.locator("[data-ride-layer]")).toBeHidden();
  const after = await pupils();
  expect(after.x).toBeGreaterThan(2);
  expect(after.y).toBeLessThan(0);

  // and follow it again
  await page.mouse.move(10, 700);
  await page.clock.runFor(100);
  expect((await pupils()).x).toBeLessThan(-2);
});
