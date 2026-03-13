import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "https://patootu-f1.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off",
  },

  projects: [
    {
      name: "chromium-dark",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-light",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-dark",
      use: {
        ...devices["iPhone 14"],
        colorScheme: "dark",
      },
    },
  ],
});
