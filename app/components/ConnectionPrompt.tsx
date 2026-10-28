"use client";

import { useEffect, useId, useRef } from "react";
import { Radio, Video } from "lucide-react";
import { alpha } from "@/lib/colors";

// Reusable centered prompt for "someone wants to connect" and
// "someone wants to start video".
export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  accent = "#5eead4",
  icon = "signal",
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  accent?: string;
  icon?: "signal" | "video";
  onAccept: () => void;
  onDecline: () => void;
}) {
  const titleId = useId();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const Icon = icon === "video" ? Video : Radio;

  useEffect(() => {
    acceptRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDecline();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecline]);

  return (
    <div className="fade-in fixed inset-0 z-40 flex items-end justify-center bg-ink/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel-in w-full max-w-sm rounded-3xl border border-white/10 bg-panel/90 p-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
      >
        <span
          aria-hidden
          className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border"
          style={{
            borderColor: alpha(accent, 0.35),
            background: alpha(accent, 0.1),
          }}
        >
          <span
            className="absolute inset-0 animate-ping rounded-full"
            style={{ background: alpha(accent, 0.12) }}
          />
          <Icon className="relative h-5 w-5" style={{ color: accent }} />
        </span>

        <h2
          id={titleId}
          className="mt-5 text-lg font-semibold tracking-[-0.01em] text-haze"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mx-auto mt-1.5 max-w-[17rem] text-sm leading-relaxed text-mist">
            {subtitle}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-mist transition hover:border-white/20 hover:text-haze"
          >
            {declineLabel}
          </button>
          <button
            ref={acceptRef}
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-full bg-pulse px-4 py-2.5 text-sm font-semibold text-ink shadow-[0_0_30px_-8px_rgba(94,234,212,0.7)] transition hover:bg-pulse-strong"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
