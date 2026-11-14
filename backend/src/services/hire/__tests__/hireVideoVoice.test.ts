import { framePitch, RATE, readVoice, voiceTrack } from '../hireVideoVoice';

/** Pitch and loudness from raw PCM, checked against synthetic tones whose answer is known. */
function tone(seconds: number, hz: (t: number) => number, amp = 0.5): Int16Array {
  const n = Math.floor(seconds * RATE); const out = new Int16Array(n); let phase = 0;
  for (let i = 0; i < n; i += 1) { phase += (2 * Math.PI * hz(i / RATE)) / RATE; out[i] = Math.round(Math.sin(phase) * amp * 32767); }
  return out;
}

describe('framePitch', () => {
  test('finds a 200 Hz tone within 3%', () => {
    const f = new Float32Array(320); for (let i = 0; i < 320; i += 1) f[i] = Math.sin((2 * Math.PI * 200 * i) / RATE);
    expect(Math.abs(framePitch(f)! - 200)).toBeLessThan(6);
  });

  test('silence and noise have no pitch', () => {
    expect(framePitch(new Float32Array(320))).toBeNull();
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
    const noise = new Float32Array(320).map(() => rnd());
    expect(framePitch(noise)).toBeNull();
  });
});

describe('voiceTrack', () => {
  test('a flat tone has almost no pitch variation; a gliding one has more', () => {
    const flat = voiceTrack(tone(6, () => 180));
    const glide = voiceTrack(tone(6, (t) => 150 + 50 * Math.sin(t * 2)));
    expect(flat.pitchVariation!).toBeLessThan(0.5);
    expect(glide.pitchVariation!).toBeGreaterThan(flat.pitchVariation! + 1);
  });

  test('energy is one 0..1 value per half second, louder half higher', () => {
    const quiet = tone(2, () => 180, 0.05); const loud = tone(2, () => 180, 0.6);
    const both = new Int16Array(quiet.length + loud.length); both.set(quiet); both.set(loud, quiet.length);
    const v = voiceTrack(both);
    expect(v.energy.length).toBeGreaterThanOrEqual(7);
    expect(v.energy.every((e) => e >= 0 && e <= 1)).toBe(true);
    expect(v.energy[v.energy.length - 1]).toBeGreaterThan(v.energy[0]);
  });

  test('too little voice gives nulls rather than a guess', () => {
    expect(voiceTrack(new Int16Array(RATE))).toMatchObject({ pitchVariation: null, loudnessRange: null });
  });
});

test('readVoice never throws: a failed decode is null', async () => {
  expect(await readVoice('x.mp4', async () => { throw new Error('ffmpeg missing'); })).toBeNull();
});
