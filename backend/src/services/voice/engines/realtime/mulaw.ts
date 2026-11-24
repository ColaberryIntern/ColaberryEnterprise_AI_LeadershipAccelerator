/**
 * G.711 mu-law helpers (VS2.4). Engine B passes Twilio's mu-law audio to OpenAI Realtime UNCHANGED
 * (session format audio/pcmu both ways), so no conversion runs on a live call. What the bridge does
 * need is exact timing: mu-law at 8 kHz is one byte per sample, so 8 bytes = 1 ms. Truncating a
 * barged-in answer by "audio actually played" is computed from these byte counts.
 *
 * encode/decode exist for tests and fixtures (synthetic tones, silence) and are the standard
 * ITU-T G.711 mu-law algorithm with bias 0x84 and clip 32635.
 */
export const MULAW_BYTES_PER_MS = 8;

/** Playback duration of a base64 mu-law payload, in ms (never a WAV header: Twilio forbids one). */
export function mulawBase64DurationMs(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytes = (len * 3) / 4 - padding;
  return bytes / MULAW_BYTES_PER_MS;
}

const BIAS = 0x84;
const CLIP = 32635;

export function linearToMulaw(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)));
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function mulawToLinear(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const magnitude = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -magnitude : magnitude;
}

export function encodeMulaw(pcm: Int16Array): Buffer {
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = linearToMulaw(pcm[i]);
  return out;
}

export function decodeMulaw(bytes: Buffer): Int16Array {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = mulawToLinear(bytes[i]);
  return out;
}

/** n ms of mu-law silence (0xFF), base64: a fixture for "silence" frames. */
export function mulawSilenceBase64(ms: number): string {
  return Buffer.alloc(Math.round(ms * MULAW_BYTES_PER_MS), 0xff).toString('base64');
}
