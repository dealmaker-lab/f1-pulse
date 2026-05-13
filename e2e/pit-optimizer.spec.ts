import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * /race-analysis — Pit Optimizer tab tests.
 *
 * The "Pit Optimizer" tab is the 8th in the analysis strip (Wrench icon).
 * Without a selected race the tab content shows the "Select a year and
 * race to begin" empty state. With a race, it renders the optimizer
 * overlay (Race/Sprint sessions only).
 *
 * Tests cover:
 *  - the page loads cleanly
 *  - the tab is present in the strip
 *  - clicking it with no race shows the empty state
 *  - mobile tab strip scrolls horizontally to reveal the new tab
 */

const PIT_OPTIMIZER_LABEL = "Pit Optimizer";

test.describe("/race-analysis — Pit Optimizer tab", () => {
  test("page loads without crashing", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/race-analysis");
    await waitForPageReady(page);
    await expectPageLoaded(page);

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
    expect(fatal, `Console errors: ${fatal.join("\n")}`).toHaveLength(0);
  });

  test('"Pit Optimizer" tab is present in the analysis tab strip', async ({
    page,
  }) => {
    await page.goto("/race-analysis");
    await waitForPageReady(page);

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body — likely behind Vercel auth on CDP");
      return;
    }

    // Tab labels are rendered as <span> children inside <button>s.
    const tab = page
      .locator("button")
      .filter({ hasText: new RegExp(PIT_OPTIMIZER_LABEL, "i") })
      .first();
    const exists = (await tab.count()) > 0;
    expect(
      exists,
      `Expected a "${PIT_OPTIMIZER_LABEL}" tab in the strip`,
    ).toBeTruthy();
  });

  test("clicking Pit Optimizer without a race shows the empty state", async ({
    page,
  }) => {
    await page.goto("/race-analysis");
    await waitForPageReady(page);

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body");
      return;
    }

    // Clear any auto-selected race so the empty state is forced.
    const raceSelect = page.locator('select[aria-label="Select race"]');
    if (await raceSelect.count()) {
      await raceSelect.selectOption("").catch(() => {});
      await page.waitForTimeout(200);
    }

    const tab = page
      .locator("button")
      .filter({ hasText: new RegExp(PIT_OPTIMIZER_LABEL, "i") })
      .first();
    if (!(await tab.isVisible().catch(() => false))) {
      test.skip(true, "Pit Optimizer tab not visible on this viewport");
      return;
    }
    await tab.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(400);

    // The InsufficientCard copy is "Select a year and race to begin".
    // With a session auto-selected we may instead see a session-specific
    // empty state — accept any of the known empty-state copies.
    const bodyAfter = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    const looksEmpty =
      /select a year and race to begin|pit optimizer (only runs on|unavailable)|no data for this session|race hasn't started yet/i.test(
        bodyAfter || "",
      );
    expect(
      looksEmpty,
      `Expected an empty-state copy on Pit Optimizer tab. body[0..400]=${(bodyAfter || "").slice(0, 400)}`,
    ).toBeTruthy();
  });

  test("clicking Pit Optimizer does not throw a JS error", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/race-analysis");
    await waitForPageReady(page);

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body");
      return;
    }

    const tab = page
      .locator("button")
      .filter({ hasText: new RegExp(PIT_OPTIMIZER_LABEL, "i") })
      .first();
    if (!(await tab.isVisible().catch(() => false))) {
      test.skip(true, "Tab not visible");
      return;
    }
    await tab.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(800);

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
    expect(
      fatal,
      `Pit Optimizer tab click should not throw: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });

  test("mobile — tab strip scrolls horizontally to reveal the new tab", async ({
    page,
  }) => {
    const vp = page.viewportSize();
    if (!vp || vp.width > 500) {
      test.skip(true, "Mobile-only assertion");
      return;
    }

    await page.goto("/race-analysis");
    await waitForPageReady(page);

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body");
      return;
    }

    // The container has overflow-x-auto. Verify it exists and that its
    // scrollWidth > clientWidth (i.e. content overflows, scroll is needed).
    const strip = page
      .locator('[class*="overflow-x-auto"]')
      .filter({ hasText: PIT_OPTIMIZER_LABEL })
      .first();
    const stripExists = (await strip.count()) > 0;
    expect(
      stripExists,
      "Expected a scrollable strip containing the Pit Optimizer tab on mobile",
    ).toBeTruthy();

    if (stripExists) {
      const dims = await strip.evaluate((el) => ({
        scroll: (el as HTMLElement).scrollWidth,
        client: (el as HTMLElement).clientWidth,
      }));
      // On a 390px mobile viewport, 8 tabs definitely overflow — assert it.
      expect(
        dims.scroll,
        `Strip should overflow horizontally on mobile (scroll=${dims.scroll}, client=${dims.client})`,
      ).toBeGreaterThan(dims.client);
    }
  });
});
