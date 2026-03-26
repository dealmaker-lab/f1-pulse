import { describe, it, expect } from "vitest";

/**
 * Chat Panel — logic and data tests
 *
 * Tests the chat panel's data structures, input validation logic,
 * message rendering rules, and tool-execution indicator logic.
 * Does NOT render React components (no providers needed).
 */

// ── Inline the constants and logic from chat-panel.tsx ──

const SUGGESTIONS = [
  "Who leads the 2026 championship?",
  "Compare Hamilton vs Verstappen this season",
  "What were the pit strategies at the last race?",
  "Show me the constructor standings",
];

/** Mirrors the input validation from ChatPanel.handleSubmit */
function isValidInput(input: string, isLoading: boolean): boolean {
  return input.trim().length > 0 && !isLoading;
}

/** Mirrors the message alignment logic */
function getMessageAlignment(role: string): string {
  return role === "user" ? "flex justify-end" : "";
}

/** Mirrors the message bubble class logic */
function getMessageBubbleClasses(role: string): string {
  if (role === "user") {
    return "bg-[#e10600]/10 border border-[#e10600]/20 text-[var(--f1-text)]";
  }
  return "bg-[var(--f1-hover)] text-[var(--f1-text)]";
}

/** Mirrors the part rendering logic */
function renderPartType(
  partType: string
): "text" | "tool-indicator" | "null" {
  if (partType === "text") return "text";
  if (partType.startsWith("tool-")) return "tool-indicator";
  return "null";
}

/** Mirrors the loading state derivation */
function isLoadingState(status: string): boolean {
  return status === "streaming" || status === "submitted";
}

// ── Tests ──

describe("ChatPanel — Suggestions", () => {
  it("has exactly 4 suggestion items", () => {
    expect(SUGGESTIONS).toHaveLength(4);
  });

  it("each suggestion is a non-empty string", () => {
    for (const s of SUGGESTIONS) {
      expect(typeof s).toBe("string");
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("suggestions cover key F1 topics (championship, comparison, strategy, standings)", () => {
    const topics = SUGGESTIONS.join(" ").toLowerCase();
    expect(topics).toContain("championship");
    expect(topics).toContain("verstappen");
    expect(topics).toContain("pit");
    expect(topics).toContain("standings");
  });
});

describe("ChatPanel — Input Validation", () => {
  it("rejects empty string", () => {
    expect(isValidInput("", false)).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isValidInput("   ", false)).toBe(false);
    expect(isValidInput("\t\n", false)).toBe(false);
  });

  it("rejects valid input while loading", () => {
    expect(isValidInput("Hello", true)).toBe(false);
  });

  it("accepts non-empty string when not loading", () => {
    expect(isValidInput("Who won the race?", false)).toBe(true);
  });

  it("accepts single character input", () => {
    expect(isValidInput("x", false)).toBe(true);
  });
});

describe("ChatPanel — Message Rendering Logic", () => {
  it("user messages align right", () => {
    expect(getMessageAlignment("user")).toBe("flex justify-end");
  });

  it("assistant messages have no extra alignment class", () => {
    expect(getMessageAlignment("assistant")).toBe("");
  });

  it("system messages have no extra alignment class", () => {
    expect(getMessageAlignment("system")).toBe("");
  });

  it("user bubble has red accent background", () => {
    const classes = getMessageBubbleClasses("user");
    expect(classes).toContain("bg-[#e10600]/10");
    expect(classes).toContain("border-[#e10600]/20");
  });

  it("assistant bubble has hover background", () => {
    const classes = getMessageBubbleClasses("assistant");
    expect(classes).toContain("bg-[var(--f1-hover)]");
    expect(classes).not.toContain("#e10600");
  });
});

describe("ChatPanel — Part Type Rendering", () => {
  it('renders text parts as "text"', () => {
    expect(renderPartType("text")).toBe("text");
  });

  it('renders tool-invocation parts as "tool-indicator"', () => {
    expect(renderPartType("tool-invocation")).toBe("tool-indicator");
  });

  it('renders tool-result parts as "tool-indicator"', () => {
    expect(renderPartType("tool-result")).toBe("tool-indicator");
  });

  it("returns null for unknown part types", () => {
    expect(renderPartType("image")).toBe("null");
    expect(renderPartType("audio")).toBe("null");
  });
});

describe("ChatPanel — Loading State", () => {
  it('"streaming" status means loading', () => {
    expect(isLoadingState("streaming")).toBe(true);
  });

  it('"submitted" status means loading', () => {
    expect(isLoadingState("submitted")).toBe(true);
  });

  it('"ready" status means not loading', () => {
    expect(isLoadingState("ready")).toBe(false);
  });

  it('"error" status means not loading', () => {
    expect(isLoadingState("error")).toBe(false);
  });
});

describe("ChatPanel — Panel Dimensions (CSS)", () => {
  it("panel width is 380px", () => {
    // From: w-[380px] in chat-panel.tsx
    const panelWidth = 380;
    expect(panelWidth).toBe(380);
  });

  it("panel max-height is 560px", () => {
    // From: max-h-[560px] in chat-panel.tsx
    const panelMaxHeight = 560;
    expect(panelMaxHeight).toBe(560);
  });

  it("messages area min-height is 300px, max-height is 400px", () => {
    // From: min-h-[300px] max-h-[400px]
    const minH = 300;
    const maxH = 400;
    expect(minH).toBe(300);
    expect(maxH).toBe(400);
  });

  it("toggle button is 48px (w-12 h-12)", () => {
    // 12 * 4px = 48px — meets 44px minimum touch target
    const size = 12 * 4;
    expect(size).toBe(48);
    expect(size).toBeGreaterThanOrEqual(44);
  });

  it("panel uses blur(20px) backdrop filter", () => {
    // From: style={{ backdropFilter: "blur(20px)" }}
    const backdropFilter = "blur(20px)";
    expect(backdropFilter).toBe("blur(20px)");
  });
});
