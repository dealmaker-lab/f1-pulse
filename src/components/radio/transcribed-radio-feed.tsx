"use client";

import { useEffect, useState, useCallback } from "react";
import { Radio, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RadioMessage {
  date: string;
  driverNumber: number;
  driverCode: string;
  driverName: string;
  team: string;
  teamColor: string;
  recordingUrl: string;
}

interface Props {
  sessionKey: number;
  className?: string;
}

type TranscribeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; text: string; cached: boolean }
  | { status: "error"; message: string }
  | { status: "unavailable" };

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function TranscribedRadioFeed({ sessionKey, className }: Props) {
  const [messages, setMessages] = useState<RadioMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [transcripts, setTranscripts] = useState<Record<string, TranscribeState>>({});

  // Fetch radio list for this session
  useEffect(() => {
    if (!sessionKey) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setTranscripts({});

    fetch(`/api/f1/radio?session_key=${sessionKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.messages)) setMessages(data.messages);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  const transcribe = useCallback(async (recordingUrl: string) => {
    setTranscripts((prev) => ({ ...prev, [recordingUrl]: { status: "loading" } }));
    try {
      const res = await fetch(
        `/api/radio/transcribe?url=${encodeURIComponent(recordingUrl)}`,
      );

      if (res.status === 503) {
        setTranscripts((prev) => ({
          ...prev,
          [recordingUrl]: { status: "unavailable" },
        }));
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setTranscripts((prev) => ({
          ...prev,
          [recordingUrl]: {
            status: "error",
            message: data?.error || `Failed (${res.status})`,
          },
        }));
        return;
      }

      setTranscripts((prev) => ({
        ...prev,
        [recordingUrl]: {
          status: "ok",
          text: data.text || "(empty transcription)",
          cached: !!data.cached,
        },
      }));
    } catch {
      setTranscripts((prev) => ({
        ...prev,
        [recordingUrl]: { status: "error", message: "Network error" },
      }));
    }
  }, []);

  if (loading) {
    return (
      <div className={cn("glass-card p-6 flex items-center justify-center gap-3", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-racing-red" />
        <span className="text-f1-sub text-sm">Loading radio feed...</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn("glass-card p-6 flex flex-col items-center gap-2", className)}>
        <Radio className="w-5 h-5 text-f1-muted" />
        <span className="text-f1-sub text-sm">No radio messages for this session</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {messages.map((msg) => {
        const state = transcripts[msg.recordingUrl] ?? { status: "idle" };
        return (
          <div
            key={`${msg.date}-${msg.driverNumber}`}
            className="glass-card p-3 sm:p-4"
            style={{ borderLeft: `2px solid ${msg.teamColor}` }}
          >
            {/* Header: driver + time */}
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                  style={{ backgroundColor: msg.teamColor }}
                >
                  {msg.driverCode}
                </span>
                <span className="text-f1 text-sm font-semibold truncate">
                  {msg.driverName}
                </span>
              </div>
              <span className="text-[10px] font-mono text-f1-muted flex-shrink-0">
                {formatTime(msg.date)}
              </span>
            </div>

            {/* Audio player */}
            <audio
              controls
              src={msg.recordingUrl}
              preload="none"
              className="w-full h-9 mb-2"
            />

            {/* Transcribe button + state */}
            <div className="flex items-start gap-2 flex-wrap">
              {state.status === "idle" && (
                <button
                  onClick={() => transcribe(msg.recordingUrl)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-racing-red/10 text-racing-red border border-racing-red/30 hover:bg-racing-red/20 transition cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  Transcribe
                </button>
              )}
              {state.status === "loading" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-f1-muted">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Transcribing...
                </span>
              )}
              {state.status === "unavailable" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-f1-muted">
                  <AlertCircle className="w-3 h-3" />
                  Transcription not configured
                </span>
              )}
              {state.status === "error" && (
                <div className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-red-400">
                    <AlertCircle className="w-3 h-3" />
                    {state.message}
                  </span>
                  <button
                    onClick={() => transcribe(msg.recordingUrl)}
                    className="text-[11px] text-racing-red hover:underline cursor-pointer self-start"
                  >
                    Retry
                  </button>
                </div>
              )}
              {state.status === "ok" && (
                <div className="w-full">
                  <p className="text-sm text-f1 leading-relaxed">
                    &ldquo;{state.text}&rdquo;
                  </p>
                  {state.cached && (
                    <span className="text-[9px] text-f1-muted uppercase tracking-wider mt-1 inline-block">
                      cached
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
