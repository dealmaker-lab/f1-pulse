"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquare, X, Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Who leads the 2026 championship?",
  "Compare Hamilton vs Verstappen this season",
  "What were the pit strategies at the last race?",
  "Show me the constructor standings",
];

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }

  function handleSuggestion(text: string) {
    sendMessage({ text });
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer shadow-lg",
          isOpen
            ? "bg-[var(--f1-card)] border border-[var(--f1-border)] hover:border-[#e10600]/30"
            : "bg-[#e10600] hover:bg-[#cc0500] hover:shadow-[0_0_20px_rgba(225,6,0,0.3)]"
        )}
        aria-label={isOpen ? "Close chat" : "Open F1 AI chat"}
      >
        {isOpen ? (
          <X className="w-5 h-5 text-[var(--f1-text-sub)]" />
        ) : (
          <MessageSquare className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-20 right-6 z-50 w-[380px] max-h-[560px] flex flex-col rounded-xl border border-[var(--f1-border)] shadow-2xl transition-all duration-300 origin-bottom-right",
          "bg-[var(--f1-card)]",
          isOpen
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-4 pointer-events-none"
        )}
        style={{
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--f1-border)]">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#e10600]/10 border border-[#e10600]/20">
            <Sparkles className="w-3.5 h-3.5 text-[#e10600]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="text-xs font-bold uppercase tracking-wider text-[var(--f1-text)]"
              style={{ fontFamily: "Titillium Web, sans-serif" }}
            >
              F1 Pulse AI
            </span>
            <span className="text-[9px] text-[var(--f1-text-dim)]">
              Ask anything about F1 data
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[300px] max-h-[400px]">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p
                className="text-xs text-[var(--f1-text-dim)] text-center pt-4"
                style={{ fontFamily: "Titillium Web, sans-serif" }}
              >
                Try asking about F1 data:
              </p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--f1-text-sub)] border border-[var(--f1-border)] hover:border-[#e10600]/20 hover:bg-[var(--f1-hover)] transition-colors cursor-pointer"
                    style={{ fontFamily: "Titillium Web, sans-serif" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "animate-fade-in",
                  message.role === "user" ? "flex justify-end" : ""
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                    message.role === "user"
                      ? "bg-[#e10600]/10 border border-[#e10600]/20 text-[var(--f1-text)]"
                      : "bg-[var(--f1-hover)] text-[var(--f1-text)]"
                  )}
                  style={{ fontFamily: "Titillium Web, sans-serif" }}
                >
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <div key={`${message.id}-${index}`} className="whitespace-pre-wrap">
                          {part.text}
                        </div>
                      );
                    }
                    if (part.type?.startsWith("tool-")) {
                      return (
                        <div
                          key={`${message.id}-${index}`}
                          className="flex items-center gap-1.5 text-[10px] text-[var(--f1-text-dim)] py-1"
                        >
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Querying F1 data...
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-2 text-[10px] text-[var(--f1-text-dim)]">
              <Loader2 className="w-3 h-3 animate-spin text-[#e10600]" />
              <span style={{ fontFamily: "Titillium Web, sans-serif" }}>Analyzing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--f1-border)]"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about F1 data..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-xs text-[var(--f1-text)] placeholder:text-[var(--f1-text-dim)] outline-none disabled:opacity-50"
            style={{ fontFamily: "Titillium Web, sans-serif" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#e10600] hover:bg-[#cc0500] disabled:opacity-30 disabled:hover:bg-[#e10600] transition-colors cursor-pointer"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </form>
      </div>
    </>
  );
}
