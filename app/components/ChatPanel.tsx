"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Video, X } from "lucide-react";
import { alpha } from "@/lib/colors";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
  at: number;
}

const QUICK_REPLIES = ["Hey 👋", "Where are you?", "How's your day?"];

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatPanel({
  messages,
  connected,
  accent,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  accent: string;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "end",
    });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section
      aria-label="Chat with stranger"
      className="sheet-in absolute inset-x-0 bottom-0 z-20 flex max-h-[78svh] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-panel/95 text-haze shadow-[0_-24px_70px_-20px_rgba(0,0,0,0.75)] backdrop-blur-2xl md:drawer-in md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[424px] md:rounded-none md:rounded-l-3xl md:border-y-0 md:border-r-0 md:shadow-[-24px_0_70px_-24px_rgba(0,0,0,0.75)]"
    >
      <header className="relative flex items-center gap-3 border-b border-white/[0.07] px-4 pb-3.5 pt-5 md:px-5 md:pt-3.5">
        <span
          aria-hidden
          className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/15 md:hidden"
        />

        <span
          aria-hidden
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border"
          style={{
            borderColor: alpha(accent, 0.35),
            background: alpha(accent, 0.1),
          }}
        >
          <span className="absolute inset-0 animate-ping rounded-full" style={{ background: alpha(accent, 0.12) }} />
          <span
            className="relative h-2.5 w-2.5 rounded-full"
            style={{
              background: accent,
              boxShadow: `0 0 12px 3px ${alpha(accent, 0.55)}`,
            }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-haze">Stranger</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mist">
            {connected ? (
              <>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-pulse shadow-[0_0_8px_2px_rgba(94,234,212,0.55)]"
                />
                Connected · peer-to-peer
              </>
            ) : (
              <>
                <Loader2 aria-hidden className="h-3 w-3 animate-spin text-pulse" />
                Establishing a direct line…
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            aria-label={videoBusy ? "Video call in progress" : "Start video call"}
            title={videoBusy ? "Video call in progress" : "Start video call"}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-haze transition hover:border-pulse/40 hover:text-pulse disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Video aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onEnd}
            aria-label="End connection"
            title="End connection"
            className="grid h-9 w-9 place-items-center rounded-full border border-ember/30 bg-ember/10 text-ember transition hover:bg-ember/20"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="scroll-slim flex-1 space-y-3 overflow-y-auto px-4 py-5 md:px-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 py-6 text-center">
            <span
              aria-hidden
              className="relative grid h-16 w-16 place-items-center rounded-full border"
              style={{
                borderColor: alpha(accent, 0.3),
                background: alpha(accent, 0.08),
              }}
            >
              <span className="absolute inset-0 animate-ping rounded-full" style={{ background: alpha(accent, 0.1) }} />
              <span
                className="h-4 w-4 rounded-full"
                style={{
                  background: accent,
                  boxShadow: `0 0 20px 5px ${alpha(accent, 0.5)}`,
                }}
              />
            </span>
            <p className="mt-5 text-sm font-medium text-haze">
              You&rsquo;re connected to a stranger.
            </p>
            <p className="mt-1.5 max-w-[16rem] text-xs leading-relaxed text-mist">
              Say hi — messages travel straight between you and never touch the
              server.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {QUICK_REPLIES.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  disabled={!connected}
                  onClick={() => onSend(reply)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-haze transition hover:border-pulse/40 hover:text-pulse disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-[82%] flex-col gap-1 ${
                  m.mine ? "items-end" : "items-start"
                }`}
              >
                <span
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.mine
                      ? "rounded-br-md bg-pulse text-ink"
                      : "rounded-bl-md border border-white/10 bg-white/[0.05] text-haze"
                  }`}
                >
                  {m.text}
                </span>
                <time
                  dateTime={new Date(m.at).toISOString()}
                  className="px-1 font-mono text-[9px] tracking-wide text-mist/70"
                >
                  {formatTime(m.at)}
                </time>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="border-t border-white/[0.07] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4"
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 pl-4 transition focus-within:border-pulse/40">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={connected ? "Type a message…" : "Connecting…"}
            disabled={!connected}
            aria-label="Message"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-haze outline-none placeholder:text-mist/60 disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!connected || !draft.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pulse text-ink transition hover:bg-pulse-strong disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Send aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-mist/60">
          End-to-end · never stored
        </p>
      </form>
    </section>
  );
}
