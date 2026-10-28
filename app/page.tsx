"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import Toast, { type ToastData } from "./components/Toast";
import LinkBanner from "./components/LinkBanner";
import { join, leave, poll, sendSignal, ApiError } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl, type MediaState } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { dotColor } from "@/lib/colors";
import { distanceKm } from "@/lib/geo";
import { primeAudio, playLinkSound, playUnlinkSound } from "@/lib/sound";
import { type PeerDot, type SignalMsg, type SignalType } from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

function initialSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem("pulse.sound") !== "off";
  } catch {
    return true;
  }
}

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<ToastData | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localMedia, setLocalMedia] = useState<MediaState>({ mic: true, cam: true });
  const [remoteMedia, setRemoteMedia] = useState<MediaState>({ mic: true, cam: true });
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [linkVisible, setLinkVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(initialSoundOn);
  // Used by the poll loop (which shouldn't restart when the pin moves).
  const myLocationRef = useRef(myLocation);
  useEffect(() => {
    myLocationRef.current = myLocation;
  });

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const noticeId = useRef(0);
  const sessionTokenRef = useRef<string | null>(null);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    try {
      window.localStorage.setItem("pulse.sound", soundOn ? "on" : "off");
    } catch {}
  }, [soundOn]);

  function showNotice(text: string) {
    const id = ++noticeId.current;
    setNotice({ id, text });
    window.setTimeout(() => {
      setNotice((current) => (current?.id === id ? null : current));
    }, 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [
      ...prev,
      { id: msgId.current++, mine, text, at: Date.now() },
    ]);
  }

  // Every signaling call carries the session bearer token.
  function signal(peerId: string, type: SignalType, payload?: string) {
    const token = sessionTokenRef.current;
    if (!token) return;
    void sendSignal(sessionId, token, peerId, type, payload);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    if (linkTimer.current) clearTimeout(linkTimer.current);
    linkTimer.current = null;
    const wasConnected = connRef.current.kind === "connected";
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setLocalMedia({ mic: true, cam: true });
    setRemoteMedia({ mic: true, cam: true });
    setVideo("none");
    setMessages([]);
    setLinkVisible(false);
    setConn({ kind: "idle" });
    if (wasConnected && soundOnRef.current) playUnlinkSound();
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        const token = sessionTokenRef.current;
        if (token) void sendSignal(sessionId, token, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onMediaState: (state) => setRemoteMedia(state),
      onConnectionState: (state) => {
        if (state === "connected") {
          if (disconnectTimer.current) {
            clearTimeout(disconnectTimer.current);
            disconnectTimer.current = null;
          }
          return;
        }
        if (state === "failed") {
          // Tell the other side too — otherwise they sit in the chat forever.
          signal(peerId, "end");
          teardown("Connection failed (network).");
          return;
        }
        if (state === "disconnected" && !disconnectTimer.current) {
          // "disconnected" is often transient (network blip). Give it a few
          // seconds to recover before ending the session for both peers.
          disconnectTimer.current = setTimeout(() => {
            disconnectTimer.current = null;
            signal(peerId, "end");
            teardown("Connection lost.");
          }, 8000);
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
        if (soundOnRef.current) playLinkSound();
        // Give the connection moment a beat on the map before the chat opens.
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          if (linkTimer.current) clearTimeout(linkTimer.current);
          setLinkVisible(true);
          linkTimer.current = setTimeout(() => {
            linkTimer.current = null;
            setLinkVisible(false);
          }, 2200);
        }
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setLocalMedia({ mic: true, cam: true });
              ps.sendMediaState({ mic: true, cam: true });
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setLocalMedia({ mic: true, cam: true });
        setRemoteMedia({ mic: true, cam: true });
        setVideo("none");
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    primeAudio();
    setConn({ kind: "requesting", peerId });
    signal(peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        signal(peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      signal(connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    primeAudio();
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    signal(peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    signal(connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      signal(c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        setLocalMedia({ mic: true, cam: true });
        ps.sendControl("video-accept");
        ps.sendMediaState({ mic: true, cam: true });
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setLocalMedia({ mic: true, cam: true });
    setRemoteMedia({ mic: true, cam: true });
    setVideo("none");
  }

  function toggleMic() {
    const stream = localStream;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;
    const mic = !tracks[0].enabled;
    tracks.forEach((track) => (track.enabled = mic));
    const next = { ...localMedia, mic };
    setLocalMedia(next);
    peerRef.current?.sendMediaState(next);
  }

  function toggleCamera() {
    const stream = localStream;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return;
    const cam = !tracks[0].enabled;
    tracks.forEach((track) => (track.enabled = cam));
    const next = { ...localMedia, cam };
    setLocalMedia(next);
    peerRef.current?.sendMediaState(next);
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          signal(sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  const teardownRef = useRef(teardown);
  const showNoticeRef = useRef(showNotice);
  const signalRef = useRef(signal);
  useEffect(() => {
    processSignalRef.current = processSignal;
    teardownRef.current = teardown;
    showNoticeRef.current = showNotice;
    signalRef.current = signal;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const token = sessionTokenRef.current;
      if (!token) return;
      try {
        const me = myLocationRef.current;
        const data = await poll(sessionId, token, me?.lat, me?.lng);
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);

        // If the peer we're talking to disappears from the map (tab closed,
        // left, or went stale), end the session so we don't stay stuck busy.
        const c = connRef.current;
        if (c.kind !== "idle" && c.kind !== "requesting") {
          const peerOnline = data.peers.some((p) => p.id === c.peerId);
          if (!peerOnline) {
            if (c.kind === "incoming") {
              setConn({ kind: "idle" });
            } else {
              signalRef.current(c.peerId, "end");
              teardownRef.current("Stranger disconnected.");
            }
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          showNoticeRef.current("Session expired — reload to rejoin.");
          return;
        }
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => leave(sessionId, sessionTokenRef.current);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId, phase]);

  async function handleReady(lat: number, lng: number) {
    primeAudio();
    // The server applies the 1–3 km privacy offset and issues the session
    // token. Use the returned coords so my own pin sits where everyone else
    // sees me — not at my real location.
    const pos = await join(sessionId, lat, lng);
    if (!pos.token) throw new Error("join did not issue a session token");
    sessionTokenRef.current = pos.token;
    setMyLocation({ lat: pos.lat, lng: pos.lng });
    setPhase("live");
  }

  const activePeerId =
    conn.kind === "connecting" || conn.kind === "connected"
      ? conn.peerId
      : null;

  // Memoised so the map's arc effect doesn't restart on every poll tick.
  const linkedPeerId = conn.kind === "connected" ? conn.peerId : null;
  const linkedPeer = linkedPeerId
    ? peers.find((peer) => peer.id === linkedPeerId) ?? null
    : null;
  const linkedLat = linkedPeer?.lat;
  const linkedLng = linkedPeer?.lng;
  const linkPeer = useMemo(() => {
    if (
      !linkedPeerId ||
      linkedLat === undefined ||
      linkedLng === undefined ||
      !myLocation
    ) {
      return null;
    }
    return {
      lat: linkedLat,
      lng: linkedLng,
      color: dotColor(linkedPeerId),
      distanceKm: distanceKm(myLocation, { lat: linkedLat, lng: linkedLng }),
    };
  }, [linkedPeerId, linkedLat, linkedLng, myLocation]);

  const peerAccent = activePeerId ? dotColor(activePeerId) : "#5eead4";
  const showChat = conn.kind === "connected" && !linkVisible;

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
        onNotify={showNotice}
        linkPeer={linkPeer}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((on) => !on)}
      />

      <Toast toast={notice} />

      <LinkBanner
        status={conn.kind === "connecting" ? "locking" : "linked"}
        accent={conn.kind === "connecting" ? peerAccent : linkPeer?.color ?? peerAccent}
        distanceKm={linkPeer?.distanceKm}
        visible={conn.kind === "connecting" || linkVisible}
      />

      {conn.kind === "requesting" && (
        <div className="panel-in absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-panel/85 px-4 py-2 text-sm text-haze shadow-xl shadow-black/30 backdrop-blur-xl">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin text-pulse" />
          <span>Signalling…</span>
          <button
            type="button"
            onClick={cancelRequest}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist transition hover:text-haze"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger is signalling"
          subtitle="They found your dot and want to connect. Nothing is stored."
          acceptLabel="Accept"
          declineLabel="Decline"
          accent={dotColor(conn.peerId)}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {showChat && (
        <ChatPanel
          messages={messages}
          connected
          accent={peerAccent}
          distanceKm={linkPeer?.distanceKm}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="panel-in absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-panel/85 px-4 py-2 text-sm text-haze shadow-xl shadow-black/30 backdrop-blur-xl">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin text-pulse" />
          Waiting for the stranger to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start a video call?"
          subtitle="They want to turn on cameras. Nothing is recorded."
          acceptLabel="Accept"
          declineLabel="Decline"
          accent={peerAccent}
          icon="video"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          localMedia={localMedia}
          remoteMedia={remoteMedia}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
