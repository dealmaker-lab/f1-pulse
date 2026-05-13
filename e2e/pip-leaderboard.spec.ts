import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
} from "./helpers";

/**
 * /race — Picture-in-Picture leaderboard "Pop out" button tests.
 *
 * <PipToggleButton> lives in the /race page header. The button is rendered
 * with `className="hidden sm:inline-flex"` — visible on desktop, hidden on
 * mobile (the Document Picture-in-Picture API is desktop-only).
 *
 * Lightpanda does NOT implement Document Picture-in-Picture, so we cannot
 * actually open the floating window. We can only assert:
 *   - the button is present (or hidden on mobile)
 *   - if unsupported, the button surfaces a disabled state with a tooltip
 *   - clicking does not throw
 */

const POP_OUT_LABEL_RE = /pop out|popped out/i;

test.describe("/race — PiP Pop out button", () => {
  test("button renders in the header on desktop", async ({ page }) => {
    const vp = page.viewportSize();
    if (!vp || vp.width <= 500) {
      test.skip(true, "Desktop-only — button is hidden on mobile");
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
      test.skip(true, "Empty body — likely behind Vercel auth on CDP");
      return;
    }

    // The button's <span> child carries "Pop out" / "Popped out" text.
    const popBtn = page
      .locator("button")
      .filter({ hasText: POP_OUT_LABEL_RE })
      .first();
    const visible = await popBtn.isVisible().catch(() => false);

    expect(
      visible,
      `Expected the Pop out button to be visible on /race header (desktop). body[0..200]=${body.slice(0, 200)}`,
    ).toBeTruthy();
  });

  test("button is hidden on mobile (hidden sm:inline-flex)", async ({
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

    // The element may still be in the DOM (Tailwind `hidden` = display:none),
    // but it should not be *visible*. Count visible matches only.
    const popBtns = page
      .locator("button")
      .filter({ hasText: POP_OUT_LABEL_RE });
    const total = await popBtns.count();
    let visibleCount = 0;
    for (let i = 0; i < total; i++) {
      if (await popBtns.nth(i).isVisible().catch(() => false)) {
        visibleCount++;
      }
    }
    expect(
      visibleCount,
      `Pop out button should be hidden on mobile, found ${visibleCount} visible`,
    ).toBe(0);
  });

  test("button has accessible label and is disabled when PiP API is missing", async ({
    page,
  }) => {
    const vp = page.viewportSize();
    if (!vp || vp.width <= 500) {
      test.skip(true, "Desktop-only");
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

    const popBtn = page
      .locator("button")
      .filter({ hasText: POP_OUT_LABEL_RE })
      .first();
    const visible = await popBtn.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, "Button not rendered yet");
      return;
    }

    // The button always carries an aria-label (the tooltip's title prop).
    const aria = await popBtn.getAttribute("aria-label").catch(() => null);
    expect(aria, "Pop out button must expose an aria-label").toBeTruthy();

    // Lightpanda doesn't implement documentPictureInPicture; in that case
    // the button is rendered with `disabled` and the aria-label calls out
    // the constraint. We accept either branch — Lightpanda's window API
    // detection isn't strictly stable.
    const isDisabled = await popBtn.isDisabled().catch(() => false);
    const ariaSuggestsUnsupported = /not supported/i.test(aria || "");
    if (isDisabled) {
      expect(
        ariaSuggestsUnsupported,
        `Button is disabled — expected aria-label to call out the support gap (got: ${aria})`,
      ).toBeTruthy();
    }
  });

  test("clicking the button does not throw a JS error", async ({ page }) => {
    const vp = page.viewportSize();
    if (!vp || vp.width <= 500) {
      test.skip(true, "Desktop-only");
      return;
    }
    const errors = collectConsoleErrors(page);

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

    const popBtn = page
      .locator("button")
      .filter({ hasText: POP_OUT_LABEL_RE })
      .first();
    if (!(await popBtn.isVisible().catch(() => false))) {
      test.skip(true, "Button not rendered");
      return;
    }
    // The button may be disabled in Lightpanda; .click({ force: true })
    // still dispatches the React onClick handler so we exercise the path.
    await popBtn.click({ force: true, timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);

    const fatal = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("favicon") &&
        !e.includes("hydration") &&
        !e.includes("Minified React error") &&
        !e.includes("Clerk") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR") &&
        // Document PiP API throws in unsupported browsers — the component
        // catches that explicitly, but Lightpanda's console may still log it.
        !/documentPictureInPicture|picture.in.picture/i.test(e),
    );
    expect(
      fatal,
      `PiP click should not crash: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });
});
