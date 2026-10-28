// Tiny Web Audio cues for the connection moment. No assets, no persistence of
// anything but the user's mute preference.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture so the browser lets us play the chime later. */
export function primeAudio(): void {
  audio();
}

function tone(
  ac: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Two rising notes: "linked". */
export function playLinkSound(): void {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 523.25, now, 0.6, 0.05); // C5
  tone(ac, 783.99, now + 0.11, 0.7, 0.045); // G5
}

/** A soft descending pair: "unlinked". */
export function playUnlinkSound(): void {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 392, now, 0.45, 0.035); // G4
  tone(ac, 261.63, now + 0.1, 0.55, 0.03); // C4
}
