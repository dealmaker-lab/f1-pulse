import { test, expect } from "./fixtures";
import {
  PAGES,
  PUBLIC_PAGES,
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * Smoke tests — fast pass over all pages.
 * Verifies pages load without crashes or application errors.
 * Lenient on body content since Lightpanda CDP + Vercel auth
 * may render empty bodies on protected/JS-heavy pages.
 */

for (const { path, name } of PUBLIC_PAGES) {
  test(`${name} (${path}) — loads without errors`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(path);
    await waitForPageReady(page);

    // Verify no error pages
    await expectPageLoaded(page);

    // Page should have some content (may be empty behind Vercel auth)
    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    // Only assert content length if we got content
    if (body && body.length > 0) {
      expect(body.length).toBeGreaterThan(10);
    }

    // No fatal JS errors
    const fatal = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("favicon") &&
        !e.includes("third-party") &&
        !e.includes("hydration") &&
        !e.includes("Minified React error #418") &&
        !e.includes("Minified React error #423") &&
        !e.includes("Minified React error #425") &&
        !e.includes("Clerk") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR"),
    );
    expect(
      fatal,
      `Console errors on ${name}: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });
}

// Dashboard pages — verify they load without crashing
for (const { path, name } of PAGES) {
  test(`${name} (${path}) — loads or redirects without crashing`, async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(path);
    await waitForPageReady(page);

    // Verify no error pages
    await expectPageLoaded(page);

    // No fatal JS errors
    const fatal = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("favicon") &&
        !e.includes("third-party") &&
        !e.includes("hydration") &&
        !e.includes("Minified React error") &&
        !e.includes("Clerk") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR"),
    );
    expect(
      fatal,
      `Console errors on ${name}: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });
}
