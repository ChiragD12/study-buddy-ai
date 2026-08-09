/**
 * Extremely subtle UI sound effects using the Web Audio API — no audio
 * assets, no dependency. Every call happens inside a user gesture handler
 * (click/tap), so this never runs into autoplay restrictions.
 *
 * Kept intentionally minimal: a couple of short, quiet tones. Wire these
 * into interactions that genuinely benefit (confirming an action, sending
 * a message) rather than every click — see UI polish brief.
 *
 * If the app already has a settings/audio-preference system, gate calls to
 * `playUiSound` behind that flag at the call site (e.g. only call it when
 * `settings.soundEnabled` is true). This module has no opinion on that.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!sharedContext) {
    sharedContext = new AudioCtor();
  }
  if (sharedContext.state === "suspended") {
    void sharedContext.resume();
  }
  return sharedContext;
}

function tone(freq: number, durationMs: number, peakGain: number, delayMs = 0) {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;

  const start = ctx.currentTime + delayMs / 1000;
  const duration = durationMs / 1000;

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + duration * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export type UiSoundKind = "click" | "success" | "transition";

/** Play a very quiet, short UI sound. Safe to call frequently; fails silently. */
export function playUiSound(kind: UiSoundKind) {
  try {
    switch (kind) {
      case "click":
        tone(720, 45, 0.035);
        break;
      case "success":
        tone(660, 90, 0.04);
        tone(880, 110, 0.035, 70);
        break;
      case "transition":
        tone(440, 70, 0.025);
        break;
    }
  } catch {
    // Audio is a pure enhancement — never let it break an interaction.
  }
}
