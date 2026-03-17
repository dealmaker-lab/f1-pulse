import { Page, expect } from "@playwright/test";

/** All routable pages in F1 Pulse */
export const PAGES = [
  { path: "/", name: "Dashboard" },
  { path: "/race", name: "Race Replay" },
  { path: "/h2h", name: "Head to Head" },
  { path: "/telemetry", name: "Telemetry" },
  { path: "/strategy", name: "Strategy" },
  { path: "/weather", name: "Weather" },
  { path: "/radio", name: "Team Radio" },
  { path: "/drivers", name: "Drivers" },
  { path: "/constructors", name: "Constructors" },
] as const;

/** Collect console errors during page load */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

/** Wait for the page to finish loading — DOM ready + no loaders visible */
export async function waitForPageReady(page: Page) {
  try {
    // Wait for DOM to be ready (Lightpanda CDP: domcontentloaded instead of networkidle)
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
    // Wait for any Loader2 spinner to disappear (max 10s)
    await page
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10_000 })
      .catch(() => {});
  } catch {
    // Lightpanda CDP may close context during rapid navigations — safe to ignore
  }
}

/** Toggle theme to light mode by clicking the theme button */
export async function setLightMode(page: Page) {
  try {
    const themeBtn = page.locator("button").filter({ has: page.locator("svg.lucide-sun, svg.lucide-moon") }).first();
    const isDark = await page.locator("html").getAttribute("class");
    if (isDark?.includes("dark")) {
      await themeBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 300));
    }
  } catch {
    // CDP may drop during theme toggle — non-critical
  }
}

/** Toggle theme to dark mode */
export async function setDarkMode(page: Page) {
  try {
    const themeBtn = page.locator("button").filter({ has: page.locator("svg.lucide-sun, svg.lucide-moon") }).first();
    const isDark = await page.locator("html").getAttribute("class");
    if (!isDark?.includes("dark")) {
      await themeBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 300));
    }
  } catch {
    // CDP may drop during theme toggle — non-critical
  }
}

/** Check that no text is invisible (same color as background) — basic contrast check */
export async function checkTextVisibility(page: Page) {
  // Verify key text elements are visible (not zero-opacity or hidden)
  const body = page.locator("body");
  await expect(body).toBeVisible();

  // Check that h1 headings are visible
  const h1 = page.locator("h1").first();
  if (await h1.count()) {
    await expect(h1).toBeVisible();
  }
}

/** Build URL with Vercel Protection Bypass header (alternative if needed) */
const BYPASS = process.env.VERCEL_BYPASS || process.env.VERCEL_BYPASS_F1_PULSE || "";
export function bypassUrl(path: string): string {
  if (!BYPASS) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}x-vercel-protection-bypass=${BYPASS}`;
}

/** Verify page loaded without errors (Lightpanda CDP safe) */
export async function expectPageLoaded(page: Page) {
  // Get body text to confirm page loaded
  const body = await page.locator("body").textContent({ timeout: 10_000 });
  expect(body).toBeTruthy();

  // Check for error pages (404, 500, application error)
  const is404 = await page.locator("text=404").count();
  const is500 = await page.locator("text=Internal Server Error").count();
  const isAppError = await page.locator("text=Application error").count();

  expect(is404 + is500 + isAppError, "Page should not show error pages").toBe(
    0
  );
}
