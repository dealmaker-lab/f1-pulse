"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  /** OLED (pure-black) mode — race-day battery saver, dark theme only. */
  oled: boolean;
  toggleOled: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  oled: false,
  toggleOled: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** localStorage that never throws (private mode / restricted storage). */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage restricted — preference just won't persist */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [oled, setOled] = useState(false);

  // On mount: read persisted preferences (or system preference)
  useEffect(() => {
    const stored = safeGet("f1-theme") as Theme | null;
    const preferred =
      stored ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(preferred);
    setTheme(preferred);

    const storedOled = safeGet("f1-oled") === "1";
    applyOled(storedOled && preferred === "dark");
    setOled(storedOled && preferred === "dark");
  }, []);

  function applyTheme(t: Theme) {
    const root = document.documentElement;
    root.classList.toggle("dark", t === "dark");
    // OLED only makes sense on the dark theme.
    if (t === "light") {
      root.classList.remove("oled");
      setOled(false);
    }
    safeSet("f1-theme", t);
  }

  function applyOled(on: boolean) {
    document.documentElement.classList.toggle("oled", on);
    safeSet("f1-oled", on ? "1" : "0");
  }

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  function toggleOled() {
    // OLED requires dark theme — flip to dark first if needed.
    if (theme !== "dark") {
      applyTheme("dark");
      setTheme("dark");
    }
    const next = !oled;
    applyOled(next);
    setOled(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle, oled, toggleOled }}>
      {children}
    </ThemeContext.Provider>
  );
}
