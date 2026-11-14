/**
 * hireVideoVoice - how the voice moves: loudness over time and pitch variety, from the audio.
 *
 * WHY. Research weights prosody heavily for perceived engagement (Naim et al. 2015), and a wider
 * pitch range is rated more charismatic (Niebuhr & Skarnitzl 2019). Neither gives a numeric
 * cutoff, and pitch differs by speaker, so these are shown as INFORMATION relative to the
 * speaker's own voice, never scored. The energy series also drives the studio's live meter, so
 * what moves on screen is the real sound.
 *
 * HOW. ffmpeg decodes 8 kHz mono 16-bit PCM to stdout (argument array, timeout, bounded buffer).
 * Pure functions then take 40 ms frames every 50 ms: RMS level, and pitch by normalised
 * autocorrelation between 75 and 400 Hz. A frame is voiced when it is within 25 dB of the
 * loudest speech and the autocorrelation peak is clear. No new dependency.
 */
import { execFile } from 'child_process';

export const RATE = 8000;
const FRAME = 320; // 40 ms
const HOP = 400; // 50 ms
const MIN_LAG = Math.floor(RATE / 400);
const MAX_LAG = Math.ceil(RATE / 75);
const PCM_TIMEOUT_MS = 60_000;
const PCM_MAX_BYTES = 200 * RATE * 2; // 200 s of audio; the rendition is capped at 181 s

export interface VoiceTrack {
  /** Loudness every 0.5 s, 0..1 relative to the speaker's own loud speech: the live meter. */
  readonly energy: readonly number[];
  /** Standard deviation of pitch in semitones around the speaker's own median. */
  readonly pitchVariation: number | null;
  /** dB between quiet (10th percentile) and loud (90th) voiced frames. */
  readonly loudnessRange: number | null;
  readonly voicedFrames: number;
}

const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

/** Pitch of one frame in Hz, or null when there is no clear period. */
export function framePitch(x: Float32Array): number | null {
  let best = 0; let bestLag = 0;
  let e0 = 0; for (let i = 0; i < x.length; i += 1) e0 += x[i] * x[i];
  if (e0 <= 0) return null;
  for (let lag = MIN_LAG; lag <= MAX_LAG && lag < x.length - 1; lag += 1) {
    let num = 0; let e1 = 0;
    for (let i = 0; i + lag < x.length; i += 1) { num += x[i] * x[i + lag]; e1 += x[i + lag] * x[i + lag]; }
    const r = num / Math.sqrt(e0 * e1 || 1);
    if (r > best) { best = r; bestLag = lag; }
  }
  return best >= 0.45 && bestLag ? RATE / bestLag : null;
}

export function voiceTrack(pcm: Int16Array): VoiceTrack {
  const frames: { db: number; f0: number | null }[] = [];
  const buf = new Float32Array(FRAME);
  for (let s = 0; s + FRAME <= pcm.length; s += HOP) {
    let sum = 0;
    for (let i = 0; i < FRAME; i += 1) { buf[i] = pcm[s + i] / 32768; sum += buf[i] * buf[i]; }
    const rms = Math.sqrt(sum / FRAME);
    frames.push({ db: 20 * Math.log10(rms + 1e-9), f0: rms > 0.003 ? framePitch(buf) : null });
  }
  const dbs = frames.map((f) => f.db).sort((a, b) => a - b);
  const loud = dbs.length ? pct(dbs, 0.95) : 0;
  const voiced = frames.filter((f) => f.db > loud - 25 && f.f0 !== null);
  // Energy: 0.5 s buckets of 10 frames, mapped from (loud - 40 dB .. loud) to 0..1.
  const energy: number[] = [];
  for (let i = 0; i < frames.length; i += 10) {
    const slice = frames.slice(i, i + 10);
    const peak = Math.max(...slice.map((f) => f.db));
    energy.push(Math.round(Math.min(1, Math.max(0, (peak - (loud - 40)) / 40)) * 100) / 100);
  }
  let pitchVariation: number | null = null;
  if (voiced.length >= 40) {
    const f0s = voiced.map((f) => f.f0 as number).sort((a, b) => a - b);
    const median = pct(f0s, 0.5);
    // Octave jumps are tracking errors, not intonation: keep within one octave of the median.
    const st = f0s.map((f) => 12 * Math.log2(f / median)).filter((v) => Math.abs(v) <= 12);
    const mean = st.reduce((a, b) => a + b, 0) / st.length;
    pitchVariation = Math.round(Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length) * 10) / 10;
  }
  const vdb = voiced.map((f) => f.db).sort((a, b) => a - b);
  return {
    energy,
    pitchVariation,
    loudnessRange: vdb.length >= 40 ? Math.round(pct(vdb, 0.9) - pct(vdb, 0.1)) : null,
    voicedFrames: voiced.length,
  };
}

export const pcmArgs = (stream: string): string[] =>
  ['-hide_banner', '-loglevel', 'error', '-i', stream, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', 'pipe:1'];

export type PcmReader = (stream: string) => Promise<Buffer>;

export const ffmpegPcm: PcmReader = (stream) => new Promise((resolve, reject) => {
  execFile('ffmpeg', pcmArgs(stream), { encoding: 'buffer', timeout: PCM_TIMEOUT_MS, maxBuffer: PCM_MAX_BYTES, windowsHide: true },
    (err, stdout) => (err ? reject(err) : resolve(stdout)));
});

/** Null on any failure: the voice line is extra, never a reason to lose the rest of the coaching. */
export async function readVoice(stream: string, read: PcmReader = ffmpegPcm): Promise<VoiceTrack | null> {
  try {
    const b = await read(stream);
    return voiceTrack(new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2)));
  } catch {
    return null;
  }
}
