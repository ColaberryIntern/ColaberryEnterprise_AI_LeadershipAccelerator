/**
 * Voice Lab (VS3.4): voice previews and blind A/B comparisons. Places no calls.
 *
 * Previews: OpenAI text-to-speech with a catalog voice (voiceCatalog.ts). Authenticated (admin
 * routes), rate-limited per admin and globally (in-process sliding window: a restart forgets it,
 * which can only ever allow a few extra previews, each a fraction of a cent), 15 s timeout, no retry.
 * The text is capped and never logged.
 *
 * Blind A/B: a trial stores which voice is X and which is Y (random order) in voice_evaluation_runs
 * (scenario_set 'voice_ab'). Until the trial is scored, NOTHING the API returns names a voice: not
 * the trial, not the clip URLs, not an error. Scoring records the preference and only then reveals.
 */
import { randomInt } from 'crypto';
import { z } from 'zod';
import { REALTIME_VOICES, isPreviewable } from './voiceCatalog';

export const PREVIEW_MODEL = 'gpt-4o-mini-tts';
export const MAX_PREVIEW_CHARS = 300;
export const PER_ADMIN_PER_HOUR = 20;
export const GLOBAL_PER_HOUR = 100;
const HOUR_MS = 60 * 60 * 1000;

export class LabError extends Error {
  constructor(public readonly errorClass: 'ValidationError' | 'RateLimitError' | 'NotFound' | 'Conflict' | 'UpstreamUnavailable' | 'ConfigMissing', message: string) {
    super(message);
    this.name = errorClass;
  }
}

/** Sliding-window limiter: per key and global. */
export class PreviewLimiter {
  private readonly hits = new Map<string, number[]>();
  private global: number[] = [];
  constructor(private readonly perKey = PER_ADMIN_PER_HOUR, private readonly perAll = GLOBAL_PER_HOUR) {}
  take(key: string, now = Date.now()): boolean {
    const keep = (xs: number[]) => xs.filter((t) => now - t < HOUR_MS);
    const mine = keep(this.hits.get(key) ?? []);
    this.global = keep(this.global);
    if (mine.length >= this.perKey || this.global.length >= this.perAll) { this.hits.set(key, mine); return false; }
    mine.push(now);
    this.global.push(now);
    this.hits.set(key, mine);
    return true;
  }
}

export const PreviewSchema = z.object({ voice: z.enum(REALTIME_VOICES), text: z.string().trim().min(1).max(MAX_PREVIEW_CHARS) }).strict();
export const AbCreateSchema = z.object({ voiceA: z.enum(REALTIME_VOICES), voiceB: z.enum(REALTIME_VOICES), text: z.string().trim().min(1).max(MAX_PREVIEW_CHARS) }).strict()
  .refine((v) => v.voiceA !== v.voiceB, 'pick two different voices');
export const AbScoreSchema = z.object({ preferred: z.enum(['X', 'Y', 'tie']), note: z.string().max(500).optional() }).strict();

export type Synth = (voice: string, text: string) => Promise<Buffer>;

/** OpenAI TTS. The key never leaves the server and is never logged. */
export function openAiSynth(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Synth {
  return async (voice, text) => {
    if (!apiKey) throw new LabError('ConfigMissing', 'OPENAI_API_KEY is not set');
    if (!isPreviewable(voice)) throw new LabError('ValidationError', 'voice is not in the catalog');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetchImpl('https://api.openai.com/v1/audio/speech', {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: PREVIEW_MODEL, voice, input: text, response_format: 'mp3' }),
      });
      if (res.status === 429) throw new LabError('RateLimitError', 'the speech provider is rate limiting');
      if (!res.ok) throw new LabError('UpstreamUnavailable', `speech provider status ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e instanceof LabError) throw e;
      throw new LabError('UpstreamUnavailable', (e as Error).name === 'AbortError' ? 'speech provider timed out' : 'speech provider unreachable');
    } finally {
      clearTimeout(t);
    }
  };
}

export interface AbTrial { id: string; x: string; y: string; text: string; preferred: 'X' | 'Y' | 'tie' | null; scoredBy: string | null }

export interface TrialStore {
  create: (t: Omit<AbTrial, 'id' | 'preferred' | 'scoredBy'>, createdBy: string) => Promise<string>;
  get: (id: string) => Promise<AbTrial | null>;
  /** Atomic: scores only an unscored trial; returns the scored trial, or null if it was already scored. */
  score: (id: string, preferred: 'X' | 'Y' | 'tie', by: string, note?: string) => Promise<AbTrial | null>;
}

/** What the API may say about a trial: before scoring, labels only. */
export function publicTrial(t: AbTrial): Record<string, unknown> {
  const base = { trialId: t.id, text: t.text, clips: [{ label: 'X' }, { label: 'Y' }] };
  return t.preferred === null ? { ...base, scored: false } : { ...base, scored: true, preferred: t.preferred, reveal: { X: t.x, Y: t.y } };
}

export async function createTrial(store: TrialStore, input: unknown, by: string, coin: () => number = () => randomInt(2)): Promise<Record<string, unknown>> {
  const p = AbCreateSchema.safeParse(input);
  if (!p.success) throw new LabError('ValidationError', p.error.issues.map((i) => i.message).join('; '));
  const swap = coin() === 1;
  const id = await store.create({ x: swap ? p.data.voiceB : p.data.voiceA, y: swap ? p.data.voiceA : p.data.voiceB, text: p.data.text }, by);
  return publicTrial({ id, x: '', y: '', text: p.data.text, preferred: null, scoredBy: null });
}

/** The voice behind a clip label, for synthesis only. Never returned to the client. */
export async function clipVoice(store: TrialStore, id: string, label: string): Promise<{ voice: string; text: string }> {
  if (label !== 'X' && label !== 'Y') throw new LabError('ValidationError', 'clip label must be X or Y');
  const t = await store.get(id);
  if (!t) throw new LabError('NotFound', 'no such trial');
  return { voice: label === 'X' ? t.x : t.y, text: t.text };
}

export async function scoreTrial(store: TrialStore, id: string, input: unknown, by: string): Promise<Record<string, unknown>> {
  const p = AbScoreSchema.safeParse(input);
  if (!p.success) throw new LabError('ValidationError', 'preferred must be X, Y or tie');
  const t = await store.score(id, p.data.preferred, by, p.data.note);
  if (!t) {
    const existing = await store.get(id);
    if (!existing) throw new LabError('NotFound', 'no such trial');
    throw new LabError('Conflict', 'this trial was already scored');
  }
  return publicTrial(t);
}
