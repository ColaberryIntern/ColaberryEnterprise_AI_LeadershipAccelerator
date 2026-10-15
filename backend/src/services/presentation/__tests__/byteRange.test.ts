import { parseRange, contentRangeHeader, rangeLength } from '../byteRange';

/**
 * Range handling is what makes a rehearsal recording watchable rather than merely
 * downloadable. Without a 206 the scrub bar does nothing and Safari will not start
 * playback at all — and the entire point of watching yourself back is jumping to the
 * bit where you lost your thread.
 *
 * Nothing else in this backend serves ranges, so there is no prior art to copy and
 * no existing test to lean on. The cases below are the ones browsers actually send.
 */

const SIZE = 1000;

describe('the three forms a browser sends', () => {
  it('an open-ended range: bytes=200-', () => {
    // The common seek. Everything from the offset to the end.
    expect(parseRange('bytes=200-', SIZE)).toEqual({ kind: 'partial', range: { start: 200, end: 999 } });
  });

  it('an explicit window: bytes=0-499', () => {
    expect(parseRange('bytes=0-499', SIZE)).toEqual({ kind: 'partial', range: { start: 0, end: 499 } });
  });

  it('a suffix range: bytes=-500 means the LAST 500 bytes', () => {
    // Not "up to byte 500". Players use this to read an MP4 moov atom at the tail,
    // and reading it as a prefix would hand back the wrong half of the file.
    expect(parseRange('bytes=-500', SIZE)).toEqual({ kind: 'partial', range: { start: 500, end: 999 } });
  });

  it('a suffix larger than the file is the whole file, not an error', () => {
    expect(parseRange('bytes=-5000', SIZE)).toEqual({ kind: 'partial', range: { start: 0, end: 999 } });
  });
});

describe('no range, or one we do not honour, sends the whole file', () => {
  it('no header at all', () => {
    expect(parseRange(undefined, SIZE)).toEqual({ kind: 'full' });
    expect(parseRange(null, SIZE)).toEqual({ kind: 'full' });
    expect(parseRange('', SIZE)).toEqual({ kind: 'full' });
  });

  it('a MULTI-range request is answered whole rather than guessed at', () => {
    // A multipart/byteranges reply is not implemented. Answering `bytes=0-99,200-299`
    // with just the first window would be a 206 that silently omits requested bytes,
    // which is worse than an honest 200.
    expect(parseRange('bytes=0-99,200-299', SIZE)).toEqual({ kind: 'full' });
  });

  it('a unit other than bytes is ignored', () => {
    expect(parseRange('items=0-99', SIZE)).toEqual({ kind: 'full' });
  });

  it('nonsense is ignored rather than throwing mid-stream', () => {
    expect(parseRange('bytes=abc-def', SIZE)).toEqual({ kind: 'full' });
    expect(parseRange('garbage', SIZE)).toEqual({ kind: 'full' });
  });

  it('a bare dash asks for nothing in particular', () => {
    expect(parseRange('bytes=-', SIZE)).toEqual({ kind: 'full' });
  });
});

describe('out of range', () => {
  it('a start at or past EOF is unsatisfiable, which is a 416', () => {
    expect(parseRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=5000-6000', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('an END past EOF is CLAMPED, not refused', () => {
    // RFC 9110: a range whose start is within the file is satisfiable. Browsers
    // routinely ask for more than exists, and refusing would break playback on a
    // file whose length the client guessed high.
    expect(parseRange('bytes=900-99999', SIZE)).toEqual({ kind: 'partial', range: { start: 900, end: 999 } });
  });

  it('an end before the start is unsatisfiable', () => {
    expect(parseRange('bytes=500-100', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('a zero-length suffix is unsatisfiable', () => {
    expect(parseRange('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('an empty file is sent whole rather than range-negotiated', () => {
    expect(parseRange('bytes=0-10', 0)).toEqual({ kind: 'full' });
  });
});

describe('the headers that go back with a 206', () => {
  it('Content-Range counts in the inclusive form the RFC specifies', () => {
    expect(contentRangeHeader({ start: 200, end: 999 }, 1000)).toBe('bytes 200-999/1000');
  });

  it('length is inclusive on both ends, so the +1 is not an off-by-one', () => {
    // 0-0 is one byte. Getting this wrong truncates every response by a byte, which
    // corrupts a video rather than failing loudly.
    expect(rangeLength({ start: 0, end: 0 })).toBe(1);
    expect(rangeLength({ start: 200, end: 999 })).toBe(800);
  });

  it('a whole-file range reports the whole length', () => {
    const r = parseRange('bytes=0-', SIZE);
    expect(r.kind).toBe('partial');
    if (r.kind === 'partial') expect(rangeLength(r.range)).toBe(SIZE);
  });
});
