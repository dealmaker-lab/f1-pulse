/**
 * FIA Stewards' Verdicts scraper.
 *
 * Source: https://www.fia.com/documents/championships/fia-formula-one-world-championship-14
 *
 * The FIA listing page is server-rendered HTML. There is no public API. We
 * fetch the HTML and extract document links with a regex targeted at the
 * link/title/date markup the FIA portal uses today.
 *
 * IMPORTANT — assumed selectors / markup contract:
 *   - Each document is wrapped in a `<a class="document-row">…</a>` (newer
 *     layout) or `<a class="documents-document-link">…</a>` (older layout).
 *   - The title lives in a `<div class="title">…</div>` or
 *     `<span class="title">…</span>` immediately inside the link.
 *   - The published date lives in a sibling `<div class="date-display-single">`
 *     or `<span class="date">` element. Format is `dd.MM.yy HH:mm` in CET.
 *   - The PDF href is the link's `href`, prefixed with `/sites/default/...`
 *     (relative) — we resolve to an absolute URL.
 *
 * If the FIA changes its markup, this scraper will return zero documents and
 * the API route will surface an empty list — the UI degrades to its empty
 * state rather than crashing. We log a single warning so we know to update
 * the regex.
 *
 * Filtering: the listing is global (all events for the championship).
 * We can't query by event server-side (no public param), so we filter
 * client-side by checking that the document title or its grand-prix label
 * contains the requested event name.
 */

const FIA_LISTING_URL =
  "https://www.fia.com/documents/championships/fia-formula-one-world-championship-14";
const FIA_BASE = "https://www.fia.com";
const USER_AGENT = "f1-pulse/1.0";

/** Cap on PDF body size we will read. FIA decisions are typically <100 KB;
 *  guarding against an accidentally-huge file (or HTML returned in place
 *  of a PDF) keeps memory and parse time bounded. */
const MAX_PDF_BYTES = 2 * 1024 * 1024; // 2 MB

/** Cap on infringement snippet length. ~200 chars per spec. */
const SNIPPET_LEN = 200;

export interface FiaDocument {
  title: string;
  pdfUrl: string;
  /** ISO 8601 timestamp. We do best-effort parsing of FIA's `dd.MM.yy HH:mm`
   *  format; if parsing fails we fall back to "now" so the doc still sorts
   *  reasonably and the UI can render. */
  publishedAt: string;
  category: "decision" | "summons" | "reprimand" | "other";
  driverName?: string;
  lapNumber?: number;
  penalty?: string;
  infringementSnippet?: string;
}

/**
 * List FIA documents for a single event by scraping the FIA documents page.
 * Returned in reverse chronological order (newest first).
 *
 * The listing is a global feed for the championship; we filter to documents
 * whose title or surrounding context contains the requested event name
 * (case-insensitive).
 */
export async function listFiaDocuments(
  year: number,
  eventName: string,
): Promise<FiaDocument[]> {
  const eventLc = eventName.trim().toLowerCase();
  if (!eventLc) return [];

  let html: string;
  try {
    const res = await fetch(FIA_LISTING_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      // Cache on the Next.js side: the listing page changes slowly during a
      // race weekend (a handful of decisions per session). 1 hour is a
      // reasonable compromise — the route handler can layer its own cache.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.warn(
        `FIA listing fetch failed: status=${res.status} year=${year} event=${eventName}`,
      );
      return [];
    }
    html = await res.text();
  } catch (err) {
    // Network errors must not crash the caller; the UI handles `[]` as
    // "no documents yet".
    console.warn(
      "FIA listing fetch threw:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }

  const docs = extractDocuments(html);

  // Filter by event. The listing already groups by championship season,
  // so the `year` argument is currently advisory — we keep it in the
  // signature so callers can disambiguate and we can tighten the filter
  // later (e.g. if the FIA exposes a season query parameter). Today we
  // require only the event name to match (substring, case-insensitive).
  const yearStr = String(year);
  const filtered = docs.filter((d) => {
    const haystack = `${d.title} ${d.pdfUrl}`.toLowerCase();
    // Soft year hint: if the URL or title clearly references a *different*
    // year, drop the doc. Otherwise keep it.
    const otherYear = /\b(19|20)\d{2}\b/.exec(haystack)?.[0];
    if (otherYear && otherYear !== yearStr) return false;
    return haystack.includes(eventLc);
  });

  // Newest first. publishedAt is ISO so lexicographic compare is correct.
  filtered.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return filtered;
}

/**
 * Best-effort extraction of document rows from FIA listing HTML.
 *
 * Two markup variants are supported:
 *   1. `<a class="documents-document-link" href="…"> …<div class="title">… `
 *   2. `<div class="document-row"> <a href="…"> <div class="title">… `
 *
 * We use a lazy regex over each anchor block and pull title/href/date by
 * inner sub-regex. Anything we can't parse is skipped silently — we'd rather
 * surface 5 valid docs than crash the whole scrape on a single malformed row.
 */
function extractDocuments(html: string): FiaDocument[] {
  const out: FiaDocument[] = [];

  // Match anchor tags whose href ends in `.pdf`. This is the most stable
  // anchor in FIA's HTML — the surrounding wrapper class names have changed
  // multiple times historically, but PDF links are universally suffixed.
  const anchorRe =
    /<a\s+[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const inner = m[2];

    // Title: prefer an explicit class="title" element, fall back to the
    // last text node in the anchor (FIA sometimes inlines just the title).
    let title = "";
    const titleMatch =
      /<(?:div|span)[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i.exec(
        inner,
      );
    if (titleMatch) {
      title = stripTags(titleMatch[1]).trim();
    } else {
      title = stripTags(inner).trim();
    }
    if (!title) continue;

    // Date: look for a `dd.MM.yy HH:mm` pattern anywhere in the inner block.
    let publishedAt = new Date().toISOString();
    const dateMatch =
      /(\d{2})\.(\d{2})\.(\d{2,4})(?:[\s,]+(\d{2}):(\d{2}))?/.exec(inner);
    if (dateMatch) {
      const dd = parseInt(dateMatch[1], 10);
      const mm = parseInt(dateMatch[2], 10);
      const yy = parseInt(dateMatch[3], 10);
      const hh = dateMatch[4] ? parseInt(dateMatch[4], 10) : 12;
      const mi = dateMatch[5] ? parseInt(dateMatch[5], 10) : 0;
      const fullYear = yy < 100 ? 2000 + yy : yy;
      // Treat the FIA timestamp as CET — close enough for sort ordering;
      // we don't display this directly. Using UTC constructor avoids
      // server-tz drift (Vercel runs UTC; a developer on PST would parse
      // differently otherwise).
      const ts = new Date(
        Date.UTC(fullYear, mm - 1, dd, hh, mi),
      ).toISOString();
      if (!Number.isNaN(new Date(ts).getTime())) {
        publishedAt = ts;
      }
    }

    out.push({
      title,
      pdfUrl: resolveUrl(href),
      publishedAt,
      ...classifyTitle(title),
    });
  }

  return out;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function resolveUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${FIA_BASE}${href}`;
  return `${FIA_BASE}/${href}`;
}

/**
 * Pull the document category and driver name out of the title. FIA titles
 * are highly conventional, e.g.:
 *   "Decision - Car 1 - Forcing another driver off"
 *   "Decision - Car 44 (Lewis Hamilton)"
 *   "Summons - Car 16 (Charles Leclerc)"
 *   "Reprimand - Car 4"
 */
function classifyTitle(title: string): {
  category: FiaDocument["category"];
  driverName?: string;
} {
  const t = title.toLowerCase();
  let category: FiaDocument["category"] = "other";
  if (t.includes("decision")) category = "decision";
  else if (t.includes("summons")) category = "summons";
  else if (t.includes("reprimand")) category = "reprimand";

  // Driver name: parenthetical "(First Last)" is the cleanest signal.
  const parenMatch = /\(([^)]+)\)/.exec(title);
  let driverName: string | undefined;
  if (parenMatch) {
    const candidate = parenMatch[1].trim();
    // Reject obvious non-name parentheticals like "(2 of 2)" or "(Final)".
    if (/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(candidate)) {
      driverName = candidate;
    }
  }

  return { category, driverName };
}

/**
 * Best-effort PDF enrichment. Downloads the PDF, extracts text via
 * `pdf-parse`, and pulls lap number / penalty / infringement snippet.
 *
 * If anything fails (fetch error, PDF parse error, missing pdf-parse module),
 * we return the input doc unchanged. The caller MUST treat enrichment as
 * advisory.
 */
export async function enrichWithPdf(doc: FiaDocument): Promise<FiaDocument> {
  let buf: Uint8Array;
  try {
    const res = await fetch(doc.pdfUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/pdf" },
      // PDFs are immutable once published — cache aggressively.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return doc;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_PDF_BYTES) return doc;
    buf = new Uint8Array(ab);
  } catch {
    return doc;
  }

  let text: string;
  try {
    // Lazy-load pdf-parse — it's only needed at request time, and a missing
    // module shouldn't fail-open the whole route. pdf-parse ships no types,
    // so we go through `unknown` to avoid pulling in a missing-type dependency.
    type PdfParseFn = (b: Buffer) => Promise<{ text?: string }>;
    type PdfParseMod = PdfParseFn & { default?: PdfParseFn };
    const mod = (await (
      import("pdf-parse" as string) as Promise<unknown>
    ).catch(() => null)) as PdfParseMod | null;
    if (!mod) return doc;
    const pdfParse: PdfParseFn = mod.default ?? mod;
    const result = await pdfParse(Buffer.from(buf));
    text = typeof result?.text === "string" ? result.text : "";
    if (!text) return doc;
  } catch {
    return doc;
  }

  const enriched: FiaDocument = { ...doc };

  // Lap number — first occurrence of "Lap N" / "lap N" wins. Capped at 99
  // to reject garbage matches like "Lap 999" from boilerplate.
  const lapMatch = /\b[Ll]ap\s+(\d{1,2})\b/.exec(text);
  if (lapMatch) {
    const n = parseInt(lapMatch[1], 10);
    if (n >= 1 && n <= 99) enriched.lapNumber = n;
  }

  // Penalty — match canonical penalty phrases in priority order.
  const penaltyPatterns: Array<[RegExp, string]> = [
    [/\bdrive[- ]through\s+penalty\b/i, "Drive-through penalty"],
    [/\bstop[\s/]and[\s/]?go(?:\s+penalty)?\b/i, "Stop-and-go penalty"],
    [/\b(\d+)\s*[- ]?second(?:s)?\s+time\s+penalty\b/i, ""], // captured below
    [/\bdrop\s+(\d+)\s+(?:grid\s+)?positions?\b/i, ""],
    [/\bgrid\s+drop\b/i, "Grid drop"],
    [/\breprimand\b/i, "Reprimand"],
    [/\bdisqualifi(?:ed|cation)\b/i, "Disqualification"],
    [/\bwarning\b/i, "Warning"],
  ];
  for (const [re, label] of penaltyPatterns) {
    const pm = re.exec(text);
    if (!pm) continue;
    if (label) {
      enriched.penalty = label;
    } else if (re.source.includes("second")) {
      enriched.penalty = `${pm[1]} second time penalty`;
    } else if (re.source.includes("position")) {
      enriched.penalty = `${pm[1]}-place grid penalty`;
    }
    break;
  }

  // Infringement snippet — find the "Infringement" or "Incident" section
  // header and grab the next ~200 chars of text. FIA decisions almost
  // always have one of these labels.
  const infringementMatch =
    /(?:Infringement|Incident|Offence|Facts)[\s:.\-—]+([\s\S]+?)(?:\n\n|$)/i.exec(
      text,
    );
  if (infringementMatch) {
    const snip = infringementMatch[1].replace(/\s+/g, " ").trim();
    enriched.infringementSnippet = snip.slice(0, SNIPPET_LEN);
  }

  return enriched;
}
