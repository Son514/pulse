"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
} from "lucide-react";
import type { MediaState } from "@/lib/webrtc";

export default function VideoPanel({
  localStream,
  remoteStream,
  localMedia,
  remoteMedia,
  onToggleMic,
  onToggleCamera,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localMedia: MediaState;
  remoteMedia: MediaState;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        {/* Remote (full screen) */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="h-full w-full bg-ink object-cover"
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70"
        />

        {/* Status bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-xl">
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember shadow-[0_0_8px_2px_rgba(251,113,133,0.6)]"
            />
            <span className="hud-label text-haze">Live · P2P</span>
          </span>
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-xl">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-pulse" />
            <span className="hud-label hidden text-mist sm:inline">
              Never recorded
            </span>
          </span>
        </div>

        {/* Remote media state */}
        {remoteStream && (!remoteMedia.mic || !remoteMedia.cam) && (
          <div className="absolute inset-x-0 top-16 z-20 flex justify-center gap-2">
            {!remoteMedia.mic && (
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 backdrop-blur-xl">
                <MicOff aria-hidden className="h-3 w-3 text-ember" />
                <span className="hud-label text-haze">Muted</span>
              </span>
            )}
            {!remoteMedia.cam && (
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 backdrop-blur-xl">
                <CameraOff aria-hidden className="h-3 w-3 text-ember" />
                <span className="hud-label text-haze">Camera off</span>
              </span>
            )}
          </div>
        )}

        {!remoteStream && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-4">
              <span
                aria-hidden
                className="relative grid h-20 w-20 place-items-center rounded-full border border-pulse/25 bg-pulse/[0.06]"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-pulse/10" />
                <span className="h-4 w-4 rounded-full bg-pulse shadow-[0_0_20px_6px_rgba(94,234,212,0.45)]" />
              </span>
              <p className="hud-label text-mist">Waiting for their camera</p>
            </div>
          </div>
        )}

        {remoteStream && !remoteMedia.cam && (
          <div className="absolute inset-0 grid place-items-center bg-ink/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <span className="grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/[0.04]">
                <CameraOff aria-hidden className="h-6 w-6 text-mist" />
              </span>
              <p className="text-sm text-mist">Their camera is off</p>
            </div>
          </div>
        )}

        {/* Local (picture-in-picture) */}
        <div className="absolute bottom-4 right-4 aspect-[3/4] w-24 overflow-hidden rounded-2xl border border-white/20 bg-ink shadow-2xl shadow-black/50 sm:w-32 md:w-36">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {!localMedia.cam && (
            <div className="absolute inset-0 grid place-items-center bg-ink/85">
              <CameraOff aria-hidden className="h-5 w-5 text-mist" />
            </div>
          )}
          {!localMedia.mic && (
            <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-ember/20">
              <MicOff aria-hidden className="h-3 w-3 text-ember" />
            </span>
          )}
          <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-haze backdrop-blur">
            You
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center bg-gradient-to-t from-black via-black/90 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-panel/80 p-2 backdrop-blur-xl">
          <ControlButton
            label={localMedia.mic ? "Mute microphone" : "Unmute microphone"}
            pressed={!localMedia.mic}
            onClick={onToggleMic}
          >
            {localMedia.mic ? (
              <Mic aria-hidden className="h-4 w-4" />
            ) : (
              <MicOff aria-hidden className="h-4 w-4" />
            )}
          </ControlButton>

          <ControlButton
            label={localMedia.cam ? "Turn camera off" : "Turn camera on"}
            pressed={!localMedia.cam}
            onClick={onToggleCamera}
          >
            {localMedia.cam ? (
              <Camera aria-hidden className="h-4 w-4" />
            ) : (
              <CameraOff aria-hidden className="h-4 w-4" />
            )}
          </ControlButton>

          <span aria-hidden className="mx-1 h-6 w-px bg-white/10" />

          <button
            type="button"
            onClick={onEnd}
            className="flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_-8px_rgba(251,113,133,0.8)] transition hover:bg-ember/90"
          >
            <PhoneOff aria-hidden className="h-4 w-4" />
            End call
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`grid h-11 w-11 place-items-center rounded-full border transition ${
        pressed
          ? "border-ember/35 bg-ember/15 text-ember"
          : "border-white/10 bg-white/[0.04] text-haze hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}
