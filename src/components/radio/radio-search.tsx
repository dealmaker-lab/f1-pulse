"use client";

import { useEffect, useState, useRef } from "react";
import { Search, Loader2, X, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  sessionKey: number;
}

interface SearchResult {
  driver_number: number;
  date: string;
  recording_url: string;
  text: string;
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  count: number;
  total_searched: number;
  total_available?: number;
  remaining: number;
  error?: string;
}

type ViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; data: SearchResponse }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

const DEBOUNCE_MS = 500;
// Mirror the API server-side validation so users get instant feedback.
// ASCII-only — \p{L}/\p{N} unicode classes require ES6 target.
const QUERY_PATTERN = /^[a-zA-Z0-9 '\-]*$/;
const MAX_QUERY_LEN = 200;

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Highlight every (case-insensitive) occurrence of `query` inside `text`. */
function renderSnippet(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lowerText.indexOf(lowerQuery, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={key++}
        className="bg-racing-red/30 text-f1 px-0.5 rounded"
      >
        {text.slice(idx, idx + lowerQuery.length)}
      </mark>,
    );
    i = idx + lowerQuery.length;
  }
  return parts;
}

export default function RadioSearch({ sessionKey }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Cancel in-flight search if query changes or component unmounts
  const abortRef = useRef<AbortController | null>(null);

  // Debounce typed query into `debounced`
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // Reset everything when session changes
  useEffect(() => {
    setQuery("");
    setDebounced("");
    setView({ kind: "idle" });
    setValidationError(null);
  }, [sessionKey]);

  // Run search when debounced query updates
  useEffect(() => {
    if (!debounced) {
      setView({ kind: "idle" });
      return;
    }
    if (debounced.length > MAX_QUERY_LEN) {
      setValidationError(`Query too long (max ${MAX_QUERY_LEN} chars)`);
      return;
    }
    if (!QUERY_PATTERN.test(debounced)) {
      setValidationError("Query contains invalid characters");
      return;
    }
    setValidationError(null);

    // Cancel previous request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setView({ kind: "loading" });

    fetch(
      `/api/radio/search?session_key=${sessionKey}&q=${encodeURIComponent(debounced)}`,
      { signal: ctrl.signal },
    )
      .then(async (res) => {
        if (res.status === 503) {
          setView({ kind: "unavailable" });
          return;
        }
        const data: SearchResponse = await res.json();
        if (!res.ok) {
          setView({
            kind: "error",
            message: data?.error || `Search failed (${res.status})`,
          });
          return;
        }
        setView({ kind: "results", data });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setView({ kind: "error", message: "Network error" });
      });

    return () => ctrl.abort();
  }, [debounced, sessionKey]);

  const handleClear = () => {
    setQuery("");
    setDebounced("");
    setView({ kind: "idle" });
    setValidationError(null);
  };

  return (
    <div className="glass-card p-3 sm:p-4 mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-racing-red" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-f1">
          Radio Transcript Search
        </span>
      </div>
      <p className="text-[11px] text-f1-muted mb-3 leading-relaxed">
        Search transcriptions of all team radio for this session
        (e.g., &ldquo;tyres&rdquo;, &ldquo;box&rdquo;, &ldquo;penalty&rdquo;).
      </p>

      {/* Input */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={MAX_QUERY_LEN + 50}
          placeholder="Search radio messages..."
          className="w-full pl-8 pr-8 py-2 text-sm rounded-lg border border-[var(--f1-border)] bg-[var(--f1-card)] text-f1 placeholder:text-f1-muted focus:outline-none focus:border-racing-red/50 transition"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5 text-f1-muted hover:text-f1" />
          </button>
        )}
      </div>

      {validationError && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-400 mb-2">
          <AlertCircle className="w-3 h-3" />
          {validationError}
        </div>
      )}

      {/* Results / states */}
      {view.kind === "loading" && (
        <div className="flex items-center gap-2 py-3 text-f1-muted text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Transcribing & searching radio...
        </div>
      )}

      {view.kind === "unavailable" && (
        <div className="flex items-center gap-2 py-3 text-f1-muted text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          Transcription not configured. Set OPENAI_API_KEY to enable search.
        </div>
      )}

      {view.kind === "error" && (
        <div className="flex items-center gap-2 py-3 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          {view.message}
        </div>
      )}

      {view.kind === "results" && (
        <div>
          <div className="flex items-center gap-2 mb-2 text-[11px] text-f1-muted">
            <span>
              <span className="font-bold text-f1">{view.data.count}</span> match
              {view.data.count === 1 ? "" : "es"} in {view.data.total_searched} radios
            </span>
            {view.data.remaining > 0 && (
              <span className="ml-auto">
                +{view.data.remaining} not searched (cost limit)
              </span>
            )}
          </div>

          {view.data.count === 0 ? (
            <div className="text-f1-muted text-xs py-3 text-center max-w-md mx-auto leading-relaxed">
              Team radio coverage was reduced significantly in 2026 — most race
              weekends have no published audio. Try a 2023-2025 session for
              richer data.
            </div>
          ) : (
            <ul className="space-y-2">
              {view.data.results.map((r) => (
                <li
                  key={`${r.date}-${r.driver_number}-${r.recording_url}`}
                  className={cn(
                    "rounded-lg border p-3 bg-[var(--f1-card)]",
                    "border-[var(--f1-border)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-bold text-f1">
                        Driver #{r.driver_number}
                      </span>
                      <span className="text-f1-muted font-mono">
                        {formatTime(r.date)}
                      </span>
                      {r.score === 1 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-racing-red bg-racing-red/10 px-1.5 py-0.5 rounded">
                          Exact
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-f1 leading-relaxed mb-2">
                    &ldquo;{renderSnippet(r.text, debounced)}&rdquo;
                  </p>

                  <audio
                    controls
                    src={r.recording_url}
                    preload="none"
                    className="w-full h-8"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
