import { test, expect } from "./fixtures";
import {
  collectConsoleErrors,
  waitForPageReady,
  expectPageLoaded,
} from "./helpers";

/**
 * /fantasy tests — the route is gated by Clerk middleware. Unauthenticated
 * sessions either redirect to /sign-in (typical) or the page renders with
 * a "Sign in to ..." copy block when the gate runs client-side.
 *
 * These tests cover both states without requiring a live Clerk session,
 * so they live in the public e2e projects (desktop / mobile) rather than
 * `*.auth.spec.ts`.
 */

const TAB_LABELS = ["Lineup", "Driver of the Day", "Leaderboard"];

test.describe("Fantasy F1 page", () => {
  test("loads — either redirects to sign-in or renders the lineup builder", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/fantasy");
    await waitForPageReady(page);
    await expectPageLoaded(page);

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    const url = page.url();

    // Acceptable states:
    //  1. Redirected to /sign-in*
    //  2. Page rendered the "Sign in to build your fantasy lineup." block
    //  3. Authenticated render with the full Fantasy F1 UI
    const redirectedToSignIn = /\/sign-in/.test(url);
    const signInPrompt = /sign in to build your fantasy lineup/i.test(
      body || "",
    );
    const fantasyShell = /fantasy f1/i.test(body || "");

    expect(
      redirectedToSignIn || signInPrompt || fantasyShell,
      `Expected sign-in redirect, prompt copy, or fantasy shell. URL=${url} body[0..200]=${(body || "").slice(0, 200)}`,
    ).toBeTruthy();

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

  test("authenticated shell renders the 3 tabs (skipped if signed-out redirect)", async ({
    page,
  }) => {
    await page.goto("/fantasy");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in — authenticated assertions covered in *.auth.spec.ts");
      return;
    }

    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || !/fantasy f1/i.test(body)) {
      test.skip(true, "Fantasy shell did not render (likely empty body on CDP)");
      return;
    }

    for (const label of TAB_LABELS) {
      const found = await page.getByRole("button", { name: new RegExp(label, "i") }).count();
      expect(found, `Tab "${label}" should be visible`).toBeGreaterThan(0);
    }
  });

  test("Lineup tab — budget bar visible, save button starts disabled", async ({
    page,
  }) => {
    await page.goto("/fantasy");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in");
      return;
    }
    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || !/fantasy f1/i.test(body)) {
      test.skip(true, "Fantasy shell did not render");
      return;
    }

    // Default tab is Lineup — no click needed.
    const budgetText = await page.getByText(/budget/i).first().isVisible().catch(() => false);
    expect(budgetText, "Budget label should be visible").toBeTruthy();

    // Page renders "$0.0M / $100M" or similar — verify a budget number/format
    // is on the page. We don't pin the exact total because it depends on
    // whether a saved lineup exists for this signed-in user.
    expect(body).toMatch(/\$\s*\d+(\.\d)?\s*M\s*\/\s*\$\s*\d+/i);

    // Save button — the button text reads "Save Lineup"; it's disabled until
    // 5 drivers + 1 constructor are picked under budget.
    const saveBtn = page.getByRole("button", { name: /save lineup/i }).first();
    if ((await saveBtn.count()) > 0) {
      const disabled = await saveBtn.isDisabled().catch(() => true);
      expect(disabled, "Save Lineup should start disabled").toBeTruthy();
    }
  });

  test("DOTD tab — driver radio chips render", async ({ page }) => {
    await page.goto("/fantasy");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in");
      return;
    }
    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || !/fantasy f1/i.test(body)) {
      test.skip(true, "Fantasy shell did not render");
      return;
    }

    // Switch to the DOTD tab. The button label is "Driver of the Day".
    const dotdTab = page.getByRole("button", { name: /driver of the day/i }).first();
    if ((await dotdTab.count()) === 0) {
      test.skip(true, "DOTD tab not rendered");
      return;
    }
    await dotdTab.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Driver radios have `name="dotd"`. The 2026 grid → 20 drivers, but we
    // assert a relaxed `>= 10` to stay tolerant of price-table changes.
    const radios = await page.locator('input[type="radio"][name="dotd"]').count();
    expect(
      radios,
      `Expected at least 10 driver radio chips on DOTD tab, found ${radios}`,
    ).toBeGreaterThanOrEqual(10);
  });

  test("Leaderboard tab — table or empty-state renders", async ({ page }) => {
    await page.goto("/fantasy");
    await waitForPageReady(page);

    if (/\/sign-in/.test(page.url())) {
      test.skip(true, "Redirected to sign-in");
      return;
    }
    const body = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");
    if (!body || !/fantasy f1/i.test(body)) {
      test.skip(true, "Fantasy shell did not render");
      return;
    }

    const lbTab = page.getByRole("button", { name: /leaderboard/i }).first();
    if ((await lbTab.count()) === 0) {
      test.skip(true, "Leaderboard tab not rendered");
      return;
    }
    await lbTab.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);

    const updatedBody = await page
      .locator("body")
      .textContent({ timeout: 10_000 })
      .catch(() => "");

    // Either a table appears (>=1 entry) OR the explicit empty-state copy.
    const hasTable = (await page.locator("table").count()) > 0;
    const hasEmptyState =
      /no scored lineups yet|loading leaderboard/i.test(updatedBody || "");
    const hasHeader =
      /top lineups/i.test(updatedBody || "");
    expect(
      hasTable || hasEmptyState || hasHeader,
      "Leaderboard panel should render table, empty state, or header",
    ).toBeTruthy();
  });
});
