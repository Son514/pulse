"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { Copy, LocateFixed, Minus, Plus, RadioTower } from "lucide-react";
import type { PeerDot } from "@/lib/types";
import { dotColor } from "@/lib/colors";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
  onNotify,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
  onNotify: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const busyIdsRef = useRef<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  const onNotifyRef = useRef(onNotify);
  const meRef = useRef(me);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
    onNotifyRef.current = onNotify;
    meRef.current = me;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;
    const busyIds = busyIdsRef.current;

    (async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = TOKEN;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          // Open centered on the user if we know where they are, else world view.
          center: meRef.current
            ? [meRef.current.lng, meRef.current.lat]
            : [0, 20],
          zoom: meRef.current ? 4 : 1.4,
          attributionControl: true,
        });
        map.on("load", () => {
          if (!cancelled) {
            setMapError(null);
            setReady(true);
          }
        });
        // Surface auth/style failures instead of a silent blank map. Tile
        // errors after the style loads are noise, so ignore those.
        map.on("error", (event) => {
          if (cancelled || map.isStyleLoaded()) return;
          const err = event.error as (Error & { status?: number }) | undefined;
          const status = err?.status;
          const message = err?.message ?? "";
          setMapError(
            status === 401 ||
              status === 403 ||
              /token|unauthorized|forbidden/i.test(message)
              ? "The map couldn't load — your Mapbox token is invalid or expired."
              : "The map couldn't load. Check your connection and reload.",
          );
        });
        mapRef.current = map;
      } catch {
        if (!cancelled) {
          setMapError(
            "The map couldn't load. Check NEXT_PUBLIC_MAPBOX_TOKEN and reload.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      busyIds.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Initialise once — `me` is read through a ref for the initial center.
  }, []);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", "Your location");
        el.innerHTML = `<span class="pulse-me-label" aria-hidden="true">YOU</span><span class="pulse-me-core"></span>`;
        meMarkerRef.current = new mapboxgl.Marker({
          element: el,
          anchor: "center",
        })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "pulse-dot";
          el.style.setProperty("--dot", dotColor(peer.id));
          el.innerHTML = `<span class="pulse-dot-tip" aria-hidden="true"></span>`;
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            // Busy users would auto-decline anyway; don't send a doomed request.
            if (canConnectRef.current && !busyIdsRef.current.has(peer.id)) {
              onPeerClickRef.current(peer.id);
            }
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        } else {
          // Keep existing dots in sync if their coordinates ever change.
          marker.setLngLat([peer.lng, peer.lat]);
        }

        const el = marker.getElement();
        el.classList.toggle("is-busy", peer.busy);
        el.style.opacity = peer.busy ? "0.4" : "1";
        el.setAttribute("aria-disabled", String(peer.busy));
        el.setAttribute(
          "aria-label",
          peer.busy ? "Stranger is in a call" : "Connect with stranger",
        );
        const tip = el.querySelector(".pulse-dot-tip");
        if (tip) tip.textContent = peer.busy ? "In a call" : "Stranger";

        if (peer.busy) busyIdsRef.current.add(peer.id);
        else busyIdsRef.current.delete(peer.id);
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
          busyIdsRef.current.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  function recenter() {
    const map = mapRef.current;
    const pos = meRef.current;
    if (!map || !pos) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({
      center: [pos.lng, pos.lat],
      zoom: Math.max(map.getZoom(), 6),
      duration: reduce ? 0 : 900,
      essential: true,
    });
  }

  function zoomBy(delta: 1 | -1) {
    const map = mapRef.current;
    if (!map) return;
    if (delta === 1) map.zoomIn();
    else map.zoomOut();
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      onNotifyRef.current("Invite link copied — send it to a friend");
    } catch {
      onNotifyRef.current("Couldn't copy the link");
    }
  }

  const count = peers.length + (me ? 1 : 0);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-ink-soft" />

      <div aria-hidden className="vignette pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="noise pointer-events-none absolute inset-0 opacity-[0.025]"
      />

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 md:p-6">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-panel/70 px-3.5 py-2 shadow-lg shadow-black/20 backdrop-blur-xl">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse" />
          </span>
          <span className="text-sm font-semibold tracking-[0.22em] text-haze">
            PULSE
          </span>
          <span className="hud-label hidden text-mist md:inline">
            anonymous · live
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-panel/70 px-3.5 py-2 shadow-lg shadow-black/20 backdrop-blur-xl">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-pulse shadow-[0_0_8px_2px_rgba(94,234,212,0.6)]"
          />
          <span className="hud-label text-haze">
            {String(count).padStart(2, "0")} online
          </span>
        </div>
      </div>

      {/* Quiet map — invite someone. */}
      {ready && peers.length === 0 && (
        <div className="pointer-events-auto absolute bottom-4 left-4 right-20 z-10 md:bottom-6 md:left-6 md:right-auto md:max-w-xs">
          <div className="panel-in rounded-2xl border border-white/10 bg-panel/75 p-4 shadow-xl shadow-black/30 backdrop-blur-xl">
            <p className="flex items-center gap-2 text-sm font-medium text-haze">
              <RadioTower aria-hidden className="h-4 w-4 text-pulse" />
              The map is quiet
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-mist">
              No one else is online yet. Share the link and wait for a signal.
            </p>
            <button
              type="button"
              onClick={copyInvite}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-pulse/25 bg-pulse/10 px-3 py-1.5 text-xs font-medium text-pulse transition hover:bg-pulse/15"
            >
              <Copy aria-hidden className="h-3.5 w-3.5" />
              Copy invite link
            </button>
          </div>
        </div>
      )}

      {/* Legend while people are online. */}
      {ready && peers.length > 0 && (
        <div className="pointer-events-none absolute bottom-6 left-6 z-10 hidden items-center gap-4 rounded-full border border-white/10 bg-panel/70 px-3.5 py-2 shadow-lg shadow-black/20 backdrop-blur-xl sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-solar shadow-[0_0_8px_2px_rgba(251,191,36,0.5)]" />
            <span className="hud-label text-mist">You</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-pulse shadow-[0_0_8px_2px_rgba(94,234,212,0.5)]" />
            <span className="hud-label text-mist">Stranger</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-dashed border-white/70" />
            <span className="hud-label text-mist">In call</span>
          </span>
        </div>
      )}

      {/* Map controls */}
      <div className="pointer-events-auto absolute bottom-20 right-4 z-10 flex flex-col gap-2 md:bottom-24 md:right-6">
        <MapButton label="Recenter on me" onClick={recenter} disabled={!me}>
          <LocateFixed aria-hidden className="h-4 w-4" />
        </MapButton>
        <MapButton label="Zoom in" onClick={() => zoomBy(1)}>
          <Plus aria-hidden className="h-4 w-4" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(-1)}>
          <Minus aria-hidden className="h-4 w-4" />
        </MapButton>
      </div>

      {/* Loading / failure overlays */}
      {!TOKEN && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-2xl border border-white/10 bg-panel/80 p-4 text-sm text-mist backdrop-blur-xl">
            Set{" "}
            <code className="font-mono text-pulse">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            in <code className="font-mono text-pulse">.env</code> to load the
            map.
          </p>
        </div>
      )}

      {TOKEN && !ready && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="flex flex-col items-center gap-4">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-pulse" />
            <p className="hud-label text-mist">Establishing globe link</p>
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
          <p className="panel-in max-w-md rounded-2xl border border-ember/25 bg-panel/85 p-4 text-sm text-ember backdrop-blur-xl">
            {mapError}
          </p>
        </div>
      )}
    </div>
  );
}

function MapButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-panel/80 text-haze shadow-lg shadow-black/20 backdrop-blur-xl transition hover:border-pulse/40 hover:text-pulse disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
