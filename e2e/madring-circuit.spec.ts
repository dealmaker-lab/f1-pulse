import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * /dashboard — Madring circuit SVG asset tests.
 *
 * The hero CircuitMap on the dashboard resolves a static SVG asset for the
 * next-race circuit via `getCircuitSvg(circuit_short_name)`. For Madring
 * (the new 2026 Madrid circuit) the assets are:
 *   - /circuits/madring-white.svg
 *   - /circuits/madring-white-outline.svg
 *
 * The map is rendered with `<img>` (not Next/Image), so the SVG shows up
 * directly in the network panel and in the rendered DOM as an <img src=…>.
 *
 * Tests:
 *  - dashboard loads
 *  - if the next race is Madring, the SVG appears in the DOM and/or a
 *    network request for the asset is observed
 *  - otherwise, skip gracefully (we don't fail when Madrid isn't next)
 */

const MADRING_HINTS = /madring|madrid|ifema/i;

test.describe("/dashboard — Madring circuit SVG", () => {
  test("dashboard loads without errors", async ({ page }) => {
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
    expect(
      fatal,
      `Console errors on /dashboard: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });

  test("when next race is Madring, the Madring SVG is rendered or requested", async ({
    page,
  }) => {
    // Capture every network request for a circuit asset BEFORE navigation
    // so we don't miss the SVG fetch.
    const requestedUrls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/\/circuits\//i.test(url)) {
        requestedUrls.push(url);
      }
    });

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

    // Let the CircuitMap mount + the <img> elements settle.
    await page.waitForTimeout(2000);

    // Detect whether Madrid is the upcoming race. The dashboard prints
    // the circuit's display name + country in the "Next Race" surface.
    const isMadrid = MADRING_HINTS.test(body);
    if (!isMadrid) {
      test.skip(
        true,
        "Next race is not Madring — Madring-specific assertion skipped",
      );
      return;
    }

    // The CircuitMap renders `<img src="/circuits/madring-white.svg" …>`
    // (and a sibling for the outline). Either an <img> in the DOM or a
    // captured network request is sufficient.
    const inDom = await page
      .locator('img[src*="madring"]')
      .count()
      .catch(() => 0);
    const inNetwork = requestedUrls.some((u) => /madring/i.test(u));

    expect(
      inDom > 0 || inNetwork,
      `Expected the Madring SVG in DOM or network. dom=${inDom} requestedCircuitUrls=${requestedUrls.join(",")}`,
    ).toBeTruthy();
  });

  test("CircuitMap does not throw when resolving the next-race SVG", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/dashboard");
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

    await page.waitForTimeout(2000);

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
      `CircuitMap should not throw on dashboard: ${fatal.join("\n")}`,
    ).toHaveLength(0);
  });
});
