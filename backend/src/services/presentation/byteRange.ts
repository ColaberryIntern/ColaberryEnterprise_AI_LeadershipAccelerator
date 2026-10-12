/**
 * HTTP Range parsing for video playback.
 *
 * WHY THIS IS NEEDED AT ALL. A PDF can be streamed whole and the browser is happy.
 * A `<video>` element cannot: without `Accept-Ranges` and a `206 Partial Content`
 * reply the scrub bar does nothing, and Safari refuses to start playback altogether.
 * Nothing else in this backend serves ranges — every existing download route pipes
 * the whole file — so this is written once, here, as a pure function rather than
 * inline in a route where it could never be tested.
 *
 * A rehearsal recording is the first thing in this product a learner needs to SEEK
 * through. The whole point is watching yourself back, which means jumping to the bit
 * where you lost your thread, not sitting through three minutes from the top.
 *
 * ONLY THE SINGLE-RANGE FORM IS SUPPORTED, which is what every browser sends for
 * media. A multi-range request (`bytes=0-99,200-299`) would need a multipart reply;
 * it is treated as unsatisfiable rather than silently answered with the wrong bytes.
 *
 * Pure: numbers and a string in, numbers out. No fs, no http, no imports.
 */

export interface ByteRange {
  /** First byte to send, inclusive. */
  start: number;
  /** Last byte to send, inclusive — as the Content-Range header counts. */
  end: number;
}

export type RangeOutcome =
  /** No Range header, or one this server does not honour: send the whole file, 200. */
  | { kind: 'full' }
  /** A satisfiable range: send those bytes with 206 and a Content-Range. */
  | { kind: 'partial'; range: ByteRange }
  /** Syntactically valid but outside the file: 416, per RFC 9110. */
  | { kind: 'unsatisfiable' };

/**
 * Decide what to send for a `Range` header against a file of `size` bytes.
 *
 * Accepts the three forms browsers actually send:
 *   bytes=0-            from an offset to the end (the common seek)
 *   bytes=0-1023        an explicit window
 *   bytes=-1024         the LAST n bytes (used to read an MP4 moov atom at the tail)
 *
 * An end past the last byte is CLAMPED rather than refused — RFC 9110 says a range
 * whose start is within the file is satisfiable, and browsers routinely ask for more
 * than exists. Refusing it would break playback on a file whose length the client
 * guessed high.
 */
export function parseRange(header: string | undefined | null, size: number): RangeOutcome {
  if (!header) return { kind: 'full' };
  if (!Number.isFinite(size) || size <= 0) return { kind: 'full' };

  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  // Anything else — multi-range, a unit other than bytes, nonsense — is answered
  // whole rather than guessed at. A wrong 206 is worse than an honest 200.
  if (!m) return { kind: 'full' };

  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return { kind: 'full' };

  let start: number;
  let end: number;

  if (rawStart === '') {
    // Suffix form: the last N bytes. N larger than the file means the whole file.
    const wanted = Number(rawEnd);
    if (!Number.isFinite(wanted) || wanted <= 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - wanted);
    end = size - 1;
  } else {
    start = Number(rawStart);
    if (!Number.isFinite(start) || start < 0) return { kind: 'unsatisfiable' };
    // A start at or past EOF is genuinely unsatisfiable; the client asked for bytes
    // that do not exist.
    if (start >= size) return { kind: 'unsatisfiable' };
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(end)) return { kind: 'unsatisfiable' };
    // Clamp rather than refuse. See the note above.
    if (end > size - 1) end = size - 1;
    if (end < start) return { kind: 'unsatisfiable' };
  }

  return { kind: 'partial', range: { start, end } };
}

/** `Content-Range: bytes <start>-<end>/<size>`, exactly as RFC 9110 spells it. */
export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

/** How many bytes a range covers. Inclusive on both ends, so the +1 is not a bug. */
export function rangeLength(range: ByteRange): number {
  return range.end - range.start + 1;
}
