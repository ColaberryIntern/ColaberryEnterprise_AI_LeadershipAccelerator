/**
 * hireVideoTranscribe - the intro video's words, each with its start and end time, from OpenAI.
 *
 * WHY OPENAI, NOT colaberry/video-analysis. That worker needs an AWS identity this backend does
 * not have; Ali, 2026-11-14: "let's go with Open AI". The OpenAI key is already on the backend and
 * the `openai` package is already a dependency, so this adds no new vendor or package.
 *
 * WHY `whisper-1`. It is the transcription model that returns WORD timestamps
 * (`verbose_json` + `timestamp_granularities: ['word']`); the live playback overlay and every
 * pause/pace metric need them. Overridable with HIRE_TRANSCRIBE_MODEL.
 *
 * FILLERS. Whisper tends to write "um" and "uh" out of the transcript. OpenAI's documented fix is
 * a prompt written in the style wanted, filler words included, which it then imitates.
 *
 * FAILURE. The audio is extracted with ffmpeg (argument array, timeout). The API call has an
 * explicit timeout and the SDK's capped retries (2, exponential backoff, on 408/429/5xx and
 * connection errors). A malformed response is a TranscribeError, never a half-read result.
 */
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import OpenAI from 'openai';
import { execRunner, type Runner } from './hireVideoTranscode';

const EXTRACT_TIMEOUT_MS = 60_000;
const API_TIMEOUT_MS = 120_000;
const API_RETRIES = 2;

/** Written in the style we want back: OpenAI's documented way to keep disfluencies. */
export const FILLER_PROMPT = "Umm, so, uh, let me think. Like, I mean, you know, I've, um, been building, uh, AI systems.";

export class TranscribeError extends Error {
  readonly error_class: string;
  constructor(message: string, errorClass = 'UpstreamUnavailable') { super(message); this.name = 'TranscribeError'; this.error_class = errorClass; }
}

export interface Word { readonly word: string; readonly start: number; readonly end: number }
export interface Transcript { readonly text: string; readonly words: readonly Word[]; readonly duration: number; readonly language: string }

const responseSchema = z.object({
  text: z.string(),
  duration: z.number().nonnegative(),
  language: z.string().default(''),
  words: z.array(z.object({ word: z.string(), start: z.number().nonnegative(), end: z.number().nonnegative() })).default([]),
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, '');

/**
 * Whisper's word list carries no punctuation ("Hi um I'm Jordan"), but its full `text` does.
 * Walk the text's tokens in order and give each word its punctuated form, so captions read
 * properly and a comma around "like" can be seen. A word the text does not match keeps its bare form.
 */
export function punctuate(words: readonly Word[], text: string): Word[] {
  const toks = text.split(/\s+/).filter(Boolean);
  let j = 0;
  return words.map((w) => {
    const key = bare(w.word);
    for (let k = j; k < Math.min(toks.length, j + 4); k += 1) {
      if (bare(toks[k]) === key) { j = k + 1; return { ...w, word: toks[k] }; }
    }
    return w;
  });
}

/** A bad reply never becomes a transcript: words are trimmed, ordered, rounded and empty ones dropped. */
export function readTranscript(raw: unknown): Transcript {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new TranscribeError('Transcription reply did not match the expected shape', 'ContractViolation');
  const text = parsed.data.text.trim();
  const words = parsed.data.words
    .map((w) => ({ word: w.word.trim(), start: round2(w.start), end: round2(Math.max(w.start, w.end)) }))
    .filter((w) => w.word.length > 0)
    .sort((a, b) => a.start - b.start);
  return { text, words: punctuate(words, text), duration: parsed.data.duration, language: parsed.data.language };
}

/** Mono 16 kHz speech-quality MP3: 3 minutes is about 1 MB, far under the API's 25 MB limit. */
export const audioArgs = (stream: string, out: string): string[] =>
  ['-hide_banner', '-loglevel', 'error', '-y', '-i', stream, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', out];

export const transcribeModel = (): string => process.env.HIRE_TRANSCRIBE_MODEL || 'whisper-1';

export type TranscribeCall = (file: string) => Promise<unknown>;

/** The real call. Separate so tests never reach the network. */
export function openAiTranscribe(apiKey = process.env.OPENAI_API_KEY): TranscribeCall {
  return async (file) => {
    if (!apiKey) throw new TranscribeError('OPENAI_API_KEY is not set', 'ConfigError');
    const client = new OpenAI({ apiKey, timeout: API_TIMEOUT_MS, maxRetries: API_RETRIES });
    return client.audio.transcriptions.create({
      file: fs.createReadStream(file),
      model: transcribeModel(),
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      language: 'en',
      prompt: FILLER_PROMPT,
      temperature: 0,
    });
  };
}

/** Extracts the audio next to the rendition, transcribes it, and always removes the audio file. */
export async function transcribe(stream: string, call: TranscribeCall = openAiTranscribe(), run: Runner = execRunner): Promise<Transcript> {
  const audio = path.join(path.dirname(stream), 'speech.mp3');
  try {
    try {
      await run('ffmpeg', audioArgs(stream, audio), EXTRACT_TIMEOUT_MS);
    } catch {
      throw new TranscribeError('Could not extract the audio track', 'MediaError');
    }
    let raw: unknown;
    try {
      raw = await call(audio);
    } catch (err) {
      if (err instanceof TranscribeError) throw err;
      const status = (err as { status?: number })?.status;
      throw new TranscribeError(`Transcription failed${status ? ` (${status})` : ''}`, status === 429 ? 'RateLimitError' : status === 401 ? 'AuthError' : 'UpstreamUnavailable');
    }
    return readTranscript(raw);
  } finally {
    await fs.promises.rm(audio, { force: true });
  }
}
