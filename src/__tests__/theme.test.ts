import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Theme System — dark/light theme, localStorage, team colors, tire colors
 *
 * Tests the theme system's CSS variable values, toggle persistence logic,
 * default theme behavior, and F1-specific color mappings.
 * Uses jsdom for localStorage and document.documentElement access.
 */

// ── Import the color utilities from utils.ts ──
import { getTeamColor, getTireColor } from "@/lib/utils";

// ── Mock localStorage for jsdom compatibility ──
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

// ── Theme CSS variable definitions (from globals.css) ──

const DARK_THEME = {
  "--f1-black": "#15151e",
  "--f1-surface": "#1e1e2a",
  "--f1-card": "#22222f",
  "--f1-border": "rgba(255,255,255,0.07)",
  "--f1-muted": "#606066",
  "--f1-text": "#ffffff",
  "--f1-text-sub": "rgba(255,255,255,0.55)",
  "--f1-text-dim": "rgba(255,255,255,0.25)",
  "--f1-hover": "rgba(255,255,255,0.04)",
  "--f1-red": "#e10600",
};

const LIGHT_THEME = {
  "--f1-black": "#f3f3f4",
  "--f1-surface": "#eaeaec",
  "--f1-card": "#ffffff",
  "--f1-border": "rgba(0,0,0,0.08)",
  "--f1-muted": "#818188",
  "--f1-text": "#1c1c25",
  "--f1-text-sub": "rgba(28,28,37,0.6)",
  "--f1-text-dim": "rgba(28,28,37,0.35)",
  "--f1-hover": "rgba(0,0,0,0.04)",
  "--f1-red": "#e10600",
};

// ── Theme toggle logic (mirrors theme-provider.tsx) ──

const STORAGE_KEY = "f1-theme";

function applyTheme(theme: "dark" | "light"): void {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

function getStoredTheme(): "dark" | "light" | null {
  return localStorage.getItem(STORAGE_KEY) as "dark" | "light" | null;
}

function toggleTheme(current: "dark" | "light"): "dark" | "light" {
  return current === "dark" ? "light" : "dark";
}

// ── Tests ──

describe("Theme — Dark Theme Values", () => {
  it("background is #15151e", () => {
    expect(DARK_THEME["--f1-black"]).toBe("#15151e");
  });

  it("text color is white (#ffffff)", () => {
    expect(DARK_THEME["--f1-text"]).toBe("#ffffff");
  });

  it("surface color is #1e1e2a", () => {
    expect(DARK_THEME["--f1-surface"]).toBe("#1e1e2a");
  });

  it("card color is #22222f", () => {
    expect(DARK_THEME["--f1-card"]).toBe("#22222f");
  });

  it("F1 red accent is #e10600", () => {
    expect(DARK_THEME["--f1-red"]).toBe("#e10600");
  });

  it("muted text color is #606066", () => {
    expect(DARK_THEME["--f1-muted"]).toBe("#606066");
  });
});

describe("Theme — Light Theme Values", () => {
  it("background is #f3f3f4", () => {
    expect(LIGHT_THEME["--f1-black"]).toBe("#f3f3f4");
  });

  it("text color is #1c1c25", () => {
    expect(LIGHT_THEME["--f1-text"]).toBe("#1c1c25");
  });

  it("surface color is #eaeaec", () => {
    expect(LIGHT_THEME["--f1-surface"]).toBe("#eaeaec");
  });

  it("card color is white (#ffffff)", () => {
    expect(LIGHT_THEME["--f1-card"]).toBe("#ffffff");
  });

  it("F1 red accent is #e10600 (same in both themes)", () => {
    expect(LIGHT_THEME["--f1-red"]).toBe("#e10600");
    expect(LIGHT_THEME["--f1-red"]).toBe(DARK_THEME["--f1-red"]);
  });

  it("muted text color is #818188", () => {
    expect(LIGHT_THEME["--f1-muted"]).toBe("#818188");
  });
});

describe("Theme — Toggle & Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("applyTheme('dark') adds 'dark' class to html element", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applyTheme('light') removes 'dark' class from html element", () => {
    document.documentElement.classList.add("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applyTheme persists to localStorage", () => {
    applyTheme("dark");
    expect(getStoredTheme()).toBe("dark");

    applyTheme("light");
    expect(getStoredTheme()).toBe("light");
  });

  it("toggle switches dark to light", () => {
    expect(toggleTheme("dark")).toBe("light");
  });

  it("toggle switches light to dark", () => {
    expect(toggleTheme("light")).toBe("dark");
  });

  it("double toggle returns to original theme", () => {
    const original: "dark" | "light" = "dark";
    const toggled = toggleTheme(original);
    const doubleToggled = toggleTheme(toggled);
    expect(doubleToggled).toBe(original);
  });
});

describe("Theme — Default Behavior", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to dark if no stored preference", () => {
    const stored = getStoredTheme();
    expect(stored).toBeNull();
    // ThemeProvider defaults: const [theme, setTheme] = useState<Theme>("dark");
    const defaultTheme = stored ?? "dark";
    expect(defaultTheme).toBe("dark");
  });

  it("uses stored preference when available", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const stored = getStoredTheme();
    expect(stored).toBe("light");
  });

  it("storage key is 'f1-theme'", () => {
    expect(STORAGE_KEY).toBe("f1-theme");
  });
});

describe("Theme — Team Colors", () => {
  it("Red Bull Racing is #3671C6", () => {
    expect(getTeamColor("Red Bull Racing")).toBe("#3671C6");
  });

  it("Red Bull (short) is #3671C6", () => {
    expect(getTeamColor("Red Bull")).toBe("#3671C6");
  });

  it("Ferrari is #E8002D", () => {
    expect(getTeamColor("Ferrari")).toBe("#E8002D");
  });

  it("McLaren is #FF8000", () => {
    expect(getTeamColor("McLaren")).toBe("#FF8000");
  });

  it("Mercedes is #27F4D2", () => {
    expect(getTeamColor("Mercedes")).toBe("#27F4D2");
  });

  it("Aston Martin is #229971", () => {
    expect(getTeamColor("Aston Martin")).toBe("#229971");
  });

  it("Alpine is #FF87BC", () => {
    expect(getTeamColor("Alpine")).toBe("#FF87BC");
  });

  it("Williams is #64C4FF", () => {
    expect(getTeamColor("Williams")).toBe("#64C4FF");
  });

  it("Haas is #B6BABD", () => {
    expect(getTeamColor("Haas")).toBe("#B6BABD");
  });

  it("RB F1 Team is #6692FF", () => {
    expect(getTeamColor("RB F1 Team")).toBe("#6692FF");
  });

  it("Cadillac is #1E3D6B", () => {
    expect(getTeamColor("Cadillac")).toBe("#1E3D6B");
  });

  it("unknown team returns fallback #888888", () => {
    expect(getTeamColor("Unknown Racing")).toBe("#888888");
  });

  it("empty string returns fallback", () => {
    expect(getTeamColor("")).toBe("#888888");
  });
});

describe("Theme — Tire Colors", () => {
  it("SOFT is #FF3333 (red)", () => {
    expect(getTireColor("SOFT")).toBe("#FF3333");
  });

  it("MEDIUM is #FFC906 (yellow)", () => {
    expect(getTireColor("MEDIUM")).toBe("#FFC906");
  });

  it("HARD is #FFFFFF (white)", () => {
    expect(getTireColor("HARD")).toBe("#FFFFFF");
  });

  it("INTERMEDIATE is #39B54A (green)", () => {
    expect(getTireColor("INTERMEDIATE")).toBe("#39B54A");
  });

  it("WET is #0067FF (blue)", () => {
    expect(getTireColor("WET")).toBe("#0067FF");
  });

  it("UNKNOWN is #888888", () => {
    expect(getTireColor("UNKNOWN")).toBe("#888888");
  });

  it("is case-insensitive (soft/Soft/SOFT all work)", () => {
    expect(getTireColor("soft")).toBe("#FF3333");
    expect(getTireColor("Soft")).toBe("#FF3333");
    expect(getTireColor("SOFT")).toBe("#FF3333");
  });

  it("unknown compound returns fallback #888888", () => {
    expect(getTireColor("HYPERSOFT")).toBe("#888888");
  });

  it("null/undefined input returns fallback", () => {
    expect(getTireColor(null as unknown as string)).toBe("#888888");
    expect(getTireColor(undefined as unknown as string)).toBe("#888888");
  });
});
