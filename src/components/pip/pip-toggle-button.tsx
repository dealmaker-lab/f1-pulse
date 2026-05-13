"use client";

import { PictureInPicture2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentPip } from "@/hooks/use-document-pip";
import { LiveLeaderboardPip } from "@/components/pip/live-leaderboard-pip";

/**
 * PipToggleButton — small icon-label button that opens a Picture-in-Picture
 * window with the live leaderboard widget.
 *
 * Behaviour:
 *  - Available only in browsers that support `documentPictureInPicture` —
 *    rendered as a disabled button with a tooltip elsewhere. We deliberately
 *    keep the button visible so it's discoverable; the tooltip explains the
 *    constraint.
 *  - Click acts as the user gesture required by the spec — invokes
 *    `pip.open()`. If the window is already open, the hook focuses it.
 *  - The portal returned by the hook is rendered right next to the button
 *    so React keeps the PiP children mounted under this component's tree.
 *    Without this, the data hooks inside `LiveLeaderboardPip` would never
 *    mount.
 *
 * The visual matches the existing `/race` page header controls — small
 * monospace label, subtle hover, no rounded "primary" emphasis.
 */

interface PipToggleButtonProps {
  className?: string;
}

export function PipToggleButton({ className }: PipToggleButtonProps) {
  const pip = useDocumentPip({
    width: 420,
    height: 360,
    render: () => <LiveLeaderboardPip />,
  });

  const disabled = !pip.isAvailable;
  const label = pip.isOpen ? "Popped out" : "Pop out";
  const title = disabled
    ? "Picture-in-Picture not supported in this browser"
    : pip.isOpen
      ? "Picture-in-Picture window is open"
      : "Open live leaderboard in a floating window";

  const handleClick = (): void => {
    if (disabled) return;
    // open() may reject if the browser blocks the request (e.g. headless
    // mode). Swallow — the button stays usable so the user can retry.
    pip.open().catch(() => {});
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-pressed={pip.isOpen}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
          disabled
            ? "cursor-not-allowed text-white/20"
            : pip.isOpen
              ? "bg-racing-blue/20 text-racing-blue cursor-pointer"
              : "text-white/40 hover:bg-[var(--f1-hover)] hover:text-white/70 cursor-pointer",
          className,
        )}
      >
        <PictureInPicture2 className="h-3 w-3" aria-hidden />
        <span>{label}</span>
      </button>
      {pip.portal}
    </>
  );
}
