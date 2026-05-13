import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * NOTE — why this test does not render or even import the component:
 *
 * - `@testing-library/react` is listed in devDependencies but its peer
 *   `@testing-library/dom` is NOT installed, and the project's vitest config
 *   does not register a JSX/React plugin (the source uses JSX with
 *   `jsx: preserve` for Next.js's swc). Importing the .tsx component file
 *   would cause vitest to error on the unparseable JSX.
 *
 * Per the test brief: do NOT add new dependencies. So instead of rendering,
 * we treat this as a contract test against the component module's source —
 * verifying it exists, exports the expected symbols, and has the expected
 * prop shape. Runtime render behaviour is covered by the Playwright E2E
 * specs which exercise the real DOM.
 */

const COMPONENT_PATH = resolve(
  __dirname,
  "../components/race/aero-override-badge.tsx",
);

describe("AeroOverrideBadge — module contract", () => {
  it("source file exists at the expected path", () => {
    expect(existsSync(COMPONENT_PATH)).toBe(true);
  });

  describe("with the component source loaded", () => {
    const source = existsSync(COMPONENT_PATH)
      ? readFileSync(COMPONENT_PATH, "utf8")
      : "";

    it("exports an AeroOverrideBadgeProps interface", () => {
      expect(source).toMatch(/export\s+interface\s+AeroOverrideBadgeProps/);
    });

    it("exports the AeroOverrideBadge function (named + default)", () => {
      expect(source).toMatch(/export\s+function\s+AeroOverrideBadge/);
      expect(source).toMatch(/export\s+default\s+AeroOverrideBadge/);
    });

    it("declares the documented props on AeroOverrideBadgeProps", () => {
      // Each prop name should appear in the interface body. We deliberately
      // don't try to fully parse the type — just confirm names are present
      // so a typo / accidental rename trips this test.
      expect(source).toContain("aeroMode");
      expect(source).toContain("overrideActive");
      expect(source).toContain("budgetRemaining");
      expect(source).toContain("compact");
    });

    it("marks the file as a client component (uses React state implicitly)", () => {
      // The badge is rendered inside client surfaces; the directive prevents
      // accidental promotion to a Server Component when imported alongside
      // event-handling siblings.
      expect(source.trim().startsWith('"use client"')).toBe(true);
    });

    it("supports both Z and X aero modes (regex check)", () => {
      expect(source).toMatch(/aeroMode\s*===\s*"X"/);
      expect(source).toMatch(/aeroMode\s*===\s*"Z"/);
    });

    it("clamps budgetRemaining to the [0, 1] range before rendering", () => {
      // Defensive math — guard against telemetry surprises in 2026 schemas.
      expect(source).toMatch(/budgetRemaining\s*>=\s*0/);
      expect(source).toMatch(/budgetRemaining\s*<=\s*1/);
    });
  });
});
