import fs from 'fs';
import os from 'os';
import path from 'path';
import { audioArgs, FILLER_PROMPT, readTranscript, transcribe, TranscribeError } from '../hireVideoTranscribe';
import type { Runner } from '../hireVideoTranscode';

/** The OpenAI hand-off: audio out with argument arrays, a strict reply contract, nothing left behind. */
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hire-transcribe-'));
const STREAM = path.join(DIR, 'stream.mp4');
afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const writeAudio: Runner = async (_cmd, args) => { fs.writeFileSync(String(args[args.length - 1]), 'mp3'); return ''; };

describe('readTranscript', () => {
  test('trims, orders and drops empty words', () => {
    const t = readTranscript({ text: ' hi there ', duration: 3, language: 'english', words: [
      { word: ' there', start: 1, end: 1.4 }, { word: 'hi', start: 0.2, end: 0.5 }, { word: '  ', start: 2, end: 2.1 },
    ] });
    expect(t.words.map((w) => w.word)).toEqual(['hi', 'there']);
    expect(t.text).toBe('hi there');
  });

  test('words get the punctuation and casing of the full text, and times are rounded', () => {
    // Real whisper-1 output (2026-11-14): the word list is bare, the text is punctuated.
    const t = readTranscript({ text: "Hi, um, I'm Jordan. I build A.I. agents.", duration: 4, words: [
      { word: 'Hi', start: 0, end: 0.3 }, { word: 'um', start: 0.800000011920929, end: 1 }, { word: "I'm", start: 1.1, end: 1.3 },
      { word: 'Jordan', start: 1.3, end: 1.8 }, { word: 'I', start: 2, end: 2.1 }, { word: 'build', start: 2.1, end: 2.4 },
      { word: 'AI', start: 2.4, end: 2.8 }, { word: 'agents', start: 2.8, end: 3.3 },
    ] });
    expect(t.words.map((w) => w.word)).toEqual(['Hi,', 'um,', "I'm", 'Jordan.', 'I', 'build', 'A.I.', 'agents.']);
    expect(t.words[1].start).toBe(0.8);
  });

  test('a reply of the wrong shape is a ContractViolation, never a half transcript', () => {
    expect(() => readTranscript({ text: 1 })).toThrow(TranscribeError);
    try { readTranscript(null); } catch (e) { expect((e as TranscribeError).error_class).toBe('ContractViolation'); }
  });
});

describe('transcribe', () => {
  test('extracts mono 16 kHz audio with an argument array and removes it afterwards', async () => {
    expect(audioArgs('in.mp4', 'out.mp3')).toEqual(expect.arrayContaining(['-vn', '-ac', '1', '-ar', '16000']));
    let seen = '';
    const t = await transcribe(STREAM, async (file) => { seen = file; return { text: 'hi', duration: 1, words: [{ word: 'hi', start: 0, end: 0.3 }] }; }, writeAudio);
    expect(t.words).toHaveLength(1);
    expect(path.basename(seen)).toBe('speech.mp3');
    expect(fs.existsSync(seen)).toBe(false);
  });

  test('classifies API failures and still removes the audio', async () => {
    const fail = (status: number) => transcribe(STREAM, async () => { throw Object.assign(new Error('x'), { status }); }, writeAudio);
    await expect(fail(429)).rejects.toMatchObject({ error_class: 'RateLimitError' });
    await expect(fail(401)).rejects.toMatchObject({ error_class: 'AuthError' });
    await expect(fail(503)).rejects.toMatchObject({ error_class: 'UpstreamUnavailable' });
    expect(fs.existsSync(path.join(DIR, 'speech.mp3'))).toBe(false);
  });

  test('an unreadable audio track is a MediaError', async () => {
    await expect(transcribe(STREAM, async () => ({}), async () => { throw new Error('ffmpeg'); })).rejects.toMatchObject({ error_class: 'MediaError' });
  });

  test('the prompt carries fillers, OpenAI\'s documented way to keep them in the transcript', () => {
    expect(FILLER_PROMPT).toMatch(/\bUmm\b/);
    expect(FILLER_PROMPT).toMatch(/\buh\b/);
  });
});
