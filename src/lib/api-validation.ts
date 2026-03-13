/**
 * Shared API route validation and sanitization utilities.
 * Prevents parameter injection and enforces strict input types.
 */

/** Validate a session_key: must be a positive integer */
export function validateSessionKey(val: string | null): number | null {
  if (!val) return null;
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0 || String(num) !== val.trim()) return null;
  return num;
}

/** Validate a driver_number: must be a positive integer (typically 1-99) */
export function validateDriverNumber(val: string | null): number | null {
  if (!val) return null;
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0 || num > 999 || String(num) !== val.trim()) return null;
  return num;
}

/** Validate a year: must be between 1950 and current year + 1 */
export function validateYear(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const num = parseInt(val, 10);
  const maxYear = new Date().getFullYear() + 1;
  if (isNaN(num) || num < 1950 || num > maxYear) return fallback;
  return num;
}

/**
 * Validate a driver code: must be 2-4 uppercase letters,
 * or a driverId (lowercase letters + underscores, max 50 chars).
 */
export function validateDriverCode(val: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  // 2-4 letter uppercase code (e.g. VER, HAM, NOR)
  if (/^[A-Z]{2,4}$/.test(trimmed)) return trimmed;
  // driverId format (e.g. max_verstappen) — lowercase, underscores, max 50 chars
  if (/^[a-z][a-z0-9_]{0,49}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Validate a circuit identifier: alphanumeric + underscores/hyphens, max 100 chars.
 */
export function validateCircuitId(val: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (/^[a-zA-Z0-9_-]{1,100}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Sanitize error output — strip internal API URLs and stack traces.
 * Use this when logging errors in API responses.
 */
export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    // Strip any URLs from the message to prevent leaking internal API structure
    return err.message.replace(/https?:\/\/[^\s)]+/g, "[REDACTED_URL]");
  }
  return "An unexpected error occurred";
}
