import { defineConfig } from "@playwright/test";

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
const BYPASS = process.env.VERCEL_BYPASS || process.env.VERCEL_BYPASS_F1_PULSE || "";
const BASE_URL = process.env.BASE_URL || "https://f1-pulse-dealmaker-labs-projects.vercel.app";

// When E2E_PUBLIC_ONLY=1 (set by CI on the push-triggered advisory run), the
// desktop/mobile projects run ONLY the specs that produce correct signal with
// NO Clerk session: public routes (/, /sign-in, /sign-up), /api/* contract
// checks, theme rendering, and gated-route *redirect* smoke checks. Every other
// spec's primary assertions target content behind Clerk-gated (dashboard)
// routes; with no production Clerk session those specs either self-skip on the
// /sign-in redirect or hard-fail (a few hard-fail AND retry×2, which is what was
// blowing the 25-min job budget). They stay in the repo and light up under the
// `authenticated` project — which mints a real session — the day a Clerk prod
// instance exists. NOTE: this is an EXPLICIT allow-list. A new public spec must
// be added here or it will be silently skipped on the push CI.
const PUBLIC_ONLY = process.env.E2E_PUBLIC_ONLY === "1";
const PUBLIC_SPECS = [
  /api-routes\.spec\.ts$/, // pure /api/* request-fixture contract checks (public + 401s)
  /post-deploy\.spec\.ts$/, // /, /sign-in, /sign-up render + no fatal console errors
  /theme\.spec\.ts$/, // dark/light theme tokens on the public hero
  /navigation\.spec\.ts$/, // /, /sign-in real signal + gated routes redirect cleanly
  /smoke\.spec\.ts$/, // public pages + all gated routes load-or-redirect without crashing
];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // retries:2 for the full/authenticated CI run (absorbs real network flake); 0
  // for the public-only advisory run so a gated-route redirect is never retried
  // into a 3×30s timeout cascade.
  retries: process.env.CI && !PUBLIC_ONLY ? 2 : 0,
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
      ...(PUBLIC_ONLY
        ? { testMatch: PUBLIC_SPECS }
        : { testIgnore: [/\.auth\.spec\.ts$/, /auth\.setup\.ts$/] }),
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      ...(PUBLIC_ONLY
        ? { testMatch: PUBLIC_SPECS }
        : { testIgnore: [/\.auth\.spec\.ts$/, /auth\.setup\.ts$/] }),
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
});
