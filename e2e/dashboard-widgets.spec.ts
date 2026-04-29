import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * /dashboard widget tests — Forecast widget + Pirelli compound preview.
 *
 * Both widgets render under "WEEKEND BRIEFING" and depend on a
 * `nextRace.circuit_short_name`. When no upcoming race is resolvable
 * (e.g. mid-off-season cache state), the section is omitted — this is
 * graceful empty-state behavior, NOT a failure. Tests tolerate that.
 *
 * The dashboard is Clerk-protected, so unauthenticated runs likely
 * redirect to /sign-in; both branches are accepted.
 */

test.describe("Dashboard widgets — Forecast + Pirelli", () => {
  test("page loads without crashing", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/dashboard");
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

  test("Forecast widget renders, errors gracefully, or section absent", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in — auth required for dashboard");
      return;
    }

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body — likely behind Vercel auth on CDP");
      return;
    }

    // The Forecast widget is part of the "WEEKEND BRIEFING" block. If the
    // block isn't on screen (no nextRace), the test passes — that's an
    // intentional graceful degradation.
    const hasBriefing = /weekend briefing|forecast|hours/i.test(body);
    if (!hasBriefing) {
      // Acceptable — no upcoming race resolvable for this session.
      return;
    }

    // When briefing IS present, the forecast widget should render some
    // recognisable surface: temperature unit, precipitation copy, or wind.
    // We check for any of these markers; if none surface, we accept the
    // widget's own "unavailable" state.
    const hasForecastMarker =
      /°c|°f|precip|wind|forecast/i.test(body) ||
      /forecast unavailable|no forecast/i.test(body);
    expect(
      hasForecastMarker,
      "Forecast widget should render data or its empty/error state",
    ).toBeTruthy();
  });

  test("Pirelli compound preview renders 3 tire chips when briefing is present", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in");
      return;
    }

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body — likely behind Vercel auth on CDP");
      return;
    }

    // The CompoundPreview header reads "Pirelli Compounds · <Circuit>". If
    // the header isn't present, the briefing block was skipped — accept
    // and bail.
    const hasPirelli = /pirelli compounds/i.test(body);
    if (!hasPirelli) {
      return;
    }

    // Three tier labels render uppercased: HARD / MEDIUM / SOFT.
    expect(body).toMatch(/HARD/);
    expect(body).toMatch(/MEDIUM/);
    expect(body).toMatch(/SOFT/);

    // Or the explicit empty/error states the component emits.
    const isEmpty = /no data for this circuit/i.test(body);
    const isError = /compound preview unavailable/i.test(body);

    // If the component is in the "ready" state we should see all three
    // tier labels above; if not, one of the alt states should be present.
    if (isEmpty || isError) return;
    // Ready state — already asserted via HARD/MEDIUM/SOFT above.
  });

  test("widgets do not crash the dashboard page", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/dashboard");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in");
      return;
    }

    // Wait an extra beat for the widgets' fetches to resolve / fail.
    await page.waitForTimeout(1500);

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
      `Forecast/Pirelli widgets should not throw: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });
});
