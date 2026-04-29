import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * /race tests — pit window predictor.
 *
 * The /race page is the live race replay. Outside an active session it
 * shows a "locked" / "no live session" state. The pit window predictor
 * lives below the telemetry section and only renders when a session is
 * live (or replay is unlocked).
 *
 * Tests verify either:
 *   - the lock state renders (no live session)
 *   - the pit window panel renders when live data is present
 * Without crashing or throwing JS errors.
 */

test.describe("/race — Pit Window Predictor", () => {
  test("/race loads without errors (locked or unlocked)", async ({ page }) => {
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
    expect(fatal, `Console errors on /race: ${fatal.join("\n")}`).toHaveLength(0);
  });

  test("renders either locked state or pit window panel", async ({ page }) => {
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

    // Acceptable lock-state copies (race page shows different copies based on
    // whether there's a live session, replay availability, etc).
    const looksLocked =
      /no live session|locked|unlock|live session not active|next race in|replay/i.test(
        body,
      );

    // Acceptable unlocked-state markers — pit window UI surfaces "pit
    // window" copy alongside undercut/overcut decisions.
    const hasPitWindow =
      /pit window|undercut|overcut|stop window/i.test(body);

    // Either branch is acceptable. Failing this means the page rendered but
    // showed neither — an unexpected state worth surfacing.
    expect(
      looksLocked || hasPitWindow,
      `/race should render lock state or pit window. body[0..300]=${body.slice(0, 300)}`,
    ).toBeTruthy();
  });

  test("pit window panel does not throw when telemetry section renders", async ({
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
      test.skip(true, "Empty body — likely behind Vercel auth on CDP");
      return;
    }

    // Give async widgets time to mount + fetch.
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
      `Pit window predictor should not throw: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });
});
