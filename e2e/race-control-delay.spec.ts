import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
} from "./helpers";

/**
 * /race — Race Control broadcast-delay slider tests.
 *
 * The slider lets users dial in a 0–120s delay so the race-control feed
 * lines up with their TV broadcast (which lags live timing). Default: 0.
 * Persists to localStorage under `f1-pulse:rc-delay-sec`.
 *
 * The feed (and the slider) only mount when a session_key is selected.
 * Without one we accept that the slider may not appear — that's the
 * intended empty state.
 *
 * Tests:
 *  - default value is 0
 *  - min/max/step attributes match the documented bounds
 *  - moving the slider writes to localStorage
 *  - mobile: slider stays clickable + has ≥44px touch surface
 */

const DELAY_STORAGE_KEY = "f1-pulse:rc-delay-sec";

async function getDelaySlider(page: import("@playwright/test").Page) {
  // The slider's aria-label is "Broadcast delay in seconds, currently …".
  return page.locator('input[type="range"][aria-label*="Broadcast delay" i]').first();
}

test.describe("/race — Race Control delay slider", () => {
  test("slider renders with default value 0 when present", async ({ page }) => {
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

    // Wait for the dynamically-imported RaceControlFeed (ssr: false) to mount.
    await page.waitForTimeout(2000);

    const slider = await getDelaySlider(page);
    if (!(await slider.count())) {
      test.skip(
        true,
        "Slider not mounted — no session selected / race-control feed inactive",
      );
      return;
    }

    const value = await slider.inputValue();
    expect(
      Number(value),
      `Default slider value should be 0, got ${value}`,
    ).toBe(0);
  });

  test("slider has min=0, max=120, step=5", async ({ page }) => {
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
    await page.waitForTimeout(2000);

    const slider = await getDelaySlider(page);
    if (!(await slider.count())) {
      test.skip(true, "Slider not mounted");
      return;
    }

    const [min, max, step] = await Promise.all([
      slider.getAttribute("min"),
      slider.getAttribute("max"),
      slider.getAttribute("step"),
    ]);
    expect(min, "min").toBe("0");
    expect(max, "max").toBe("120");
    expect(step, "step").toBe("5");
  });

  test("moving the slider persists the value to localStorage", async ({
    page,
  }) => {
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
    await page.waitForTimeout(2000);

    const slider = await getDelaySlider(page);
    if (!(await slider.count())) {
      test.skip(true, "Slider not mounted");
      return;
    }

    // Set the value via the DOM. Native `slider.fill()` doesn't work for
    // <input type="range"> across all CDP impls, so dispatch the change
    // events ourselves to trigger React's onChange.
    await slider.evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "30");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(300);

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      DELAY_STORAGE_KEY,
    );
    expect(
      stored,
      `Expected localStorage["${DELAY_STORAGE_KEY}"] to be set after moving the slider`,
    ).not.toBeNull();
    // Component clamps inside the documented bounds; 30 sits cleanly inside.
    expect(Number(stored)).toBe(30);
  });

  test("slider click does not throw a JS error", async ({ page }) => {
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
    await page.waitForTimeout(2000);

    const slider = await getDelaySlider(page);
    if (!(await slider.count())) {
      test.skip(true, "Slider not mounted");
      return;
    }

    await slider.click({ force: true, timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(200);

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
    expect(fatal, `Slider click threw: ${fatal.join("\n")}`).toHaveLength(0);
  });

  test("mobile — slider touch surface is at least 44px tall", async ({
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
    await page.waitForTimeout(2000);

    const slider = await getDelaySlider(page);
    if (!(await slider.count())) {
      test.skip(true, "Slider not mounted on mobile");
      return;
    }

    // The slider's wrapper has `min-h-[44px] sm:min-h-0`; the input itself
    // is `h-11 sm:h-2` (h-11 = 2.75rem = 44px on mobile). Both surfaces
    // count as the tap target; assert the larger of the two.
    const box = await slider.boundingBox();
    expect(box, "slider should have a bounding box").not.toBeNull();
    if (!box) return;

    // Allow a 1px tolerance for sub-pixel rounding.
    expect(
      box.height,
      `Slider tap surface should be ≥44px on mobile (got ${box.height})`,
    ).toBeGreaterThanOrEqual(43);
  });
});
