import { test, expect } from "@playwright/test";
import { waitForPageReady } from "./helpers";

/**
 * Data loading tests — verify API calls succeed and data renders.
 */

test.describe("Dashboard", () => {
  test("loads race schedule and standings data", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);

    // Should show some data cards or standings
    const cards = page.locator(".glass-card, .glass-card-hover, [class*='card']");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Drivers", () => {
  test("loads driver standings", async ({ page }) => {
    await page.goto("/drivers");
    await waitForPageReady(page);

    // Should render driver cards/buttons
    const driverElements = page.locator("button, [role='button']").filter({ hasText: /.+/ });
    await expect(driverElements.first()).toBeVisible({ timeout: 15_000 });

    // Should have a heading
    await expect(page.locator("h1")).toContainText(/driver/i);
  });
});

test.describe("Constructors", () => {
  test("loads constructor standings", async ({ page }) => {
    await page.goto("/constructors");
    await waitForPageReady(page);

    // Should render constructor cards
    const constructorCards = page.locator("button").filter({ hasText: /.+/ });
    await expect(constructorCards.first()).toBeVisible({ timeout: 15_000 });

    // Should display points
    const pointsEl = page.locator(".font-mono").first();
    await expect(pointsEl).toBeVisible();
  });
});

test.describe("H2H Battle", () => {
  test("loads head-to-head comparison", async ({ page }) => {
    await page.goto("/h2h");
    await waitForPageReady(page);

    await expect(page.locator("h1")).toContainText(/head|h2h|battle/i);
  });
});

test.describe("Strategy", () => {
  test("loads strategy page", async ({ page }) => {
    await page.goto("/strategy");
    await waitForPageReady(page);

    await expect(page.locator("h1")).toContainText(/strateg/i);
  });
});

test.describe("Telemetry", () => {
  test("loads telemetry comparison", async ({ page }) => {
    await page.goto("/telemetry");
    await waitForPageReady(page);

    await expect(page.locator("h1")).toContainText(/telemetry/i);

    // Should render driver selection buttons
    const driverBtns = page.locator("button").filter({ hasText: /VER|NOR|LEC|HAM/ });
    await expect(driverBtns.first()).toBeVisible();
  });
});

test.describe("Weather", () => {
  test("loads weather impact page", async ({ page }) => {
    await page.goto("/weather");
    await waitForPageReady(page);

    await expect(page.locator("h1")).toContainText(/weather/i);

    // Should have year and session selectors
    const selects = page.locator("select");
    await expect(selects.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Team Radio", () => {
  test("loads radio playback page", async ({ page }) => {
    await page.goto("/radio");
    await waitForPageReady(page);

    await expect(page.locator("h1")).toContainText(/team radio/i);

    // Should have year and session selectors
    const selects = page.locator("select");
    await expect(selects.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Race Replay", () => {
  test("loads race page", async ({ page }) => {
    await page.goto("/race");
    await waitForPageReady(page);

    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
  });
});
