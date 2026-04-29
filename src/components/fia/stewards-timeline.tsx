"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Flag,
  Gavel,
  Mail,
  ShieldAlert,
} from "lucide-react";

/**
 * FIA Stewards' Verdicts timeline.
 *
 * Renders the documents returned by `/api/fia/documents` as a vertical
 * timeline of cards, color-coded by category (mirrors the race-control feed
 * conventions: decisions are red, reprimands amber, summons blue, other
 * neutral). When `highlightLap` is provided we sort documents that mention
 * that lap to the top — useful for syncing the timeline with a race replay
 * scrubber.
 */

interface FiaDocumentDto {
  title: string;
  pdfUrl: string;
  publishedAt: string;
  category: "decision" | "summons" | "reprimand" | "other";
  driverName?: string;
  lapNumber?: number;
  penalty?: string;
  infringementSnippet?: string;
}

interface Props {
  year: number;
  eventName: string;
  /** When set, documents tagged with this lap sort to the top and get a
   *  visual emphasis ring. Useful when wired to a race-replay scrubber. */
  highlightLap?: number;
  className?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ready"; docs: FiaDocumentDto[] };

const CATEGORY_STYLE: Record<
  FiaDocumentDto["category"],
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    label: string;
  }
> = {
  decision: {
    bg: "rgba(225,6,0,0.08)",
    text: "#e10600",
    border: "rgba(225,6,0,0.25)",
    icon: Gavel,
    label: "Decision",
  },
  reprimand: {
    bg: "rgba(255,201,6,0.08)",
    text: "#FFC906",
    border: "rgba(255,201,6,0.25)",
    icon: ShieldAlert,
    label: "Reprimand",
  },
  summons: {
    bg: "rgba(0,103,255,0.08)",
    text: "#5BA0FF",
    border: "rgba(91,160,255,0.25)",
    icon: Mail,
    label: "Summons",
  },
  other: {
    bg: "rgba(255,255,255,0.04)",
    text: "#A3A3A3",
    border: "rgba(255,255,255,0.1)",
    icon: FileText,
    label: "Document",
  },
};

export default function StewardsTimeline({
  year,
  eventName,
  highlightLap,
  className,
}: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    const params = new URLSearchParams({
      year: String(year),
      event: eventName,
    });
    fetch(`/api/fia/documents?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status=${res.status}`);
        return (await res.json()) as FiaDocumentDto[];
      })
      .then((docs) => {
        if (cancelled) return;
        if (!Array.isArray(docs) || docs.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        setState({ kind: "ready", docs });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [year, eventName]);

  // Apply highlight-lap sort when relevant. We re-derive on every render
  // (cheap — at most a few dozen docs) rather than caching in state.
  const sortedDocs = useMemo(() => {
    if (state.kind !== "ready") return [];
    if (!highlightLap) return state.docs;
    const matches = state.docs.filter((d) => d.lapNumber === highlightLap);
    const rest = state.docs.filter((d) => d.lapNumber !== highlightLap);
    return [...matches, ...rest];
  }, [state, highlightLap]);

  return (
    <div className={cn("glass-card p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Flag className="w-4 h-4 text-f1-red" />
        <span className="ferrari-label font-semibold">
          FIA Stewards · {eventName}
        </span>
        {state.kind === "ready" && (
          <span className="text-ferrari-micro font-mono text-f1-muted bg-[var(--f1-hover)] px-1.5 py-0.5 rounded-ferrari ml-auto">
            {state.docs.length}
          </span>
        )}
      </div>

      {state.kind === "loading" && <TimelineSkeleton />}
      {state.kind === "error" && (
        <p className="text-ferrari-caption text-f1-muted text-center py-4">
          FIA documents unavailable
        </p>
      )}
      {state.kind === "empty" && (
        <p className="text-ferrari-caption text-f1-muted text-center py-4">
          No FIA documents published yet
        </p>
      )}
      {state.kind === "ready" && (
        <div className="space-y-2">
          {sortedDocs.map((doc, i) => (
            <DocumentCard
              key={`${doc.pdfUrl}-${i}`}
              doc={doc}
              highlighted={!!highlightLap && doc.lapNumber === highlightLap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  highlighted,
}: {
  doc: FiaDocumentDto;
  highlighted: boolean;
}) {
  const style = CATEGORY_STYLE[doc.category];
  const Icon = style.icon;

  const time = doc.publishedAt
    ? new Date(doc.publishedAt).toLocaleString([], {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div
      className={cn(
        "rounded-ferrari-dialog px-3 py-2.5 transition-all duration-300",
        highlighted && "ring-2 ring-offset-0",
      )}
      style={{
        backgroundColor: style.bg,
        borderLeft: `2px solid ${style.border}`,
        // The ring color piggybacks on the category accent so the cue is
        // unmistakable when the user scrubs to a lap with verdicts.
        ...(highlighted ? { boxShadow: `0 0 0 2px ${style.border}` } : null),
      }}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className="w-4 h-4 flex-shrink-0 mt-0.5"
          style={{ color: style.text }}
        />
        <div className="flex-1 min-w-0">
          {/* Top row: category, lap, time, view-pdf link */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[9px] font-mono font-bold uppercase tracking-wider"
              style={{ color: style.text }}
            >
              {style.label}
            </span>
            {doc.lapNumber && (
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: style.border,
                  color: style.text,
                }}
              >
                LAP {doc.lapNumber}
              </span>
            )}
            <span className="text-[9px] font-mono text-f1-muted">{time}</span>
            <a
              href={doc.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-[10px] font-mono text-f1-muted hover:text-f1-sub transition-colors"
              aria-label={`Open ${doc.title} as PDF`}
            >
              View PDF
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Title + driver */}
          <p className="text-[12px] text-f1-sub leading-snug font-medium mb-0.5">
            {doc.title}
          </p>
          {doc.driverName && (
            <p className="text-[10px] font-mono text-f1-muted mb-1">
              {doc.driverName}
            </p>
          )}

          {/* Penalty pill + infringement snippet */}
          {(doc.penalty || doc.infringementSnippet) && (
            <div className="flex flex-col gap-1.5 mt-1.5">
              {doc.penalty && (
                <span
                  className="self-start text-[10px] font-mono font-bold px-2 py-0.5 rounded-ferrari inline-flex items-center gap-1"
                  style={{
                    backgroundColor: style.border,
                    color: style.text,
                  }}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {doc.penalty}
                </span>
              )}
              {doc.infringementSnippet && (
                <p className="text-[11px] text-f1-muted leading-relaxed line-clamp-3">
                  {doc.infringementSnippet}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 rounded-ferrari-dialog bg-[rgba(255,255,255,0.03)]"
        />
      ))}
    </div>
  );
}
