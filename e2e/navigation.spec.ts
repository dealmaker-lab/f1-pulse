import { test, expect } from "./fixtures";
import { PAGES, waitForPageReady } from "./helpers";

/**
 * Navigation tests — verify sidebar links work and page transitions are smooth.
 */

test("sidebar navigation visits all pages", async ({ page }) => {
  await page.goto("/");
  await waitForPageReady(page);

  for (const { path, name } of PAGES) {
    // Find sidebar link by href
    const link = page.locator(`a[href="${path}"]`).first();
    if (await link.count()) {
      await link.click();
      await page.waitForURL(`**${path}`, { timeout: 10_000 });
      await waitForPageReady(page);

      // Verify we're on the right page
      expect(page.url()).toContain(path === "/" ? "" : path);

      // Page should have content (not blank)
      const body = page.locator("body");
      const text = await body.textContent();
      expect(text?.length).toBeGreaterThan(50);
    }
  }
});

test("direct URL navigation works for all pages", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    await waitForPageReady(page);
    // Verify page loaded (Lightpanda CDP safe — check content instead of status code)
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(50);
  }
});
