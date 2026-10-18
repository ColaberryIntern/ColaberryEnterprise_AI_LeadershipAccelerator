/**
 * WHICH SAMPLED FRAME IS WORTH SHOWING — pure arithmetic, no ffmpeg, no files.
 *
 * The card used the frame at one second, and Ali pointed out the hole: a learner
 * with their camera off gives you black, and a screen share that has not started
 * gives you a bare desktop. Neither tells anyone which demo they are looking at.
 *
 * THE TARGET IS AN INFORMATIVE FRAME, NOT A FACE. Half the corpus is
 * `shared_screen_with_speaker_view`, where the thing worth seeing is the slide and
 * the face is a tile in the corner; the other half is `active_speaker`, where a
 * camera-off learner has no face in any frame at all. A face detector would find
 * nothing on one half and nothing extra on the other, and would still need this
 * rule underneath it as a fallback. So this IS the rule.
 *
 * HOW A FRAME IS SCORED. Two numbers from a grayscale histogram:
 *
 *   - SPREAD: how much of the tonal range is actually used. A black frame, a white
 *     frame and a flat desktop all collapse into a few adjacent buckets.
 *   - BUSYNESS: how many buckets carry a meaningful share of the pixels. A blank
 *     frame with a cursor on it has spread but almost no busyness; a slide full of
 *     text and diagrams has both.
 *
 * Both are needed. Spread alone rewards a black frame with one bright dialog;
 * busyness alone rewards noise. A frame has to be tonally varied AND broadly
 * occupied before it beats the alternatives.
 *
 * DELIBERATELY NOT AN EDGE DETECTOR OR A MODEL. Those are better at this, and both
 * mean either a native dependency or an ML runtime in an image that currently
 * needs neither. A histogram is a loop over bytes; it is enough to tell "there is
 * something here" from "there is nothing here", which is the entire question.
 */

/** Below this, a frame is treated as blank regardless of which frames it beat. */
export const MIN_USEFUL_SCORE = 0.08;

export interface FrameCandidate {
  /** Where in the video this frame came from, in seconds. */
  atSeconds: number;
  /** 256-bucket grayscale histogram: counts per luma value. */
  histogram: number[];
}

export interface ScoredFrame extends FrameCandidate {
  score: number;
  spread: number;
  busyness: number;
}

/**
 * Score one histogram in [0, 1]. A uniform frame scores ~0; a varied, broadly
 * occupied one approaches 1.
 */
export function scoreHistogram(histogram: number[]): { score: number; spread: number; busyness: number } {
  const buckets = Array.isArray(histogram) ? histogram : [];
  const total = buckets.reduce((n, c) => n + (Number(c) || 0), 0);
  if (total <= 0) return { score: 0, spread: 0, busyness: 0 };

  // SPREAD: the tonal distance between the 5th and 95th percentile, normalised.
  // Percentiles rather than min/max, so one stray bright pixel on a black frame
  // does not read as a full tonal range.
  const at = (fraction: number): number => {
    let seen = 0;
    const target = total * fraction;
    for (let i = 0; i < buckets.length; i += 1) {
      seen += Number(buckets[i]) || 0;
      if (seen >= target) return i;
    }
    return buckets.length - 1;
  };
  const spread = Math.max(0, Math.min(1, (at(0.95) - at(0.05)) / 255));

  // BUSYNESS: the share of buckets holding at least 0.1% of the pixels. A flat
  // frame concentrates everything into a handful of buckets however bright it is.
  const floor = total * 0.001;
  const occupied = buckets.reduce((n, c) => n + ((Number(c) || 0) >= floor ? 1 : 0), 0);
  const busyness = Math.max(0, Math.min(1, occupied / buckets.length));

  // Multiplied, not averaged: a frame must have BOTH. Averaging would let a black
  // frame with one bright dialog score half marks on spread alone.
  return { score: spread * busyness, spread, busyness };
}

/**
 * The frame worth showing, or null when every candidate is blank.
 *
 * Null is a real answer, not a failure: a camera-off speaker recording is black
 * from end to end, and inventing a "best" black frame would put a column of
 * identical dark rectangles in the feed. The caller falls back to a generated
 * card, which at least says whose demo it is.
 *
 * TIES GO TO THE EARLIER FRAME. Two equally informative frames are equally good
 * as a thumbnail, and the earlier one is likelier to be the title slide than the
 * middle of a scroll.
 */
export function pickBestFrame(candidates: FrameCandidate[]): ScoredFrame | null {
  const scored: ScoredFrame[] = (candidates || []).map((c) => ({
    ...c,
    ...scoreHistogram(c.histogram),
  }));

  let best: ScoredFrame | null = null;
  for (const f of scored) {
    if (f.score < MIN_USEFUL_SCORE) continue;
    if (!best || f.score > best.score) best = f;
  }
  return best;
}

/**
 * Where to sample, given a duration.
 *
 * NEVER AT ZERO: the first frame is a fade-in or a black leader often enough to
 * be worth skipping outright. Never in the last 10% either, where a screen share
 * has usually already stopped.
 *
 * A short take gets fewer samples. Eight probes into a 20-second clip costs more
 * than it can possibly learn.
 */
export function sampleOffsets(durationSeconds: number | null, max = 8): number[] {
  const d = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 0;
  // Unknown duration: one probe, far enough in to clear a fade.
  if (d <= 0) return [2];
  if (d <= 10) return [Math.max(1, Math.round(d * 0.3))];

  const usableStart = d * 0.05;
  const usableEnd = d * 0.9;
  const n = Math.max(2, Math.min(max, Math.floor(d / 15) + 2));
  const step = (usableEnd - usableStart) / (n - 1);

  const offsets: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = Math.round((usableStart + step * i) * 10) / 10;
    if (!offsets.includes(t)) offsets.push(t);
  }
  return offsets;
}
