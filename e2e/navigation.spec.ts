import { test, expect } from "./fixtures";
import { PAGES, PUBLIC_PAGES, waitForPageReady } from "./helpers";

/**
 * Navigation tests — verify pages load and navigation works.
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

test("all dashboard pages load without crashing", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    await waitForPageReady(page);
    const body = await page.locator("body").textContent();
    expect(body?.length, `${name} should have content`).toBeGreaterThan(10);
  }
});
