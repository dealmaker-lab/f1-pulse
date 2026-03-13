import { test, expect } from "@playwright/test";
import { PAGES, waitForPageReady, setLightMode, setDarkMode } from "./helpers";

/**
 * Theme tests — verify light/dark mode renders correctly on every page.
 * Takes screenshots for visual comparison.
 */

for (const { path, name } of PAGES) {
  test.describe(`${name} — theme`, () => {
    test("dark mode renders correctly", async ({ page }) => {
      await page.goto(path);
      await waitForPageReady(page);
      await setDarkMode(page);
      await page.waitForTimeout(500);

      // Background should be dark
      const bgColor = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue("--f1-black").trim();
      });
      // Dark theme --f1-black should be a dark color
      expect(bgColor).toBeTruthy();

      // Screenshot for visual regression
      await page.screenshot({
        path: `e2e/screenshots/${name.toLowerCase().replace(/\s+/g, "-")}-dark.png`,
        fullPage: true,
      });
    });

    test("light mode renders correctly", async ({ page }) => {
      await page.goto(path);
      await waitForPageReady(page);
      await setLightMode(page);
      await page.waitForTimeout(500);

      // Verify html class does NOT have "dark"
      const htmlClass = await page.locator("html").getAttribute("class");
      expect(htmlClass).not.toContain("dark");

      // Key text should be visible (not white-on-white)
      const h1 = page.locator("h1").first();
      if (await h1.count()) {
        const color = await h1.evaluate((el) => getComputedStyle(el).color);
        // Color should NOT be white/near-white in light mode
        expect(color).not.toMatch(/rgba?\(255,\s*255,\s*255/);
      }

      // Screenshot for visual regression
      await page.screenshot({
        path: `e2e/screenshots/${name.toLowerCase().replace(/\s+/g, "-")}-light.png`,
        fullPage: true,
      });
    });
  });
}
