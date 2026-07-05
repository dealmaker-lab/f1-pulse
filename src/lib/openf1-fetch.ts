/**
 * Shared server-side OpenF1 fetch helper.
 *
 * OpenF1's free tier (since the July 2026 tier split) allows ~3 req/s and
 * 30 req/min per caller, and 429s beyond that. This wrapper:
 *   - spaces calls out inside a warm lambda instance (min-gap pacing),
 *   - honours Retry-After and retries a 429 once,
 *   - throws on any other non-OK status so routes can't parse error bodies
 *     as data.
 *
 * Serverless caveat: pacing is per-instance — concurrent invocations don't
 * coordinate. The 429 retry is the safety net for bursts across instances.
 */

const OPENF1_BASE = "https://api.openf1.org/v1";
const MIN_GAP_MS = 350; // ~3 req/s within one warm instance

let lastCallAt = 0;
let queue: Promise<void> = Promise.resolve();

function pace(): Promise<void> {
  const next = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  // Keep the chain alive even if a caller's fetch later throws.
  queue = next.catch(() => {});
  return next;
}

export interface OpenF1FetchOptions {
  /** Next.js ISR revalidate seconds; omit for no-store. */
  revalidate?: number;
}

export async function openf1Fetch<T = unknown>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  opts: OpenF1FetchOptions = {},
): Promise<T> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const qs = search.toString();
  const url = `${OPENF1_BASE}/${endpoint}${qs ? `?${qs}` : ""}`;
  const init: RequestInit & { next?: { revalidate: number } } =
    opts.revalidate !== undefined
      ? { next: { revalidate: opts.revalidate } }
      : { cache: "no-store" };

  await pace();
  let res = await fetch(url, init);

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get("retry-after") ?? "1");
    const delayMs = Math.min(5_000, Math.max(500, retryAfter * 1000));
    await new Promise((r) => setTimeout(r, delayMs));
    res = await fetch(url, init);
  }

  if (!res.ok) {
    throw new OpenF1Error(`OpenF1 ${endpoint} responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export class OpenF1Error extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenF1Error";
    this.status = status;
  }
}
