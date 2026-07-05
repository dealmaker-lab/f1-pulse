"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/layout/theme-provider";
import { useWakeLock } from "@/hooks/use-wake-lock";

/**
 * Race-day mobile controls: OLED pure-black mode (battery saver) and a
 * screen keep-awake toggle. Both degrade gracefully — the wake-lock pill is
 * hidden where the API is unsupported.
 */
export default function RaceDayControls({ className }: { className?: string }) {
  const { oled, toggleOled } = useTheme();
  const { supported, active, toggle } = useWakeLock();

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        onClick={toggleOled}
        aria-pressed={oled}
        title={oled ? "OLED mode on (pure black)" : "OLED mode off"}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors",
          oled
            ? "text-racing-amber bg-racing-amber/10 border-racing-amber/30"
            : "text-f1-muted border-[var(--f1-border)] hover:text-f1-sub",
        )}
      >
        {oled ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
        OLED
      </button>

      {supported && (
        <button
          onClick={toggle}
          aria-pressed={active}
          title={active ? "Screen will stay awake" : "Keep screen awake"}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors",
            active
              ? "text-racing-green bg-racing-green/10 border-racing-green/30"
              : "text-f1-muted border-[var(--f1-border)] hover:text-f1-sub",
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              active ? "bg-racing-green animate-pulse" : "bg-f1-muted",
            )}
          />
          Awake
        </button>
      )}
    </div>
  );
}
