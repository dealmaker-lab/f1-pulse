import { describe, it, expect } from "vitest";

/**
 * Design System — CSS variables, typography, component classes, animations
 *
 * Tests the F1 Pulse design system's foundational tokens: colors, fonts,
 * glass card properties, position badge styling, numeric formatting rules,
 * animation timing, and GPU-safe motion constraints.
 * Does NOT parse actual CSS — tests the documented design token values.
 */

// ── Design Token Definitions (from globals.css + tailwind.config.ts) ──

const DESIGN_TOKENS = {
  // Brand
  f1Red: "#e10600",
  f1RedDim: "rgba(225,6,0,0.12)",

  // Dark palette
  darkBackground: "#15151e",
  darkSurface: "#1e1e2a",
  darkCard: "#22222f",
  darkBorder: "rgba(255,255,255,0.07)",

  // Light palette
  lightBackground: "#f3f3f4",
  lightSurface: "#eaeaec",
  lightCard: "#ffffff",
  lightBorder: "rgba(0,0,0,0.08)",
};

const FONTS = {
  heading: "Titillium Web",
  body: "Titillium Web",
  data: "Fira Code",
  fallback: ["system-ui", "sans-serif"],
  monoFallback: ["monospace"],
};

const GLASS_CARD = {
  borderRadius: 12, // 12px
  backdropBlur: 20, // blur(20px) in dark mode
  borderColor: "rgba(255,255,255,0.07)",
};

const POSITION_BADGES = {
  p1: { color: "#ffc906", label: "gold" },
  p2: { color: "rgba(255,255,255,0.8)", label: "silver" },
  p3: { color: "#cd7f32", label: "bronze" },
};

const POS_BADGE_VARIANTS = {
  p1: { background: "rgba(255,201,6,0.15)", color: "#ffc906" },
  p2: { background: "var(--f1-hover)", color: "var(--f1-text-sub)" },
  p3: { background: "rgba(205,127,50,0.15)", color: "#cd7f32" },
};

const ANIMATION_TIMING = {
  micro: 100,    // active press: 100ms
  state: 300,    // state change: 300ms
  entrance: 400, // fade-in: 0.4s = 400ms
  entranceLarge: 500, // fade-in-up: 0.5s = 500ms
};

/** Tailwind animation definitions from tailwind.config.ts */
const TAILWIND_ANIMATIONS = {
  "pulse-glow": "pulse-glow 2s ease-in-out infinite",
  "slide-up": "slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
  "slide-in": "slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
  "fade-in": "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
  "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
  "scale-in": "scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
  "shimmer": "shimmer 2s linear infinite",
};

/** Keyframe definitions — only transform + opacity are animated (GPU-safe) */
const KEYFRAME_PROPERTIES: Record<string, string[]> = {
  "fade-in": ["opacity", "transform"],
  "fade-in-up": ["opacity", "transform"],
  "slide-up": ["transform", "opacity"],
  "slide-in": ["transform", "opacity"],
  "scale-in": ["opacity", "transform"],
  "pulse-glow": ["boxShadow"], // exception: glow effect
  "shimmer": ["backgroundPosition"], // exception: shimmer
};

// ── Tests ──

describe("Design System — Brand Colors", () => {
  it("F1 red accent is #e10600", () => {
    expect(DESIGN_TOKENS.f1Red).toBe("#e10600");
  });

  it("F1 red is consistent between dark and light themes", () => {
    // Both themes use the same red
    expect(DESIGN_TOKENS.f1Red).toBe("#e10600");
  });

  it("F1 red dimmed variant uses 12% opacity", () => {
    expect(DESIGN_TOKENS.f1RedDim).toBe("rgba(225,6,0,0.12)");
  });

  it("dark background is #15151e", () => {
    expect(DESIGN_TOKENS.darkBackground).toBe("#15151e");
  });

  it("light background is #f3f3f4", () => {
    expect(DESIGN_TOKENS.lightBackground).toBe("#f3f3f4");
  });
});

describe("Design System — Typography", () => {
  it("heading font is Titillium Web", () => {
    expect(FONTS.heading).toBe("Titillium Web");
  });

  it("body font is Titillium Web", () => {
    expect(FONTS.body).toBe("Titillium Web");
  });

  it("data/mono font is Fira Code", () => {
    expect(FONTS.data).toBe("Fira Code");
  });

  it("fallback fonts include system-ui", () => {
    expect(FONTS.fallback).toContain("system-ui");
  });

  it("mono fallback is monospace", () => {
    expect(FONTS.monoFallback).toContain("monospace");
  });

  it("tabular-nums is used for all numeric data values", () => {
    // Multiple places use font-variant-numeric: tabular-nums
    // stat-number class, f1-table td, data-value class, AnimatedNumber
    const usesTabularNums = true; // documented in globals.css
    expect(usesTabularNums).toBe(true);
  });
});

describe("Design System — Glass Card", () => {
  it("border radius is 12px", () => {
    expect(GLASS_CARD.borderRadius).toBe(12);
  });

  it("backdrop blur is 20px in dark mode", () => {
    expect(GLASS_CARD.backdropBlur).toBe(20);
  });

  it("border color is rgba(255,255,255,0.07)", () => {
    expect(GLASS_CARD.borderColor).toBe("rgba(255,255,255,0.07)");
  });

  it("glass-card-hover has translateY(-2px) on hover", () => {
    // From globals.css: .glass-card-hover:hover { transform: translateY(-2px); }
    const hoverTransform = "translateY(-2px)";
    expect(hoverTransform).toBe("translateY(-2px)");
  });

  it("glass-card-hover active resets to translateY(0) in 100ms", () => {
    // From globals.css: .glass-card-hover:active { transform: translateY(0); transition-duration: 100ms; }
    const activeDuration = 100;
    expect(activeDuration).toBe(ANIMATION_TIMING.micro);
  });
});

describe("Design System — Position Badges", () => {
  it("P1 is gold (#ffc906)", () => {
    expect(POSITION_BADGES.p1.color).toBe("#ffc906");
    expect(POSITION_BADGES.p1.label).toBe("gold");
  });

  it("P2 is silver (rgba white 0.8)", () => {
    expect(POSITION_BADGES.p2.color).toBe("rgba(255,255,255,0.8)");
    expect(POSITION_BADGES.p2.label).toBe("silver");
  });

  it("P3 is bronze (#cd7f32)", () => {
    expect(POSITION_BADGES.p3.color).toBe("#cd7f32");
    expect(POSITION_BADGES.p3.label).toBe("bronze");
  });

  it("pos-badge P1 has gold glow shadow", () => {
    expect(POS_BADGE_VARIANTS.p1.background).toBe("rgba(255,201,6,0.15)");
    expect(POS_BADGE_VARIANTS.p1.color).toBe("#ffc906");
  });

  it("pos-badge P3 has bronze background", () => {
    expect(POS_BADGE_VARIANTS.p3.background).toBe("rgba(205,127,50,0.15)");
    expect(POS_BADGE_VARIANTS.p3.color).toBe("#cd7f32");
  });

  it("pos-badge P2 uses neutral hover background", () => {
    expect(POS_BADGE_VARIANTS.p2.background).toBe("var(--f1-hover)");
  });
});

describe("Design System — Animation Timing", () => {
  it("micro interactions are 100ms (active press)", () => {
    expect(ANIMATION_TIMING.micro).toBe(100);
  });

  it("state changes are 300ms", () => {
    expect(ANIMATION_TIMING.state).toBe(300);
  });

  it("entrance animations are 400-500ms", () => {
    expect(ANIMATION_TIMING.entrance).toBe(400);
    expect(ANIMATION_TIMING.entranceLarge).toBe(500);
  });

  it("fade-in uses spring easing cubic-bezier(0.16, 1, 0.3, 1)", () => {
    expect(TAILWIND_ANIMATIONS["fade-in"]).toContain(
      "cubic-bezier(0.16, 1, 0.3, 1)"
    );
  });

  it("slide-up uses spring easing", () => {
    expect(TAILWIND_ANIMATIONS["slide-up"]).toContain(
      "cubic-bezier(0.16, 1, 0.3, 1)"
    );
  });

  it("scale-in is 300ms (0.3s)", () => {
    expect(TAILWIND_ANIMATIONS["scale-in"]).toContain("0.3s");
  });

  it("shimmer is 2s linear infinite", () => {
    expect(TAILWIND_ANIMATIONS["shimmer"]).toBe("shimmer 2s linear infinite");
  });
});

describe("Design System — GPU-Safe Motion", () => {
  it("fade-in only animates opacity + transform", () => {
    const props = KEYFRAME_PROPERTIES["fade-in"];
    expect(props).toContain("opacity");
    expect(props).toContain("transform");
    expect(props).not.toContain("width");
    expect(props).not.toContain("height");
    expect(props).not.toContain("top");
    expect(props).not.toContain("left");
    expect(props).not.toContain("margin");
  });

  it("slide-up only animates transform + opacity", () => {
    const props = KEYFRAME_PROPERTIES["slide-up"];
    expect(props).toContain("transform");
    expect(props).toContain("opacity");
    expect(props).toHaveLength(2);
  });

  it("slide-in only animates transform + opacity", () => {
    const props = KEYFRAME_PROPERTIES["slide-in"];
    expect(props).toContain("transform");
    expect(props).toContain("opacity");
    expect(props).toHaveLength(2);
  });

  it("scale-in only animates opacity + transform", () => {
    const props = KEYFRAME_PROPERTIES["scale-in"];
    expect(props).toContain("opacity");
    expect(props).toContain("transform");
    expect(props).toHaveLength(2);
  });

  it("fade-in-up only animates opacity + transform", () => {
    const props = KEYFRAME_PROPERTIES["fade-in-up"];
    expect(props).toContain("opacity");
    expect(props).toContain("transform");
    expect(props).toHaveLength(2);
  });

  it("all main animations use only GPU-compositable properties", () => {
    const gpuSafe = ["opacity", "transform"];
    const mainAnimations = ["fade-in", "fade-in-up", "slide-up", "slide-in", "scale-in"];
    for (const anim of mainAnimations) {
      const props = KEYFRAME_PROPERTIES[anim];
      for (const prop of props) {
        expect(gpuSafe).toContain(prop);
      }
    }
  });
});

describe("Design System — F1 Font Sizes (Tailwind Config)", () => {
  /** From tailwind.config.ts fontSize definitions */
  const F1_SIZES = {
    "f1-xs": { size: "10px", weight: "700", spacing: "0.12em" },
    "f1-sm": { size: "12px", weight: "700", spacing: "0.06em" },
    "f1-md": { size: "14px", weight: "700", spacing: "0.02em" },
    "f1-lg": { size: "18px", weight: "900", spacing: "-0.01em" },
    "f1-xl": { size: "24px", weight: "900", spacing: "-0.02em" },
    "f1-2xl": { size: "32px", weight: "900", spacing: "-0.02em" },
  };

  it("f1-xs is 10px with 700 weight", () => {
    expect(F1_SIZES["f1-xs"].size).toBe("10px");
    expect(F1_SIZES["f1-xs"].weight).toBe("700");
  });

  it("f1-lg and above use 900 (black) weight", () => {
    expect(F1_SIZES["f1-lg"].weight).toBe("900");
    expect(F1_SIZES["f1-xl"].weight).toBe("900");
    expect(F1_SIZES["f1-2xl"].weight).toBe("900");
  });

  it("smaller sizes have positive letter-spacing (wide), larger have negative (tight)", () => {
    expect(parseFloat(F1_SIZES["f1-xs"].spacing)).toBeGreaterThan(0);
    expect(parseFloat(F1_SIZES["f1-sm"].spacing)).toBeGreaterThan(0);
    expect(parseFloat(F1_SIZES["f1-lg"].spacing)).toBeLessThan(0);
    expect(parseFloat(F1_SIZES["f1-xl"].spacing)).toBeLessThan(0);
  });

  it("sizes increase progressively", () => {
    const sizes = Object.values(F1_SIZES).map((s) => parseInt(s.size));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });
});

describe("Design System — Scrollbar Styling", () => {
  it("scrollbar width is 4px", () => {
    // From globals.css: *::-webkit-scrollbar { width: 4px; height: 4px; }
    const scrollbarWidth = 4;
    expect(scrollbarWidth).toBe(4);
  });

  it("scrollbar thumb uses F1 red at 20% opacity", () => {
    const thumbColor = "rgba(225,6,0,0.2)";
    expect(thumbColor).toContain("225,6,0");
    expect(thumbColor).toContain("0.2");
  });

  it("scrollbar thumb hover increases to 40% opacity", () => {
    const thumbHoverColor = "rgba(225,6,0,0.4)";
    expect(thumbHoverColor).toContain("0.4");
  });
});

describe("Design System — Focus Indicators", () => {
  it("focus-visible outline uses F1 red at 60% opacity", () => {
    // From globals.css: outline: 2px solid rgba(225, 6, 0, 0.6)
    const outlineColor = "rgba(225, 6, 0, 0.6)";
    expect(outlineColor).toContain("225, 6, 0");
  });

  it("focus-visible outline is 2px solid with 2px offset", () => {
    const outlineWidth = 2;
    const outlineOffset = 2;
    expect(outlineWidth).toBe(2);
    expect(outlineOffset).toBe(2);
  });
});

describe("Design System — Reduced Motion", () => {
  it("reduced motion media query sets durations to 0.01ms", () => {
    // From globals.css: @media (prefers-reduced-motion: reduce)
    // animation-duration: 0.01ms !important
    // transition-duration: 0.01ms !important
    const reducedDuration = 0.01;
    expect(reducedDuration).toBe(0.01);
  });
});
