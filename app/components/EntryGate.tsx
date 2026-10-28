"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Ghost,
  Loader2,
  MapPin,
  Radar,
  UserX,
} from "lucide-react";

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => Promise<void>;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onReady(pos.coords.latitude, pos.coords.longitude).catch(() => {
          setStatus("error");
          setError("Couldn't join the map. Please try again.");
        });
      },
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        );
      },
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="aurora relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="grid-field pointer-events-none absolute inset-0" />
      <div aria-hidden className="noise pointer-events-none absolute inset-0 opacity-[0.025]" />

      {/* Faint signals drifting in the background. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="drift-slow absolute left-[12%] top-[24%] h-1.5 w-1.5 rounded-full bg-pulse/70 shadow-[0_0_10px_2px_rgba(94,234,212,0.35)]" />
        <span
          className="drift-slow absolute right-[16%] top-[32%] h-2 w-2 rounded-full bg-violet-300/70 shadow-[0_0_12px_2px_rgba(167,139,250,0.3)]"
          style={{ animationDelay: "-3s" }}
        />
        <span
          className="drift-slow absolute bottom-[24%] left-[22%] h-1.5 w-1.5 rounded-full bg-rose-300/70 shadow-[0_0_10px_2px_rgba(251,113,133,0.3)]"
          style={{ animationDelay: "-6s" }}
        />
        <span
          className="drift-slow absolute bottom-[30%] right-[24%] h-1 w-1 rounded-full bg-sky-300/60"
          style={{ animationDelay: "-1.5s" }}
        />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div
          aria-hidden
          className="radar mb-10 h-36 w-36 sm:h-44 sm:w-44"
        >
          <div className="radar-sweep" />
          <span className="absolute left-[27%] top-[33%] h-2 w-2 rounded-full bg-pulse shadow-[0_0_12px_3px_rgba(94,234,212,0.55)]" />
          <span className="absolute right-[22%] top-[57%] h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_2px_rgba(167,139,250,0.5)]" />
          <span className="absolute bottom-[19%] left-[53%] h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_10px_2px_rgba(251,113,133,0.45)]" />
          <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-solar shadow-[0_0_16px_4px_rgba(251,191,36,0.55)]" />
        </div>

        <p className="hud-label text-pulse/80">
          Anonymous · Real-time · Worldwide
        </p>

        <h1 className="mt-4 flex items-center gap-3 text-5xl font-semibold tracking-[-0.045em] text-haze sm:text-6xl md:text-7xl">
          <span className="bg-gradient-to-b from-white via-white to-white/55 bg-clip-text text-transparent">
            Pulse
          </span>
          <span
            aria-hidden
            className="mt-1 h-2.5 w-2.5 rounded-full bg-pulse shadow-[0_0_20px_5px_rgba(94,234,212,0.45)]"
          />
        </h1>

        <p className="mt-5 max-w-md text-balance text-base leading-relaxed text-mist md:text-lg">
          A living globe of anonymous strangers. Every dot is someone online
          right now. Tap one and start talking.
        </p>

        <button
          onClick={enter}
          disabled={status === "locating"}
          className="group mt-9 inline-flex items-center gap-2 rounded-full bg-pulse px-7 py-3.5 text-sm font-semibold text-ink shadow-[0_0_44px_-8px_rgba(94,234,212,0.65)] transition hover:bg-pulse-strong hover:shadow-[0_0_54px_-6px_rgba(94,234,212,0.75)] disabled:cursor-wait disabled:opacity-70"
        >
          {status === "locating" ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              Locating you…
            </>
          ) : (
            <>
              <Radar aria-hidden className="h-4 w-4" />
              Enter the map
              <ArrowRight
                aria-hidden
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </>
          )}
        </button>

        {status === "error" && (
          <p
            role="alert"
            className="mt-6 flex max-w-sm items-start gap-2 rounded-2xl border border-ember/30 bg-ember/10 px-4 py-3 text-left text-sm text-ember"
          >
            <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <ul className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {[
            { icon: UserX, label: "No account" },
            { icon: MapPin, label: "Placed 1–3 km off" },
            { icon: Ghost, label: "Vanishes on close" },
          ].map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-mist"
            >
              <Icon aria-hidden className="h-3.5 w-3.5 text-pulse/80" />
              {label}
            </li>
          ))}
        </ul>
      </main>

      <footer className="relative z-10 pb-6 text-center">
        <p className="hud-label text-mist/70">
          No profiles · No history · Just a pulse
        </p>
      </footer>
    </div>
  );
}
