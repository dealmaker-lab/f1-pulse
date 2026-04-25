import { test, expect } from './fixtures';

/**
 * Verifies a protected route in the (dashboard) route group loads with a real
 * Clerk session — no redirect to /sign-in, no rewrite to /_not-found.
 *
 * Runs under the `authenticated` project, which depends on `setup` and
 * inherits storageState from playwright/.clerk/user.json.
 */
test.describe('dashboard auth', () => {
  test('dashboard loads without redirecting to sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    const url = page.url();
    expect(url).not.toContain('/sign-in');
    expect(url).not.toContain('/_not-found');
    // Body must render (not blank) — proves Next rendered the protected route.
    const body = await page.locator('body').textContent({ timeout: 10_000 });
    expect(body).toBeTruthy();
  });
});
