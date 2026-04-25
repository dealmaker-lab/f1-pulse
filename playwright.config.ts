import { defineConfig } from "@playwright/test";

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
const BYPASS = process.env.VERCEL_BYPASS || process.env.VERCEL_BYPASS_F1_PULSE || "";
const BASE_URL = process.env.BASE_URL || "https://f1-pulse-dealmaker-labs-projects.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? "github" : [["html", { open: "never" }], ["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    // Step 1 — mint a Clerk session via @clerk/testing/playwright and save
    // storageState. All projects that need a real auth context depend on this.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
    },
    // Tests for Clerk-protected pages (e.g. /dashboard/*). Reuse the saved
    // storageState so every test inherits a real session — no per-test sign-in.
    {
      name: "authenticated",
      testMatch: /\.auth\.spec\.ts$/,
      dependencies: ["setup"],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: "playwright/.clerk/user.json",
      },
    },
    // Public-route tests — explicitly ignore auth setup and auth specs so they
    // don't accidentally run under desktop/mobile without a session.
    {
      name: "desktop",
      testIgnore: [/\.auth\.spec\.ts$/, /auth\.setup\.ts$/],
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: [/\.auth\.spec\.ts$/, /auth\.setup\.ts$/],
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
});
