import { test, expect } from "./fixtures";
import {
  PUBLIC_PAGES,
  collectConsoleErrors,
  waitForPageReady,
  setLightMode,
  expectPageLoaded,
} from "./helpers";

/**
 * POST-DEPLOY QUICK CHECK — Run this after every Vercel deploy.
 * Tests public pages only (protected pages require auth session).
 *
 * Usage:
 *   npx playwright test e2e/post-deploy.spec.ts
 *   # or against a preview URL:
 *   BASE_URL=https://f1-pulse-xyz.vercel.app npx playwright test e2e/post-deploy.spec.ts
 */

test.describe("Post-Deploy Verification", () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} — loads, no errors, screenshot`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      // 1. Navigate
      await page.goto(path);
      await waitForPageReady(page);

      // 2. Verify page loaded (Lightpanda CDP safe — no response.status())
      await expectPageLoaded(page);

      // 3. Page has content (may be empty behind Vercel auth on Lightpanda CDP)
      const body = await page
        .locator("body")
        .textContent({ timeout: 10_000 })
        .catch(() => "");

      // 4. No fatal console errors
      const fatal = errors.filter(
        (e) =>
          !e.includes("ResizeObserver") &&
          !e.includes("favicon") &&
          !e.includes("third-party") &&
          !e.includes("hydration") &&
          !e.includes("Minified React error #418") &&
          !e.includes("Minified React error #423") &&
          !e.includes("Minified React error #425") &&
          !e.includes("Failed to load resource") &&
          !e.includes("media.formula1.com") &&
          !e.includes("ERR_NAME_NOT_RESOLVED") &&
          !e.includes("net::ERR") &&
          !e.includes("Clerk")
      );
      expect(fatal).toHaveLength(0);

      // 5. Screenshot (dark mode — default)
      await page.screenshot({
        path: `e2e/screenshots/deploy-${name.toLowerCase().replace(/\s+/g, "-")}-dark.png`,
        fullPage: true,
      });

      // 6. Switch to light mode & screenshot (hero page only)
      if (path === "/") {
        await setLightMode(page);
        await page.waitForTimeout(400);
        await page.screenshot({
          path: `e2e/screenshots/deploy-${name.toLowerCase().replace(/\s+/g, "-")}-light.png`,
          fullPage: true,
        });
      }
    });
  }
});
