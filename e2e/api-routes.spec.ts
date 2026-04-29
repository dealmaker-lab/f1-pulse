import { test, expect } from "@playwright/test";

/**
 * Direct API contract tests for new endpoints (Phases 1-9).
 *
 * Uses Playwright's `request` fixture rather than the CDP-backed page
 * fixture — these are pure HTTP tests, the headless browser is not
 * involved. baseURL + Vercel protection bypass header come from
 * playwright.config.ts.
 *
 * Notes on auth:
 *  - /api/fantasy/lineup (POST) and /api/radio/transcribe (GET) gate on
 *    Clerk. Unauthenticated calls should get 401.
 *  - The Vercel protection bypass header lets us through the SSO wall but
 *    does NOT mint a Clerk session, so 401 from Clerk is the correct
 *    expected status here.
 */

const BASE_URL =
  process.env.BASE_URL ||
  "https://f1-pulse-dealmaker-labs-projects.vercel.app";

const BYPASS =
  process.env.VERCEL_BYPASS || process.env.VERCEL_BYPASS_F1_PULSE || "";

const HEADERS: Record<string, string> = BYPASS
  ? { "x-vercel-protection-bypass": BYPASS }
  : {};

test.describe("API contract — /api/weather/forecast", () => {
  test("200 with array body for valid circuit", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/weather/forecast?circuit=monza&hours=24`,
      { headers: HEADERS },
    );
    expect(res.status(), `Expected 200, got ${res.status()}`).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body), "Forecast response should be an array").toBeTruthy();
  });

  test("400 for unknown circuit id", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/weather/forecast?circuit=invalidxxxxxx&hours=24`,
      { headers: HEADERS },
    );
    expect(res.status()).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body, "Error body should contain `error` key").toHaveProperty("error");
  });
});

test.describe("API contract — /api/pirelli/preview", () => {
  test("200 with allocation object for known circuit", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/pirelli/preview?circuit=monza`,
      { headers: HEADERS },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body, "Response should expose `allocation`").toHaveProperty("allocation");
    // `allocation` is `CompoundAllocation | null`. When non-null, it has
    // hard/medium/soft codes — but we don't pin shape here; the static
    // dataset can change.
    expect(body, "Response should expose `source`").toHaveProperty("source");
  });
});

test.describe("API contract — /api/radio/transcribe", () => {
  test("400 when URL fails the livetiming allow-list", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/radio/transcribe?url=https://example.com/foo.mp3`,
      { headers: HEADERS },
    );
    // The route checks auth FIRST (Clerk → 401), then the allow-list. So an
    // unauthenticated caller will see 401 even with a bad URL. Both 400
    // (allow-list reject if auth gate is bypassed) and 401 (no Clerk session)
    // are acceptable rejection states — we just need the request blocked.
    expect(
      [400, 401].includes(res.status()),
      `Expected 400 or 401, got ${res.status()}`,
    ).toBeTruthy();
  });

  test("401 (auth gate) for allow-listed URL when unauthenticated", async ({
    request,
  }) => {
    const res = await request.get(
      `${BASE_URL}/api/radio/transcribe?url=https://livetiming.formula1.com/static/test.mp3`,
      { headers: HEADERS },
    );
    expect(
      res.status(),
      `Expected 401 for unauthenticated transcribe, got ${res.status()}`,
    ).toBe(401);
  });
});

test.describe("API contract — /api/fia/documents", () => {
  test("200 with array body (may be empty)", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/fia/documents?year=2026&event=Monaco`,
      { headers: HEADERS, timeout: 30_000 },
    );
    // FIA scraper can return 200 (with array) or 502 if upstream is down.
    // 200 is the contract; we accept 502 as a tolerated upstream failure
    // because the test is talking to the live FIA site.
    if (res.status() === 502) {
      test.info().annotations.push({
        type: "fia-upstream",
        description: "FIA upstream returned 502 — accepted as transient",
      });
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body), "Documents should be an array").toBeTruthy();
  });
});

test.describe("API contract — /api/reddit/race-thread", () => {
  test("200 or 404 — both are valid contract outcomes", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/reddit/race-thread?race=Monaco&date=2026-05-25T15:00:00Z`,
      { headers: HEADERS, timeout: 20_000 },
    );
    // 200 = thread found, 404 = no thread within ±48h, 502 = Reddit down.
    // All are documented states — we just rule out 5xx server bugs.
    expect(
      [200, 404, 502].includes(res.status()),
      `Expected 200/404/502, got ${res.status()}`,
    ).toBeTruthy();

    if (res.status() === 200) {
      const body = await res.json();
      // Thread shape: { id, title, created, permalink }
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("permalink");
    }
    if (res.status() === 404) {
      const body = await res.json().catch(() => ({}));
      expect(body).toHaveProperty("error");
    }
  });
});

test.describe("API contract — /api/fantasy/lineup", () => {
  test("401 on POST without auth", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/fantasy/lineup`, {
      headers: { ...HEADERS, "Content-Type": "application/json" },
      data: {
        year: 2026,
        round: 1,
        drivers: ["VER", "NOR", "LEC", "HAM", "RUS"],
        constructor: "Ferrari",
        budget_used: 80,
      },
    });
    expect(res.status(), `Expected 401, got ${res.status()}`).toBe(401);
  });

  test("401 on GET without auth", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/fantasy/lineup?year=2026&round=1`,
      { headers: HEADERS },
    );
    expect(res.status()).toBe(401);
  });
});
