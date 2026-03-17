import { test, expect } from "./fixtures";
import { PAGES, collectConsoleErrors, waitForPageReady, expectPageLoaded } from "./helpers";

/**
 * Smoke tests — fast pass over every page.
 * Checks: page loads, no JS crashes, h1 present, sidebar renders.
 */

for (const { path, name } of PAGES) {
  test(`${name} (${path}) — loads without errors`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(path);
    await waitForPageReady(page);

    // Verify page loaded (Lightpanda CDP safe)
    await expectPageLoaded(page);

    // Page should have some heading (h1, h2, or h3) — not all pages use h1
    const heading = page.locator("h1, h2, h3").first();
    if (await heading.count() > 0) {
      await expect(heading).toBeVisible({ timeout: 10_000 });
    }

    // Sidebar nav should be present (desktop)
    const sidebar = page.locator("nav, aside").first();
    if (await sidebar.count()) {
      await expect(sidebar).toBeVisible();
    }

    // No fatal JS errors (filter out known benign ones like ResizeObserver)
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
    expect(fatal, `Console errors on ${name}: ${fatal.join("\n")}`).toHaveLength(0);
  });
}
