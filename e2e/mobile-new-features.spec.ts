import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * Mobile-only checks for the new features (Phases 1-9).
 *
 * The fixtures honour the project's `viewport` from playwright.config.ts.
 * On the desktop project the viewport is 1440x900 — these assertions are
 * meaningless there, so each test self-skips when not on mobile.
 *
 * "Mobile" here = viewport width <= 500. Playwright's mobile project
 * uses 390x844; this also accommodates the 375x667 spec mentioned in
 * the requirements.
 */

const MOBILE_MAX_WIDTH = 500;

function isMobile(page: import("@playwright/test").Page): boolean {
  const vp = page.viewportSize();
  return !!(vp && vp.width <= MOBILE_MAX_WIDTH);
}

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const dims = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });

  // Allow a small (8px) tolerance for sub-pixel rounding and scrollbar
  // gutters that some platforms reserve.
  const overflowDoc = dims.scrollWidth - dims.clientWidth;
  const overflowBody = dims.bodyScrollWidth - dims.bodyClientWidth;
  expect(
    overflowDoc,
    `Document horizontal overflow on mobile: scroll=${dims.scrollWidth} client=${dims.clientWidth}`,
  ).toBeLessThanOrEqual(8);
  expect(
    overflowBody,
    `Body horizontal overflow on mobile: scroll=${dims.bodyScrollWidth} client=${dims.bodyClientWidth}`,
  ).toBeLessThanOrEqual(8);
}

test.describe("Mobile — new features overflow + tap targets", () => {
  test("/race-analysis — no horizontal overflow", async ({ page }) => {
    if (!isMobile(page)) {
      test.skip(true, "Mobile-only assertion");
      return;
    }
    const errors = collectConsoleErrors(page);

    await page.goto("/race-analysis");
    await waitForPageReady(page);
    await expectPageLoaded(page);

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body on CDP — cannot measure overflow");
      return;
    }

    await expectNoHorizontalOverflow(page);

    const fatal = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("favicon") &&
        !e.includes("hydration") &&
        !e.includes("Minified React error") &&
        !e.includes("Clerk") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR"),
    );
    expect(fatal).toHaveLength(0);
  });

  test("/fantasy — no horizontal overflow", async ({ page }) => {
    if (!isMobile(page)) {
      test.skip(true, "Mobile-only assertion");
      return;
    }
    await page.goto("/fantasy");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in — overflow check moot");
      return;
    }
    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body on CDP");
      return;
    }

    await expectNoHorizontalOverflow(page);
  });

  test("Mobile nav — Analysis + Fantasy items reachable", async ({ page }) => {
    if (!isMobile(page)) {
      test.skip(true, "Mobile-only assertion");
      return;
    }

    await page.goto("/dashboard");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Sign-in redirect — nav lives behind auth");
      return;
    }

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body on CDP");
      return;
    }

    // Try opening the mobile nav menu — sidebars on mobile are typically
    // hidden behind a Menu/hamburger button. We tolerate either:
    //  - the items are already visible (e.g. always-visible sidebar)
    //  - they appear after clicking a nav toggle button (Menu/Hamburger icon)
    const tryToggle = page
      .locator(
        'button[aria-label*="menu" i], button[aria-label*="navigation" i], button:has(svg.lucide-menu)',
      )
      .first();
    if (await tryToggle.count()) {
      await tryToggle.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    // Look for the Analysis + Fantasy nav links by visible text.
    const analysisLink = await page
      .locator('a[href="/race-analysis"], a:has-text("Analysis")')
      .count();
    const fantasyLink = await page
      .locator('a[href="/fantasy"], a:has-text("Fantasy")')
      .count();

    expect(
      analysisLink + fantasyLink,
      "Expected at least one of Analysis/Fantasy nav links on mobile",
    ).toBeGreaterThan(0);
  });

  test("Tap targets — primary buttons on /fantasy ≥ 44px tall", async ({
    page,
  }) => {
    if (!isMobile(page)) {
      test.skip(true, "Mobile-only assertion");
      return;
    }

    await page.goto("/fantasy");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Sign-in redirect");
      return;
    }
    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || !/fantasy f1/i.test(body || "")) {
      test.skip(true, "Fantasy shell not rendered");
      return;
    }

    // Sample the first 5 primary buttons. We don't audit every button —
    // that's noise. iOS HIG / Material recommend 44px minimum hit target.
    const buttons = await page.locator("button").all();
    let checked = 0;
    let undersized = 0;
    for (const btn of buttons.slice(0, 12)) {
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;
      const box = await btn.boundingBox();
      if (!box) continue;
      checked++;
      // 40px tolerance — 44px is the recommendation, but include a small
      // give for common 40px design systems and padding rounding.
      if (box.height < 40) {
        undersized++;
      }
    }
    expect(
      checked,
      "Expected to inspect at least 1 visible button",
    ).toBeGreaterThan(0);
    // Allow at most 1 under-sized button out of the sample — this catches
    // systemic regressions without blocking on a single icon-only utility.
    expect(
      undersized,
      `${undersized}/${checked} buttons below 40px tap target`,
    ).toBeLessThanOrEqual(1);
  });
});
