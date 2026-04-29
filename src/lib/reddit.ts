/**
 * Reddit API client for fetching r/formula1 race-discussion threads and
 * their comment timestamps. Used to power the fan-reaction comment-volume
 * visualization.
 *
 * Auth strategy: prefer OAuth (script flow) when REDDIT_CLIENT_ID and
 * REDDIT_CLIENT_SECRET are set in the environment — Reddit's anonymous
 * rate limit (~60 req/min/IP) is shared across all unauthenticated callers
 * on the same egress IP, which on Vercel means we'd compete with every
 * other tenant. With OAuth we get a per-app 100 req/min budget.
 *
 * If creds are missing we gracefully fall back to unauthenticated reads
 * against www.reddit.com — same JSON shape, just lower rate limits and
 * different host.
 *
 * We never persist the OAuth token to disk; it lives in module-scoped
 * memory for the ~1h Reddit gives us, refreshed on demand.
 */

const USER_AGENT = "f1-pulse/1.0 (by /u/anonymous)";

// www.reddit.com — anonymous reads.
// oauth.reddit.com — required base for bearer-token reads.
const PUBLIC_HOST = "https://www.reddit.com";
const OAUTH_HOST = "https://oauth.reddit.com";

const SEARCH_WINDOW_MS = 48 * 60 * 60 * 1000; // ±48h around race start
const MAX_REPLY_DEPTH = 5;

// Module-scoped token cache. Reddit script-flow tokens last 3600s; we
// expire ours 60s early to give the next request a comfortable margin.
interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

interface RedditPostData {
  id: string;
  title: string;
  created_utc: number;
  permalink: string;
}

interface RedditSearchResponse {
  data?: {
    children?: Array<{ data?: RedditPostData }>;
  };
}

interface RedditCommentData {
  created_utc?: number;
  replies?:
    | string
    | {
        data?: {
          children?: Array<RedditCommentChild>;
        };
      };
}

interface RedditCommentChild {
  kind?: string;
  data?: RedditCommentData;
}

interface RedditCommentsListing {
  data?: {
    children?: Array<RedditCommentChild>;
  };
}

/**
 * Get an OAuth bearer token via Reddit's script-flow.
 * Returns null if creds aren't configured — callers should fall back to
 * the unauthenticated path. Cached in module memory until ~60s before
 * expiry. Never persisted.
 */
// In-flight latch — collapses N concurrent cold-start callers onto a single
// Reddit token request so we don't get rate-limited issuing duplicate tokens.
let inflightTokenFetch: Promise<string | null> | null = null;

async function getAuthToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }

  // Concurrent callers all await the same in-flight fetch; first one to
  // arrive triggers the network call.
  if (inflightTokenFetch) return inflightTokenFetch;

  inflightTokenFetch = (async (): Promise<string | null> => {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = new URLSearchParams({ grant_type: "client_credentials" });

    try {
      const res = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: body.toString(),
        cache: "no-store",
      });

      if (!res.ok) {
        console.error(`Reddit OAuth token fetch failed: status=${res.status}`);
        return null;
      }

      const json = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!json.access_token) return null;

      const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
      cachedToken = {
        token: json.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      return cachedToken.token;
    } catch (err) {
      console.error("Reddit OAuth token fetch error:", err);
      return null;
    } finally {
      inflightTokenFetch = null;
    }
  })();

  return inflightTokenFetch;
}

/**
 * Run a Reddit GET against either oauth.reddit.com (with bearer) or
 * www.reddit.com (anonymous). The path must include leading slash and
 * `.json` suffix — caller decides.
 *
 * Always sets the custom User-Agent — Reddit returns 429 for blank/default
 * UAs and rate-limits more aggressively for the JS Node default.
 */
async function redditFetch(
  path: string,
  query: Record<string, string>,
  revalidateSeconds: number,
): Promise<unknown> {
  const token = await getAuthToken();
  const host = token ? OAUTH_HOST : PUBLIC_HOST;

  const url = new URL(path, host);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  // raw_json=1 prevents Reddit from HTML-escaping &, <, > in titles —
  // we don't render the title as HTML, but the un-escaped form is what
  // most clients expect and what we'd want for any future text matching.
  url.searchParams.set("raw_json", "1");

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    headers,
    next: { revalidate: revalidateSeconds },
  });

  if (!res.ok) {
    throw new Error(`Reddit upstream ${res.status} for ${path}`);
  }
  return res.json();
}

/**
 * Find race-discussion threads for a given race.
 * @param raceTitle - e.g., "Monaco Grand Prix" — substring used in Reddit search
 * @param dateStart - ISO datetime; only threads created within ±48h of this are returned
 */
export async function findRaceThread(
  raceTitle: string,
  dateStart: string,
): Promise<{ id: string; title: string; created: number; permalink: string } | null> {
  const startMs = new Date(dateStart).getTime();
  if (!Number.isFinite(startMs)) {
    throw new Error(`findRaceThread: invalid dateStart "${dateStart}"`);
  }

  // Reddit's search is title-biased when restrict_sr=1 and the query is
  // unquoted. Combining "Race Discussion" with the race title biases hits
  // toward the official thread (e.g., "Race Discussion: 2025 Monaco GP").
  const q = `Race Discussion ${raceTitle}`.trim();

  const json = (await redditFetch(
    "/r/formula1/search.json",
    {
      q,
      restrict_sr: "1",
      sort: "new",
      limit: "10",
      // type=link drops user/profile noise.
      type: "link",
    },
    600,
  )) as RedditSearchResponse;

  const children = json.data?.children ?? [];
  if (children.length === 0) return null;

  const startWindow = startMs - SEARCH_WINDOW_MS;
  const endWindow = startMs + SEARCH_WINDOW_MS;

  // Pick the candidate closest to the race start, restricted to ±48h.
  // Sorting by "new" alone would pick the most recent matching thread,
  // which is wrong if the user is asking about a past race.
  let best: RedditPostData | null = null;
  let bestDelta = Infinity;
  for (const child of children) {
    const data = child.data;
    if (!data || !data.id || !data.title) continue;
    const createdMs = (data.created_utc ?? 0) * 1000;
    if (createdMs < startWindow || createdMs > endWindow) continue;
    const delta = Math.abs(createdMs - startMs);
    if (delta < bestDelta) {
      best = data;
      bestDelta = delta;
    }
  }

  if (!best) return null;
  return {
    id: best.id,
    title: best.title,
    created: best.created_utc,
    permalink: best.permalink,
  };
}

/**
 * Walk a comment tree and push every comment's created_utc into `out`.
 * Bounded by MAX_REPLY_DEPTH so a deeply nested troll-chain can't blow
 * the stack or starve the response budget.
 */
function collectTimestamps(
  children: Array<RedditCommentChild> | undefined,
  out: number[],
  depth: number,
): void {
  if (!children || depth > MAX_REPLY_DEPTH) return;
  for (const child of children) {
    // kind === "more" is the "load more comments" stub; it has no created_utc.
    if (child.kind !== "t1") continue;
    const data = child.data;
    if (!data) continue;
    const ts = data.created_utc;
    if (typeof ts === "number" && Number.isFinite(ts)) {
      out.push(ts);
    }
    // replies is "" (empty string) when there are no replies — Reddit's
    // API quirks. Only recurse into the object form.
    const replies = data.replies;
    if (replies && typeof replies === "object") {
      collectTimestamps(replies.data?.children, out, depth + 1);
    }
  }
}

/**
 * Fetch all comments for a thread, return timestamp of each comment.
 * Returns sorted-ascending array of unix-second timestamps.
 */
export async function fetchCommentTimestamps(threadId: string): Promise<number[]> {
  // Validate to keep the path safe — Reddit IDs are base36, very short.
  if (!/^[a-z0-9]{1,12}$/i.test(threadId)) {
    throw new Error(`fetchCommentTimestamps: invalid threadId "${threadId}"`);
  }

  const json = (await redditFetch(
    `/comments/${threadId}.json`,
    { limit: "500", depth: String(MAX_REPLY_DEPTH) },
    300,
  )) as unknown;

  // Comments endpoint returns [postListing, commentsListing] — a tuple,
  // not an object. Be defensive about the shape since this is the most
  // load-bearing assumption in the whole module.
  if (!Array.isArray(json) || json.length < 2) {
    return [];
  }
  const commentsListing = json[1] as RedditCommentsListing;
  const out: number[] = [];
  collectTimestamps(commentsListing.data?.children, out, 0);
  out.sort((a, b) => a - b);
  return out;
}
