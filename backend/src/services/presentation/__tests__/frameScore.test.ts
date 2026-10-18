import { scoreHistogram, pickBestFrame, sampleOffsets, MIN_USEFUL_SCORE } from '../frameScore';

/**
 * PICKING A FRAME THAT SAYS SOMETHING.
 *
 * The card showed the frame at one second until Ali pointed out the hole: a
 * learner with their camera off gives you black, and a screen share that has not
 * started gives you a bare desktop.
 *
 * These are the shapes that actually occur in the corpus — a black frame from a
 * camera-off `active_speaker` take, a flat desktop before a share begins, a slide
 * full of text — expressed as histograms, so the rule can be tested without
 * ffmpeg, a video file, or a fixture nobody can read.
 */

/** Every pixel the same value: black, white, or a flat fill. */
const flat = (value: number, pixels = 10_000): number[] => {
  const h = new Array(256).fill(0);
  h[value] = pixels;
  return h;
};

/** A dark frame with a small bright region — a dialog on black, a cursor. */
const mostlyDark = (brightPixels = 50, pixels = 10_000): number[] => {
  const h = new Array(256).fill(0);
  h[4] = pixels - brightPixels;
  h[250] = brightPixels;
  return h;
};

/** A desktop: one dominant background tone plus a little chrome. */
const flatDesktop = (pixels = 10_000): number[] => {
  const h = new Array(256).fill(0);
  h[40] = pixels * 0.94;
  h[42] = pixels * 0.03;
  h[200] = pixels * 0.03;
  return h;
};

/** A slide: text, diagrams, background — tone spread widely across the range. */
const busySlide = (pixels = 10_000): number[] => {
  const h = new Array(256).fill(0);
  for (let i = 10; i < 246; i += 1) h[i] = pixels / 236;
  return h;
};

describe('scoring one frame', () => {
  it('an all-black frame scores zero', async () => {
    expect(scoreHistogram(flat(0)).score).toBe(0);
  });

  it('an all-white frame scores zero too — blank is blank at either end', () => {
    expect(scoreHistogram(flat(255)).score).toBe(0);
  });

  it('an empty histogram scores zero rather than dividing by it', () => {
    expect(scoreHistogram([]).score).toBe(0);
    expect(scoreHistogram(new Array(256).fill(0)).score).toBe(0);
  });

  it('a SMALL bright region on black is clipped as an outlier by the percentiles', () => {
    // 0.5% of the frame. min/max would read this as the full tonal range; the
    // 5th-95th percentile treats a cursor or a tiny dialog as the noise it is, so
    // spread collapses before busyness is even consulted.
    const dark = scoreHistogram(mostlyDark(50));
    expect(dark.spread).toBe(0);
    expect(dark.score).toBe(0);
  });

  it('a LARGE bright region on black survives the percentiles, and busyness kills it', () => {
    // 20% of the frame, so the percentiles no longer clip it and spread is near
    // full. THIS is the case the multiplication exists for: two occupied buckets
    // out of 256 is not a picture of anything, and averaging the two measures
    // would hand this frame half marks.
    const dark = scoreHistogram(mostlyDark(2000));
    expect(dark.spread).toBeGreaterThan(0.9);
    expect(dark.busyness).toBeLessThan(0.05);
    expect(dark.score).toBeLessThan(MIN_USEFUL_SCORE);

    const slide = scoreHistogram(busySlide());
    expect(slide.score).toBeGreaterThan(dark.score * 10);
  });

  it('a flat desktop scores below the useful floor', async () => {
    // The camera-off and share-not-started cases both look like this.
    expect(scoreHistogram(flatDesktop()).score).toBeLessThan(MIN_USEFUL_SCORE);
  });

  it('a busy slide scores well above the floor', () => {
    expect(scoreHistogram(busySlide()).score).toBeGreaterThan(MIN_USEFUL_SCORE);
  });

  it('never returns a score outside 0..1', () => {
    for (const h of [flat(0), flat(128), mostlyDark(), flatDesktop(), busySlide()]) {
      const { score } = scoreHistogram(h);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe('choosing among frames', () => {
  it('picks the most informative one', () => {
    const best = pickBestFrame([
      { atSeconds: 1, histogram: flat(0) },
      { atSeconds: 5, histogram: flatDesktop() },
      { atSeconds: 9, histogram: busySlide() },
    ]);
    expect(best?.atSeconds).toBe(9);
  });

  it('RETURNS NULL when every frame is blank, rather than the least-black black', () => {
    // A camera-off speaker recording is black end to end. Inventing a winner here
    // would put a column of identical dark rectangles in the feed; null tells the
    // caller to generate a card instead.
    expect(pickBestFrame([
      { atSeconds: 1, histogram: flat(0) },
      { atSeconds: 4, histogram: flat(0) },
      { atSeconds: 8, histogram: flatDesktop() },
    ])).toBeNull();
  });

  it('returns null for no candidates at all', () => {
    expect(pickBestFrame([])).toBeNull();
  });

  it('ties go to the EARLIER frame — likelier the title slide than a mid-scroll', () => {
    const best = pickBestFrame([
      { atSeconds: 3, histogram: busySlide() },
      { atSeconds: 7, histogram: busySlide() },
    ]);
    expect(best?.atSeconds).toBe(3);
  });

  it('reports the score it chose on, so a decision can be explained', () => {
    const best = pickBestFrame([{ atSeconds: 3, histogram: busySlide() }]);
    expect(best!.score).toBeGreaterThan(MIN_USEFUL_SCORE);
    expect(best!.spread).toBeGreaterThan(0);
    expect(best!.busyness).toBeGreaterThan(0);
  });
});

describe('where to sample', () => {
  it('never samples frame zero — a fade-in is not a thumbnail', () => {
    for (const d of [8, 30, 71, 169, 451]) {
      expect(sampleOffsets(d)[0]).toBeGreaterThan(0);
    }
  });

  it('stays clear of the tail, where a share has usually stopped', () => {
    const offsets = sampleOffsets(100);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(90);
  });

  it('probes a short take once rather than eight times', () => {
    // Eight probes into a 20-second clip costs more than it can learn.
    expect(sampleOffsets(8)).toHaveLength(1);
  });

  it('samples a long take more, but never past the cap', () => {
    expect(sampleOffsets(451).length).toBeLessThanOrEqual(8);
    expect(sampleOffsets(451).length).toBeGreaterThan(sampleOffsets(30).length);
  });

  it('handles an unknown duration with a single safe probe', () => {
    // `duration_seconds` is null on recordings Zoom never reported a length for.
    for (const d of [null, 0, -5, NaN]) {
      expect(sampleOffsets(d as any)).toEqual([2]);
    }
  });

  it('returns strictly increasing, non-duplicated offsets', () => {
    for (const d of [20, 71, 169, 451]) {
      const o = sampleOffsets(d);
      expect(new Set(o).size).toBe(o.length);
      expect([...o].sort((a, b) => a - b)).toEqual(o);
    }
  });
});
