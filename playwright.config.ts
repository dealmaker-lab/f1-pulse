import { defineConfig } from "@playwright/test";

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
const BYPASS = process.env.VERCEL_BYPASS || process.env.VERCEL_BYPASS_F1_PULSE || "";
const BASE_URL = process.env.BASE_URL || "https://f1-pulse.vercel.app";

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
    connectOptions: {
      wsEndpoint: CDP_ENDPOINT,
    },
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
});
