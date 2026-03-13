import { test, expect } from "@playwright/test";
import { PAGES, collectConsoleErrors, waitForPageReady, setLightMode } from "./helpers";

/**
 * POST-DEPLOY QUICK CHECK — Run this after every Vercel deploy.
 * Fast: hits every page in both themes, takes screenshots, flags errors.
 *
 * Usage:
 *   npx playwright test e2e/post-deploy.spec.ts
 *   # or against a preview URL:
 *   BASE_URL=https://f1-pulse-xyz.vercel.app npx playwright test e2e/post-deploy.spec.ts
 */

test.describe("Post-Deploy Verification", () => {
  for (const { path, name } of PAGES) {
    test(`${name} — loads, no errors, screenshot`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      // 1. Navigate
      const response = await page.goto(path);
      expect(response?.status(), `${name} returned ${response?.status()}`).toBeLessThan(400);
      await waitForPageReady(page);

      // 2. Page has content
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible({ timeout: 12_000 });

      // 3. No fatal console errors
      const fatal = errors.filter(
        (e) =>
          !e.includes("ResizeObserver") &&
          !e.includes("favicon") &&
          !e.includes("third-party") &&
          !e.includes("hydration") &&
          !e.includes("Minified React error #418") &&
          !e.includes("Minified React error #423") &&
          !e.includes("Minified React error #425")
      );
      expect(fatal).toHaveLength(0);

      // 4. Screenshot (dark mode — default)
      await page.screenshot({
        path: `e2e/screenshots/deploy-${name.toLowerCase().replace(/\s+/g, "-")}-dark.png`,
        fullPage: true,
      });

      // 5. Switch to light mode & screenshot
      await setLightMode(page);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `e2e/screenshots/deploy-${name.toLowerCase().replace(/\s+/g, "-")}-light.png`,
        fullPage: true,
      });

      // 6. Verify light mode text isn't invisible
      if (await h1.count()) {
        const color = await h1.evaluate((el) => getComputedStyle(el).color);
        expect(color, `h1 color in light mode on ${name}`).not.toMatch(
          /rgba?\(255,\s*255,\s*255/
        );
      }
    });
  }
});
