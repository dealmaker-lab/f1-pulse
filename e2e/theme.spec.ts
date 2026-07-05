import { test, expect } from "./fixtures";
import { PUBLIC_PAGES, waitForPageReady, setLightMode, setDarkMode } from "./helpers";

/**
 * Theme tests — verify light/dark mode renders correctly on public pages.
 * Protected pages require auth and are tested separately.
 *
 * Resilience: toggling the theme via page.evaluate() can trigger a Lightpanda
 * CDP drop, so the *toggle* is wrapped and skips on drop. The actual
 * assertions are NOT swallowed — a wrong theme color must fail the test.
 * (Previously every expect() was inside a catch → console.warn, so the tests
 * could not fail.)
 */

// Only test theme on public pages (hero) — protected pages redirect to sign-in
const THEME_PAGES = PUBLIC_PAGES.filter((p) => p.path === "/");

for (const { path, name } of THEME_PAGES) {
  test.describe(`${name} — theme`, () => {
    test("dark mode renders correctly", async ({ page }) => {
      await page.goto(path);
      await waitForPageReady(page);

      try {
        await setDarkMode(page);
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        test.skip(true, "CDP dropped while toggling theme");
        return;
      }

      // Assertion propagates — dark theme must define a dark --f1-black.
      const bgColor = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--f1-black").trim(),
      );
      expect(bgColor.toLowerCase()).toBe("#15151e");

      await page
        .screenshot({
          path: `e2e/screenshots/${name.toLowerCase().replace(/\s+/g, "-")}-dark.png`,
          fullPage: true,
        })
        .catch(() => {
          /* screenshot is best-effort */
        });
    });

    test("light mode renders correctly", async ({ page }) => {
      await page.goto(path);
      await waitForPageReady(page);

      try {
        await setLightMode(page);
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        test.skip(true, "CDP dropped while toggling theme");
        return;
      }

      // html must not carry the `dark` class in light mode.
      const htmlClass = (await page.locator("html").getAttribute("class")) ?? "";
      expect(htmlClass).not.toContain("dark");

      // Headings must not render white-on-white in light mode.
      const heading = page.locator("h1, h2, h3").first();
      if (await heading.count()) {
        const color = await heading.evaluate((el) => getComputedStyle(el).color);
        expect(color).not.toMatch(/rgba?\(255,\s*255,\s*255/);
      }

      await page
        .screenshot({
          path: `e2e/screenshots/${name.toLowerCase().replace(/\s+/g, "-")}-light.png`,
          fullPage: true,
        })
        .catch(() => {
          /* screenshot is best-effort */
        });
    });
  });
}
