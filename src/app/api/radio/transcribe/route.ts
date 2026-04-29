import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-validation";
import { auth } from "@clerk/nextjs/server";

// Whisper transcription needs Node runtime — Edge runtime body limit is 4MB,
// but radio mp3s plus form-data overhead can exceed that. Node also gives us
// generous timeouts and full FormData support.
export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_URL_PREFIX = "https://livetiming.formula1.com/static/";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const FETCH_TIMEOUT_MS = 60_000;

/**
 * In-memory cache keyed by recording_url. Lifetime is one Vercel function
 * instance — fine for our cost goals: F1 radio URLs are stable per session,
 * so a warm instance during a browse session avoids re-paying the Whisper bill.
 * On cold start the cache is empty; that's the worst case and still cheap.
 */
interface CachedTranscription {
  text: string;
  durationSec: number | null;
}
const cache = new Map<string, CachedTranscription>();

/** Fetch with an AbortController-based timeout (cross-runtime safe). */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  // Auth gate: Whisper costs money. Anonymous callers cannot trigger billing.
  // Authenticated users via Clerk only.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "url parameter required" },
      { status: 400 },
    );
  }

  // Strict allow-list — prevents using this endpoint as an open SSRF gateway
  // or as a free Whisper proxy for arbitrary mp3s.
  if (!url.startsWith(ALLOWED_URL_PREFIX)) {
    return NextResponse.json(
      { error: "Only OpenF1/livetiming.formula1.com URLs are allowed" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Transcription not configured" },
      { status: 503 },
    );
  }

  // Cache hit
  const cached = cache.get(url);
  if (cached) {
    return NextResponse.json({
      text: cached.text,
      durationSec: cached.durationSec,
      cached: true,
    });
  }

  try {
    // 1. Pull mp3 bytes from livetiming
    const audioRes = await fetchWithTimeout(
      url,
      { cache: "no-store" },
      FETCH_TIMEOUT_MS,
    );
    if (!audioRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch audio (${audioRes.status})` },
        { status: 502 },
      );
    }
    const audioBuf = await audioRes.arrayBuffer();
    if (audioBuf.byteLength === 0) {
      return NextResponse.json(
        { error: "Empty audio file" },
        { status: 502 },
      );
    }

    // 2. Hand to Whisper as multipart/form-data. globalThis.FormData/Blob are
    //    available in Node 18+ (Vercel default).
    const form = new FormData();
    const blob = new Blob([audioBuf], { type: "audio/mpeg" });
    form.append("file", blob, "radio.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "json");

    const whisperRes = await fetchWithTimeout(
      OPENAI_ENDPOINT,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
      FETCH_TIMEOUT_MS,
    );

    if (!whisperRes.ok) {
      // Sanitized log — never echo OpenAI's raw error body to the client; it
      // can include request IDs / hints that don't belong in our surface.
      const bodyText = await whisperRes.text().catch(() => "");
      console.error(
        `[transcribe] whisper ${whisperRes.status}:`,
        bodyText.slice(0, 200),
      );
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 502 },
      );
    }

    const data = (await whisperRes.json()) as {
      text?: string;
      duration?: number;
    };
    const text = (data.text ?? "").trim();
    const durationSec = typeof data.duration === "number" ? data.duration : null;

    cache.set(url, { text, durationSec });

    return NextResponse.json({ text, durationSec, cached: false });
  } catch (err) {
    // AbortError → 504; everything else → 502
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Transcription timed out" },
        { status: 504 },
      );
    }
    console.error("[transcribe] error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 502 },
    );
  }
}
