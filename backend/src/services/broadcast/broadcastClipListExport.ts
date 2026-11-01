/**
 * The clip list in a form an editor can open (R7's first brick, §9 item 6).
 *
 * WHAT THE STORED MARKERS ARE NOT. A marker is one row per moment the instructor advanced to —
 * a START point, and nothing else. An editor needs RANGES: in, out, duration. The out point is
 * the next marker's in point, which is derivable from rows we already hold, and for the last
 * marker it is the end of the recording — which is only knowable when the occurrence has an
 * `ended_at`. Real production rows have a null `ended_at` (the column existed from the start and
 * nothing wrote it until L7.4), so the last clip legitimately has no end. It is reported as
 * unknown rather than filled in from `now`, which would grow a "duration" every time the page
 * was opened.
 *
 * WHY A CANDIDATE COLUMN IS THE MOST VALUABLE ONE IN THE FILE. A marker is written on EVERY
 * advance, so a 38-minute class produces dozens of them and only a handful are worth cutting.
 * Handing an editor forty undifferentiated rows leaves him scrubbing the video, which is the
 * exact cost this feature exists to remove. `broadcastClipMarkerPolicy` sets `label` to the
 * authored `publicValue` when there is one and falls back to the segment label or the slide
 * title otherwise — so a label that is not equal to either fallback IS the authored sentence,
 * and that is a clip candidate. See `isCandidate` for the one case this gets wrong and the
 * proper fix.
 *
 * CSV, BECAUSE THE EDITOR IS A HUMAN. Ali's instruction for this work was that the video editor
 * is a person and the job is to prepare files for him. A CSV opens in Excel, Numbers, Sheets,
 * Resolve and Premiere; it is also the shape the deck's old in-memory download already used, so
 * it is not a new convention for anyone. Escaping is RFC 4180 and is the one thing here that
 * silently corrupts a file if it is wrong, because labels are free text a human wrote.
 */
import { formatTimecode } from './broadcastClipMarkerPolicy';
import type { StoredClipMarker } from './broadcastClipMarkerService';

/** The two instants that bound the recording. Either may be absent. */
export interface ClipListAiring {
  contentStartedAt: string | Date | null;
  endedAt: string | Date | null;
}

export interface ClipRow {
  /** 1-based position in the list, so a conversation can say "clip 4". */
  clip: number;
  slideIndex: number;
  inSeconds: number;
  /** Null when this is the last clip and the recording has no recorded end. */
  outSeconds: number | null;
  durationSeconds: number | null;
  /** `02:47`, for the human. Empty string where the seconds value is null. */
  inTimecode: string;
  outTimecode: string;
  durationTimecode: string;
  /** Whether a human authored a sentence about what this moment is worth. */
  candidate: boolean;
  label: string;
  segmentLabel: string;
  slideTitle: string;
}

function instantMs(value: string | Date | null): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether this marker carries an authored clip note rather than a fallback.
 *
 * The policy's precedence is `publicValue || segmentLabel || slideTitle`, so a label equal to
 * neither fallback can only have come from `publicValue` — the field whose own authoring hint
 * reads "reminder of what this segment is worth as public content".
 *
 * THE ONE FALSE NEGATIVE, stated rather than hidden: an author who writes a `publicValue` that
 * is character-for-character the segment label or the slide title is read here as a fallback and
 * loses the candidate mark. The clip is still in the file with its timecode, so nothing is lost
 * except the flag. The proper fix is for the write path to store what it chose, which needs a
 * column on a shipped table (its own `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` file, per
 * `ensureBroadcastSchema`'s header rule) and would only help markers recorded after it lands.
 * Deriving it costs nothing and works on the rows that already exist.
 */
export function isCandidate(marker: StoredClipMarker): boolean {
  const label = (marker.label || '').trim();
  if (!label) return false;
  return label !== (marker.segment_label || '').trim()
    && label !== (marker.slide_title || '').trim();
}

/**
 * Turn start points into ranges.
 *
 * Sorted here rather than trusted from the caller: the out point of every clip is the next
 * clip's in point, so one row out of order silently produces a negative duration and an edit
 * that runs backwards. `listClipMarkers` does order them; this does not depend on remembering
 * that.
 */
export function buildClipRows(
  markers: ReadonlyArray<StoredClipMarker>,
  airing: ClipListAiring,
): ClipRow[] {
  const started = instantMs(airing.contentStartedAt);
  const ended = instantMs(airing.endedAt);
  /** The recording's own length, when both ends are known. */
  const recordingSeconds = started !== null && ended !== null && ended >= started
    ? Math.floor((ended - started) / 1000)
    : null;

  const sorted = [...markers].sort(
    (a, b) => a.timecode_seconds - b.timecode_seconds || a.slide_index - b.slide_index,
  );

  return sorted.map((m, i) => {
    const inSeconds = m.timecode_seconds;
    const next = sorted[i + 1];
    /**
     * An end that falls before its own start is not an end. The next marker cannot do that
     * after the sort, but `recordingSeconds` can: a marker written during a reconnect, or an
     * `ended_at` stamped by a path that disagreed with the clock, would produce a clip of
     * negative length. Unknown is the honest answer; a negative duration is a corrupt file.
     */
    const rawOut = next ? next.timecode_seconds : recordingSeconds;
    const outSeconds = rawOut !== null && rawOut >= inSeconds ? rawOut : null;
    const durationSeconds = outSeconds === null ? null : outSeconds - inSeconds;

    return {
      clip: i + 1,
      slideIndex: m.slide_index,
      inSeconds,
      outSeconds,
      durationSeconds,
      inTimecode: formatTimecode(inSeconds),
      outTimecode: outSeconds === null ? '' : formatTimecode(outSeconds),
      durationTimecode: durationSeconds === null ? '' : formatTimecode(durationSeconds),
      candidate: isCandidate(m),
      label: (m.label || '').trim(),
      segmentLabel: (m.segment_label || '').trim(),
      slideTitle: (m.slide_title || '').trim(),
    };
  });
}

/**
 * One CSV cell, per RFC 4180.
 *
 * Quoted only when it has to be, which is what every importer expects: a bare `12` stays a
 * number and a label with a comma in it stays one field. An embedded quote is doubled. This is
 * the function that decides whether the editor's file survives a label like
 * `Ali's "one thing" — ship it, then measure`.
 */
export function csvCell(value: string | number | boolean): string {
  const s = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = [
  'clip', 'in', 'out', 'duration', 'candidate', 'label', 'segment', 'slide_title',
  'in_seconds', 'out_seconds', 'slide_index',
] as const;

/**
 * The file itself. CRLF line endings, because RFC 4180 says so and because this lands on an
 * external editor's machine where Excel is the likely opener.
 *
 * Both the human timecodes and the raw seconds are present: the first is for reading, the second
 * for anything that imports. An unknown out point is an EMPTY cell in both, never a 0 — zero is
 * a real timecode and would read as a clip that ends at the start of the class.
 */
export function toCsv(rows: ReadonlyArray<ClipRow>): string {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([
      csvCell(r.clip),
      csvCell(r.inTimecode),
      csvCell(r.outTimecode),
      csvCell(r.durationTimecode),
      csvCell(r.candidate),
      csvCell(r.label),
      csvCell(r.segmentLabel),
      csvCell(r.slideTitle),
      csvCell(r.inSeconds),
      csvCell(r.outSeconds === null ? '' : r.outSeconds),
      csvCell(r.slideIndex),
    ].join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * A download filename built only from characters that cannot break a header.
 *
 * NO FREE TEXT, DELIBERATELY. The obvious filename carries the class title, and a title with a
 * quote or a newline in it interpolated into `Content-Disposition` is header injection. The id
 * and the date are enough to tell two files apart, and they cannot contain anything hostile
 * after this filter.
 */
export function clipListFilename(sessionId: string, airedOn: string | Date | null): string {
  const safeId = (sessionId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'session';
  const ms = instantMs(airedOn);
  const date = ms === null ? 'undated' : new Date(ms).toISOString().slice(0, 10);
  return `clips-${date}-${safeId}.csv`;
}
