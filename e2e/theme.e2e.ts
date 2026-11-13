import { expect, test } from "./test";
import { THEME_KEY } from "../src/lib/theme";

// The night-mode switch: in the header from 760px, in the mobile menu below it.
// Media and viewport are set on the page, not the context, so this works with e2e/test.ts.

test("with nothing saved, the page follows the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  const toggle = page
    .getByRole("banner")
    .getByRole("switch", { name: "Night mode" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  // Still following: nothing saved yet, so a system change carries through
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "night");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("the header switch changes and saves the theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const toggle = page
    .getByRole("banner")
    .getByRole("switch", { name: "Night mode" });
  await toggle.click();

  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "night");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), THEME_KEY),
  ).toBe("day");

  // A saved choice wins over the system, and survives a reload
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "night");
});

test("the mobile menu has the switch, named by its label", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Navigation menu" });
  const toggle = menu.getByRole("switch", { name: "Night mode" });
  await toggle.click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});
