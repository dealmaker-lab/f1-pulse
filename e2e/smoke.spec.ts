import { test, expect } from "./fixtures";
import {
  PAGES,
  PUBLIC_PAGES,
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * Smoke tests — fast pass over public pages.
 * Protected pages redirect to sign-in (tested in navigation.spec.ts).
 */

for (const { path, name } of PUBLIC_PAGES) {
  test(`${name} (${path}) — loads without errors`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(path);
    await waitForPageReady(page);

    // Verify page loaded (Lightpanda CDP safe)
    await expectPageLoaded(page);

    // Page should have some heading or content
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(20);

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
        !e.includes("Clerk")
    );
    expect(
      fatal,
      `Console errors on ${name}: ${fatal.join("\n")}`
    ).toHaveLength(0);
  });
}

// Protected pages should redirect (not crash)
for (const { path, name } of PAGES) {
  test(`${name} (${path}) — redirects to sign-in when unauthenticated`, async ({
    page,
  }) => {
    await page.goto(path);
    await waitForPageReady(page);

    // Should not show application errors
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();

    // Should redirect to sign-in or show Clerk UI
    const url = page.url();
    const hasAuth = url.includes("sign-in") || body?.includes("Sign in");
    expect(hasAuth, `${name} should require auth`).toBe(true);
  });
}
