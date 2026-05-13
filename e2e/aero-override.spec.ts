import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * /race — 2026 Active Aero + Override badge tests.
 *
 * The <AeroOverrideBadge> renders inside the race replay header and the
 * per-driver leaderboard rows. It only paints when the underlying telemetry
 * sample carries `aero_mode`, `override_active`, or `override_budget_remaining`.
 *
 * Outside of an active 2026+ session those fields are null and the badge
 * renders nothing — that's by design (the parent decides the placeholder).
 *
 * We accept either branch:
 *   - badge present (a session with the new schema is loaded)
 *   - badge absent (lock state / 2023-2025 session / no live data)
 *
 * The hard requirements are:
 *   - the page itself doesn't blow up
 *   - the badge, when it does render, doesn't horizontally overflow on mobile
 */

const NEW_BADGE_LABELS = ["X-MODE", "Z-MODE", "OVR"];
const COMPACT_BADGE_LABELS = ["X", "Z", "O"];

test.describe("/race — Aero Override Badge", () => {
  test("/race loads without errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/race");
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
    expect(fatal, `Console errors on /race: ${fatal.join("\n")}`).toHaveLength(
      0,
    );
  });

  test("renders the aero/override badge when a session is selected, OR an empty state", async ({
    page,
  }) => {
    await page.goto("/race");
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

    // Give telemetry time to mount + fetch the first frame.
    await page.waitForTimeout(1500);

    // Look for any label the badge can render. If none appear, accept the
    // page's empty/lock state (no live or replay data).
    let badgeFound = 0;
    for (const label of NEW_BADGE_LABELS) {
      badgeFound += await page
        .locator(`text=${label}`)
        .count()
        .catch(() => 0);
    }

    // Compact mode (single letter) may also render inside dense leaderboard
    // cells — title attributes carry the long-form description, so look for
    // those tooltips too.
    const compactWithTitle = await page
      .locator(
        '[title^="X-mode"], [title^="Z-mode"], [title^="Override active"]',
      )
      .count()
      .catch(() => 0);

    const looksEmpty =
      /no live session|locked|unlock|live session not active|next race in|select a session to replay/i.test(
        body,
      );

    // Either the badge is rendered (live/replay data present) OR the page is
    // showing a recognisable empty/lock state. Anything else is a regression.
    expect(
      badgeFound + compactWithTitle > 0 || looksEmpty,
      `Expected badge OR empty state. badge=${badgeFound + compactWithTitle} body[0..200]=${body.slice(0, 200)}`,
    ).toBeTruthy();
  });

  test("aero badge does not throw or break layout when telemetry mounts", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/race");
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
      test.skip(true, "Empty body");
      return;
    }

    // Let telemetry widgets mount + paint.
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
      `Aero badge mount should not throw: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });

  test("mobile — compact badge does not horizontally overflow", async ({
    page,
  }) => {
    const vp = page.viewportSize();
    if (!vp || vp.width > 500) {
      test.skip(true, "Mobile-only assertion");
      return;
    }

    await page.goto("/race");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Sign-in redirect");
      return;
    }
    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || body.length < 50) {
      test.skip(true, "Empty body");
      return;
    }

    await page.waitForTimeout(1500);

    // If any badge label is present, ensure it didn't push the document
    // wider than the mobile viewport (tolerance for scrollbar rounding).
    let anyBadge = 0;
    for (const label of [...NEW_BADGE_LABELS, ...COMPACT_BADGE_LABELS]) {
      anyBadge += await page
        .locator(`text=${label}`)
        .count()
        .catch(() => 0);
    }
    if (anyBadge === 0) {
      test.skip(true, "No badge rendered — overflow check moot");
      return;
    }

    const dims = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(
      dims.scroll - dims.client,
      `Horizontal overflow with badge present: scroll=${dims.scroll} client=${dims.client}`,
    ).toBeLessThanOrEqual(8);
  });
});
