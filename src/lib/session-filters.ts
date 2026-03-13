/**
 * Official F1 session name filters.
 *
 * These match the `session_name` field from the OpenF1 API, which aligns
 * with official FIA / Formula 1 terminology:
 *
 * Standard weekend: Practice 1, Practice 2, Practice 3, Qualifying, Race
 * Sprint weekend:   Practice 1, Sprint Qualifying, Sprint, Qualifying, Race
 *
 * Source: FIA 2026 Sporting Regulations + OpenF1 API (`session_name` field)
 */

export interface SessionFilterOption {
  value: string;
  label: string;
  /** Compact label for tight UI (buttons, mobile) */
  shortLabel: string;
}

/** All official session types, in weekend order */
export const SESSION_FILTER_OPTIONS: SessionFilterOption[] = [
  { value: "Race", label: "Race", shortLabel: "Race" },
  { value: "Qualifying", label: "Qualifying", shortLabel: "Quali" },
  { value: "Sprint", label: "Sprint", shortLabel: "Sprint" },
  { value: "Sprint Qualifying", label: "Sprint Qualifying", shortLabel: "Sprint Quali" },
  { value: "Practice 1", label: "Practice 1", shortLabel: "FP1" },
  { value: "Practice 2", label: "Practice 2", shortLabel: "FP2" },
  { value: "Practice 3", label: "Practice 3", shortLabel: "FP3" },
];

/** Race + Quali + Sprint session types only (no practices) */
export const SESSION_FILTER_COMPETITIVE: SessionFilterOption[] =
  SESSION_FILTER_OPTIONS.filter((o) =>
    ["Race", "Qualifying", "Sprint", "Sprint Qualifying"].includes(o.value)
  );

/** Race + Sprint only — sessions with actual pit-stop strategy */
export const SESSION_FILTER_STRATEGY: SessionFilterOption[] =
  SESSION_FILTER_OPTIONS.filter((o) =>
    ["Race", "Sprint"].includes(o.value)
  );

/**
 * Filter sessions to only those that have already occurred,
 * matching the given `session_name`, sorted chronologically
 * (earliest first → most recent last).
 */
export function filterPastSessions<
  T extends { date_start: string; session_name: string }
>(sessions: T[], sessionName: string): T[] {
  const now = new Date();
  return sessions
    .filter(
      (s) => s.session_name === sessionName && new Date(s.date_start) <= now
    )
    .sort(
      (a, b) =>
        new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
    );
}

/**
 * Filter sessions that have already occurred (any type),
 * sorted chronologically (earliest first).
 */
export function filterAllPastSessions<
  T extends { date_start: string }
>(sessions: T[]): T[] {
  const now = new Date();
  return sessions
    .filter((s) => new Date(s.date_start) <= now)
    .sort(
      (a, b) =>
        new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
    );
}
