/**
 * The "we're live" cue: a brief motion flourish, and an OPT-IN sound.
 *
 * NO AUDIO ASSET AT ALL, which is also how the "no ESPN asset" constraint is satisfied
 * rather than merely obeyed. The chime is synthesised with the Web Audio API — two short
 * sine tones, a fifth apart — so there is no file to license, no attribution to track, and
 * nothing that could resemble a broadcaster's signature. It also costs no bytes in the
 * bundle.
 *
 * ONCE PER OCCURRENCE, AND THAT IS PERSISTED. A cue that re-fires is an interruption, and
 * the thing most likely to make it re-fire is a route change. The seen-set lives in
 * localStorage next to the dismissal set, for the same reason: per viewer, per device, no
 * value to anyone else, and wrapped in both directions because it throws in a private window.
 *
 * SOUND IS OFF UNTIL ASKED FOR, and asking is a gesture. Browsers refuse to start an
 * AudioContext without one, and a cue that plays unbidden in a quiet room is worse than no
 * cue. When playback is refused anyway — an embedded webview, a hardware mute, a policy — the
 * refusal is REPORTED so the UI can say "sound unavailable" instead of silently doing nothing.
 */

const SEEN_KEY = 'colaberry.broadcast.cued';
const SOUND_KEY = 'colaberry.broadcast.cueSound';

/** Bounded, like the dismissal set: the newest entries are the ones that matter. */
const SEEN_LIMIT = 50;

export function readCued(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function markCued(ids: string[]): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-SEEN_LIMIT)));
  } catch {
    // A viewer with storage blocked sees the cue again on reload. Annoying, not broken.
  }
}

/** Opt-IN: absent means off. Only an explicit 'true' turns it on. */
export function readSoundOptIn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSoundOptIn(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'true' : 'false');
  } catch {
    // Nothing to do; the preference simply does not survive the session.
  }
}

/** Which of these broadcasts has this viewer not been cued about yet? */
export function uncued(ids: readonly string[], alreadyCued: readonly string[]): string[] {
  return ids.filter((id) => !alreadyCued.includes(id));
}

export type ChimeOutcome = 'played' | 'unsupported' | 'refused';

export interface ChimeDeps {
  /** Injected so the refusal path — the one that matters — is testable. */
  createContext?: () => AudioContext | null;
  now?: () => number;
}

function defaultCreateContext(): AudioContext | null {
  const Ctor = (window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  });
  const Impl = Ctor.AudioContext ?? Ctor.webkitAudioContext;
  if (!Impl) return null;
  try {
    return new Impl();
  } catch {
    // Some webviews throw on construction rather than on resume.
    return null;
  }
}

/**
 * Two short sine tones. Returns WHICH of the three things happened, because "unsupported"
 * and "refused" need different copy and neither may be reported as success.
 */
export async function playChime(deps: ChimeDeps = {}): Promise<ChimeOutcome> {
  const createContext = deps.createContext ?? defaultCreateContext;
  const ctx = createContext();
  if (!ctx) return 'unsupported';

  try {
    // Suspended is the normal state before a gesture; resume() rejects without one.
    if (ctx.state === 'suspended') await ctx.resume();

    const start = typeof deps.now === 'function' ? deps.now() : ctx.currentTime;
    // A fifth: 587.33 Hz (D5) then 880 Hz (A5). Short, quiet, and unmistakably a chime
    // rather than a melody anyone owns.
    for (const [index, freq] of [587.33, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Ramped, not switched: an abrupt start is a click, and a click is what makes a cue
      // feel cheap.
      gain.gain.setValueAtTime(0, start + index * 0.14);
      gain.gain.linearRampToValueAtTime(0.14, start + index * 0.14 + 0.02);
      gain.gain.linearRampToValueAtTime(0, start + index * 0.14 + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + index * 0.14);
      osc.stop(start + index * 0.14 + 0.14);
    }
    return 'played';
  } catch {
    // No gesture, a policy refusal, or a webview that will not resume. Reported, never
    // swallowed: the UI says sound is unavailable rather than pretending it played.
    return 'refused';
  }
}
