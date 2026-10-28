"use client";

import { alpha } from "@/lib/colors";
import { formatDistance } from "@/lib/geo";

export default function LinkBanner({
  status,
  accent,
  distanceKm,
  visible,
}: {
  status: "locking" | "linked";
  accent: string;
  distanceKm?: number;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="link-status"
      className="panel-in pointer-events-none fixed left-1/2 top-20 z-30 -translate-x-1/2"
    >
      <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-panel/85 px-4 py-2 text-haze shadow-xl shadow-black/30 backdrop-blur-xl">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span
            className="absolute inset-0 animate-ping rounded-full"
            style={{ background: alpha(accent, 0.5) }}
          />
          <span
            className="relative h-2.5 w-2.5 rounded-full"
            style={{
              background: accent,
              boxShadow: `0 0 10px 2px ${alpha(accent, 0.55)}`,
            }}
          />
        </span>
        {status === "locking" ? (
          <span className="hud-label text-mist">Locking on</span>
        ) : (
          <>
            <span className="hud-label text-haze">Linked</span>
            {distanceKm !== undefined && (
              <>
                <span aria-hidden className="h-3 w-px bg-white/15" />
                <span className="font-mono text-[10px] tracking-[0.14em] text-mist">
                  ≈ {formatDistance(distanceKm)}
                </span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
