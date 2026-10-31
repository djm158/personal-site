import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./test";
import { THEME_KEY, type Theme } from "../src/lib/theme";

const pages = ["/", "/resume/"];
const themes: Theme[] = ["day", "night"];

for (const path of pages) {
  for (const theme of themes) {
    test(`${path} in ${theme} mode has no axe violations`, async ({ page }) => {
      // The inline script in Layout.astro applies the stored theme before first paint
      await page.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        [THEME_KEY, theme],
      );
      await page.goto(path);
      const html = page.locator("html");
      if (theme === "night") {
        await expect(html).toHaveAttribute("data-theme", "night");
      } else {
        await expect(html).not.toHaveAttribute("data-theme", "night");
      }

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}
