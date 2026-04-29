import { NextRequest, NextResponse } from "next/server";
import {
  enrichWithPdf,
  listFiaDocuments,
  type FiaDocument,
} from "@/lib/fia-scraper";
import { sanitizeError, validateYear } from "@/lib/api-validation";

/**
 * GET /api/fia/documents?year=2026&event=Monaco
 *
 * Returns FIA stewards' documents (decisions, summons, reprimands) for the
 * given event, ordered newest-first. Each document is best-effort enriched
 * with lap number, penalty type, and an infringement snippet from the PDF.
 *
 * The route caches at the Next.js layer for 1 hour. PDF enrichment is
 * fanned out in parallel but capped at 10 documents to keep latency under
 * the Vercel function timeout.
 *
 * Response shape (200): FiaDocument[]
 * Errors: 400 on bad params, 502 on upstream failure.
 */

export const revalidate = 3600;

/** Max number of PDFs we'll try to enrich per request. The FIA listing for
 *  a busy weekend (e.g. Monaco with multiple incidents) can return 30+
 *  documents; pulling and parsing every PDF would blow the function
 *  timeout. The remainder are returned with title/link only. */
const ENRICH_CAP = 10;

/** Permissive event-name validator: letters, digits, spaces, hyphens.
 *  Rejects anything that could be used to inject upstream URL fragments. */
function validateEventName(val: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return null;
  if (!/^[A-Za-z0-9\s\-]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function GET(req: NextRequest) {
  const yearRaw = req.nextUrl.searchParams.get("year");
  const eventRaw = req.nextUrl.searchParams.get("event");

  const currentYear = new Date().getFullYear();
  const year = validateYear(yearRaw, currentYear);
  if (yearRaw !== null && String(year) !== yearRaw.trim()) {
    // validateYear silently falls back; surface that as a 400 if the caller
    // passed something explicit and invalid.
    return NextResponse.json(
      { error: "Valid `year` (1950..currentYear+1) required" },
      { status: 400 },
    );
  }

  const event = validateEventName(eventRaw);
  if (!event) {
    return NextResponse.json(
      { error: "Valid `event` (alphanumeric, spaces, 2-50 chars) required" },
      { status: 400 },
    );
  }

  let docs: FiaDocument[];
  try {
    docs = await listFiaDocuments(year, event);
  } catch (err) {
    console.error("FIA listing error:", sanitizeError(err));
    return NextResponse.json(
      { error: "FIA documents unavailable" },
      { status: 502 },
    );
  }

  if (docs.length === 0) {
    return NextResponse.json([]);
  }

  // Enrich the first ENRICH_CAP docs in parallel. Anything beyond the cap
  // returns as-is (title + link only) — the UI degrades gracefully and the
  // user can still click through to the source PDF.
  const head = docs.slice(0, ENRICH_CAP);
  const tail = docs.slice(ENRICH_CAP);
  const enrichedHead = await Promise.all(
    head.map((d) =>
      enrichWithPdf(d).catch(() => d), // never let one bad PDF poison the batch
    ),
  );

  return NextResponse.json([...enrichedHead, ...tail]);
}
