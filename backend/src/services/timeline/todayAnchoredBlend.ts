/**
 * todayAnchoredBlend — PURE round-robin interleave of several ordered queues
 * into one. This is the Today feed's cross-surface blend: Class + Project +
 * Community each arrive as their own ordered queue, and this fuses them so the
 * feed shows a varied mix (a bit of each) rather than all of one surface then
 * the next. Each queue's internal order is preserved; shorter queues drain and
 * the rest continue. No I/O. Used by ./todayAnchoredSources.
 */
export function blendSurfaces<T>(queues: T[][]): T[] {
  const out: T[] = [];
  const cursors = queues.map(() => 0);
  let remaining = queues.reduce((n, q) => n + q.length, 0);
  while (remaining > 0) {
    for (let i = 0; i < queues.length; i++) {
      const c = cursors[i];
      if (c < queues[i].length) {
        out.push(queues[i][c]);
        cursors[i] = c + 1;
        remaining -= 1;
      }
    }
  }
  return out;
}
