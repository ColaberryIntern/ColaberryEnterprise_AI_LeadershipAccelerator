import {
  buildClipRows,
  clipListFilename,
  csvCell,
  isCandidate,
  toCsv,
} from '../broadcastClipListExport';
import type { StoredClipMarker } from '../broadcastClipMarkerService';

/**
 * R7's first brick — the clip list as a file an editor can open.
 *
 * Three of these tests are the ones that matter.
 *
 * The last clip must have NO end when the occurrence has no `ended_at`, which is the state of
 * real production rows. Filling it in from `now` would grow a duration every time the file was
 * downloaded, and an editor cutting to a length that changes between two downloads has no way
 * to tell which one was wrong.
 *
 * Unsorted input must not produce an edit that runs backwards. Every clip's out point is the
 * next clip's in point, so one row out of order is a negative duration, and the module sorts
 * rather than trusting that the query still has its ORDER BY.
 *
 * And a label with a comma or a quote in it must survive, because labels are a sentence a human
 * wrote and CSV is the one format where getting that wrong corrupts the file silently.
 */

const marker = (over: Partial<StoredClipMarker> = {}): StoredClipMarker => ({
  slide_index: 0,
  timecode_seconds: 0,
  label: 'The moment the demo lands',
  segment_label: 'Build Bay',
  slide_title: 'Live build',
  ...over,
});

const T0 = '2026-11-01T14:00:00.000Z';
/** `content_started_at` plus n seconds. */
const plus = (n: number) => new Date(Date.parse(T0) + n * 1000).toISOString();

describe('which markers are clip candidates', () => {
  it('counts an authored label as a candidate', () => {
    expect(isCandidate(marker())).toBe(true);
  });

  it('does NOT count a label that fell back to the segment', () => {
    // The policy's precedence is publicValue || segmentLabel || slideTitle, so a label equal to
    // the segment label means nobody authored a sentence about this moment.
    expect(isCandidate(marker({ label: 'Build Bay' }))).toBe(false);
  });

  it('does not count a label that fell back to the slide title', () => {
    expect(isCandidate(marker({ label: 'Live build' }))).toBe(false);
  });

  it('does not count an empty or whitespace label', () => {
    expect(isCandidate(marker({ label: '' }))).toBe(false);
    expect(isCandidate(marker({ label: '   ' }))).toBe(false);
  });

  it('survives null fallback columns', () => {
    expect(isCandidate(marker({ segment_label: null, slide_title: null }))).toBe(true);
  });
});

describe('start points become ranges', () => {
  const three = [
    marker({ slide_index: 0, timecode_seconds: 0, label: 'Cold open' }),
    marker({ slide_index: 1, timecode_seconds: 95, label: 'The promise' }),
    marker({ slide_index: 2, timecode_seconds: 600, label: 'The build' }),
  ];

  it("takes each clip's out point from the next clip's in point", () => {
    const rows = buildClipRows(three, { contentStartedAt: T0, endedAt: plus(1800) });

    expect(rows[0].outSeconds).toBe(95);
    expect(rows[0].durationSeconds).toBe(95);
    expect(rows[1].outSeconds).toBe(600);
    expect(rows[1].durationSeconds).toBe(505);
  });

  it('ends the last clip at the end of the recording', () => {
    const rows = buildClipRows(three, { contentStartedAt: T0, endedAt: plus(1800) });

    expect(rows[2].outSeconds).toBe(1800);
    expect(rows[2].durationSeconds).toBe(1200);
    expect(rows[2].outTimecode).toBe('30:00');
  });

  it('LEAVES THE LAST CLIP OPEN when the airing has no recorded end', () => {
    // Which real production rows do not: the column existed from the start and nothing wrote it
    // until L7.4, so the first airing ended cleanly and left no instant. Measuring against
    // `now` instead would hand the editor a length that changes between two downloads.
    const rows = buildClipRows(three, { contentStartedAt: T0, endedAt: null });

    expect(rows[2].outSeconds).toBeNull();
    expect(rows[2].durationSeconds).toBeNull();
    expect(rows[2].outTimecode).toBe('');
    expect(rows[2].durationTimecode).toBe('');
    // The clips before it are unaffected: their ends come from the next marker, not the airing.
    expect(rows[0].outSeconds).toBe(95);
  });

  it('SORTS BEFORE PAIRING, so one row out of order cannot run the edit backwards', () => {
    const shuffled = [three[2], three[0], three[1]];

    const rows = buildClipRows(shuffled, { contentStartedAt: T0, endedAt: plus(1800) });

    expect(rows.map((r) => r.inSeconds)).toEqual([0, 95, 600]);
    expect(rows.map((r) => r.clip)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.durationSeconds === null || r.durationSeconds >= 0)).toBe(true);
  });

  it('reports a zero-length clip rather than hiding it', () => {
    // Two advances inside the same second is real: the instructor moved fast. The duration
    // column tells the truth and the editor can see there is nothing there to cut.
    const rows = buildClipRows(
      [marker({ slide_index: 0, timecode_seconds: 30 }), marker({ slide_index: 1, timecode_seconds: 30 })],
      { contentStartedAt: T0, endedAt: plus(100) },
    );

    expect(rows[0].durationSeconds).toBe(0);
    expect(rows[0].durationTimecode).toBe('00:00');
  });

  it('refuses an end that falls before its own start', () => {
    // An `ended_at` stamped by a path that disagreed with the clock would otherwise produce a
    // clip of negative length — a corrupt file rather than a missing answer.
    const rows = buildClipRows(
      [marker({ timecode_seconds: 900 })],
      { contentStartedAt: T0, endedAt: plus(600) },
    );

    expect(rows[0].outSeconds).toBeNull();
    expect(rows[0].durationSeconds).toBeNull();
  });

  it('treats an airing that ended before it started as having no length', () => {
    const rows = buildClipRows(
      [marker({ timecode_seconds: 10 })],
      { contentStartedAt: plus(600), endedAt: T0 },
    );

    expect(rows[0].outSeconds).toBeNull();
  });

  it('numbers clips from one, in order', () => {
    const rows = buildClipRows(three, { contentStartedAt: T0, endedAt: null });
    expect(rows.map((r) => r.clip)).toEqual([1, 2, 3]);
  });

  it('answers an empty marker list with an empty list', () => {
    expect(buildClipRows([], { contentStartedAt: T0, endedAt: plus(10) })).toEqual([]);
  });
});

describe('CSV escaping', () => {
  it('leaves a plain value alone', () => {
    expect(csvCell('Build Bay')).toBe('Build Bay');
    expect(csvCell(12)).toBe('12');
  });

  it('quotes a value containing a comma', () => {
    expect(csvCell('ship it, then measure')).toBe('"ship it, then measure"');
  });

  it('DOUBLES AN EMBEDDED QUOTE, which is the whole of RFC 4180 that matters here', () => {
    expect(csvCell('the "one thing"')).toBe('"the ""one thing"""');
  });

  it('quotes a value containing a newline', () => {
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('writes a boolean as yes or no, for a person reading the column', () => {
    expect(csvCell(true)).toBe('yes');
    expect(csvCell(false)).toBe('no');
  });
});

describe('the file', () => {
  const rows = buildClipRows(
    [
      marker({ slide_index: 0, timecode_seconds: 0, label: 'Cold open, then the promise' }),
      marker({ slide_index: 1, timecode_seconds: 95, label: 'Build Bay' }),
    ],
    { contentStartedAt: T0, endedAt: null },
  );
  const csv = toCsv(rows);
  const lines = csv.split('\r\n');

  it('opens with a header naming every column', () => {
    expect(lines[0]).toBe(
      'clip,in,out,duration,candidate,label,segment,slide_title,in_seconds,out_seconds,slide_index',
    );
  });

  it('keeps a label with a comma in it as ONE field', () => {
    expect(lines[1]).toContain('"Cold open, then the promise"');
    // Why the quoting is load-bearing rather than decorative: the header has 11 columns, and a
    // naive comma split of this row yields 12. Without the quotes an importer would read the
    // same 12 and shift every column after the label by one.
    expect(lines[0].split(',')).toHaveLength(11);
    expect(lines[1].split(',')).toHaveLength(12);
  });

  it('marks the authored row as a candidate and the fallback row as not', () => {
    expect(lines[1]).toContain(',yes,');
    expect(lines[2]).toContain(',no,');
  });

  it('leaves an unknown out point EMPTY rather than zero', () => {
    // Zero is a real timecode. A 0 here would read as a clip that ends at the start of class.
    const cells = lines[2].split(',');
    expect(cells[2]).toBe('');
    expect(cells[3]).toBe('');
  });

  it('ends with CRLF, as RFC 4180 and Excel both expect', () => {
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('the download filename', () => {
  it('is built from the date and the id, with nothing a header could choke on', () => {
    expect(clipListFilename('11111111-2222-3333-4444-555555555555', T0))
      .toBe('clips-2026-11-01-11111111.csv');
  });

  it('strips anything that is not a letter or a digit', () => {
    expect(clipListFilename('../../etc"\npasswd', T0)).toBe('clips-2026-11-01-etcpassw.csv');
  });

  it('says undated rather than guessing a date', () => {
    expect(clipListFilename('abc', null)).toBe('clips-undated-abc.csv');
  });
});
