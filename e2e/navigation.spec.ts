import { test, expect } from "./fixtures";
import { PAGES, PUBLIC_PAGES, waitForPageReady } from "./helpers";

/**
 * Navigation tests — verify public pages load and protected pages redirect to sign-in.
 */

test("hero page loads without auth", async ({ page }) => {
  await page.goto("/");
  await waitForPageReady(page);

  const body = await page.locator("body").textContent();
  expect(body?.length).toBeGreaterThan(50);
  // Hero page should show the product name
  expect(body).toContain("Pulse");
});

test("sign-in page loads", async ({ page }) => {
  await page.goto("/sign-in");
  await waitForPageReady(page);

  const body = await page.locator("body").textContent();
  expect(body?.length).toBeGreaterThan(20);
});

test("protected pages redirect to sign-in when unauthenticated", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    await waitForPageReady(page);
    // Should redirect to sign-in or show sign-in content
    const url = page.url();
    const body = await page.locator("body").textContent();
    const isRedirected = url.includes("sign-in") || body?.includes("Sign in");
    expect(isRedirected, `${name} (${path}) should require auth`).toBe(true);
  }
});
