/**
 * Pull and read a Zoom cloud-recording TRANSCRIPT.
 *
 * ## Why this is not part of zoomService
 *
 * `zoomService.ts` owns MP4 selection for class recordings and is already over CLAUDE.md's size
 * ceiling. Transcripts are a different job with a different selection rule, so they get their own
 * module rather than widening that one.
 *
 * ## The three traps this module exists to avoid
 *
 * 1. **A recurring meeting id has MANY instances for one day.** `zoomService`'s header records the
 *    real incident: Zoom held SIX instances for one class meeting, four of them throwaway starts.
 *    `/meetings/{id}/recordings` returns only the LATEST instance, so asking it for "the 10am
 *    meeting" silently answers with whatever ran last. We therefore list past instances and select
 *    deliberately — see `selectInstanceNearestLocalTime`.
 *
 * 2. **Instance UUIDs must sometimes be double-encoded.** Zoom's own documented rule: if a UUID
 *    begins with `/` or contains `//`, it has to be URL-encoded TWICE or the request 404s. A
 *    single encode works for most UUIDs, which is exactly why this breaks intermittently and
 *    looks like a missing recording.
 *
 * 3. **Local time is not an offset.** The ask is always "the 10am CST meeting", and the US dropped
 *    to CST on 2026-11-01, so a hardcoded -6 or -5 is right half the year and wrong the other
 *    half. We convert through `Intl` with a real IANA zone instead of arithmetic.
 */
import { zoomApiRequest, getZoomAccessToken, zoomFetchWithTimeout } from './zoomApiClient';

/** A past occurrence of a meeting id. */
export interface ZoomPastInstance {
  readonly uuid: string;
  /** ISO-8601 UTC, as Zoom returns it. */
  readonly start_time: string;
}

/** One file belonging to a recording. Only the fields this module reads are declared. */
export interface ZoomRecordingFileLite {
  readonly id?: string;
  readonly file_type: string;
  readonly file_extension?: string;
  readonly download_url: string;
  readonly recording_start?: string;
  readonly recording_end?: string;
  readonly file_size?: number;
}

export interface ZoomRecordingDetail {
  readonly uuid?: string;
  readonly topic?: string;
  readonly start_time?: string;
  readonly duration?: number;
  readonly recording_files?: readonly ZoomRecordingFileLite[];
}

// ---------------------------------------------------------------------------
// Pure helpers. Everything here is unit-tested without touching the network.
// ---------------------------------------------------------------------------

/**
 * Zoom's documented encoding rule for meeting/instance UUIDs: double-encode when the UUID starts
 * with `/` or contains `//`. Applied to the raw UUID, never to an already-encoded one.
 */
export function encodeMeetingUuid(uuid: string): string {
  const once = encodeURIComponent(uuid);
  if (uuid.startsWith('/') || uuid.includes('//')) return encodeURIComponent(once);
  return once;
}

/**
 * The wall-clock time of a UTC instant in a named zone, as `HH:MM`.
 *
 * Uses `Intl` rather than an offset so DST is the zone database's problem and not ours.
 */
export function localHhMm(isoUtc: string, timeZone: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable instant: ${isoUtc}`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Intl can render midnight as "24" in some ICU builds; normalise so arithmetic below is sane.
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

/** The calendar date of a UTC instant in a named zone, as `YYYY-MM-DD`. */
export function localDate(isoUtc: string, timeZone: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable instant: ${isoUtc}`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`expected HH:MM, got "${hhmm}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface InstanceSelection {
  readonly chosen: ZoomPastInstance | null;
  /** Every instance on the target local date, with its local time — the audit trail. */
  readonly considered: readonly { uuid: string; localTime: string; driftMinutes: number }[];
  readonly reason: string;
}

/**
 * Pick the instance whose LOCAL start time is nearest the target, among instances on the target
 * LOCAL date.
 *
 * Returns the full consideration set, not just the winner. That is deliberate: when the answer is
 * wrong, the useful question is "what else was there", and a selector that discards its
 * alternatives cannot answer it. `zoomService`'s six-instance incident was diagnosed exactly that
 * way.
 *
 * `maxDriftMinutes` refuses rather than guesses. A meeting that actually started 4 hours from the
 * requested time is not the meeting that was asked for, and silently returning it is how the wrong
 * recording gets presented as the right one.
 */
export function selectInstanceNearestLocalTime(
  instances: readonly ZoomPastInstance[],
  targetLocalDate: string,
  targetLocalTime: string,
  timeZone: string,
  maxDriftMinutes = 120,
): InstanceSelection {
  const targetMin = hhmmToMinutes(targetLocalTime);
  const considered = instances
    .filter((i) => localDate(i.start_time, timeZone) === targetLocalDate)
    .map((i) => {
      const localTime = localHhMm(i.start_time, timeZone);
      return { uuid: i.uuid, localTime, driftMinutes: Math.abs(hhmmToMinutes(localTime) - targetMin) };
    })
    .sort((a, b) => a.driftMinutes - b.driftMinutes);

  if (considered.length === 0) {
    return { chosen: null, considered, reason: `no instance on ${targetLocalDate} (${timeZone})` };
  }
  const best = considered[0];
  if (best.driftMinutes > maxDriftMinutes) {
    return {
      chosen: null,
      considered,
      reason: `nearest instance is ${best.localTime}, ${best.driftMinutes} min from ${targetLocalTime}`
        + ` — over the ${maxDriftMinutes} min limit, so refusing rather than guessing`,
    };
  }
  const chosen = instances.find((i) => i.uuid === best.uuid) ?? null;
  return {
    chosen,
    considered,
    reason: `chose ${best.localTime} (${best.driftMinutes} min from ${targetLocalTime})`,
  };
}

/**
 * The transcript file among a recording's files.
 *
 * Zoom exposes machine transcription as `file_type: 'TRANSCRIPT'` (a `.VTT`). `CC` is the
 * closed-caption track, which is a different artifact that happens to also be VTT; it is accepted
 * only as a fallback and the caller is told which one it got.
 */
export function pickTranscriptFile(
  files: readonly ZoomRecordingFileLite[] | undefined,
): { file: ZoomRecordingFileLite; kind: 'TRANSCRIPT' | 'CC' } | null {
  const list = files ?? [];
  const transcript = list.find((f) => String(f.file_type).toUpperCase() === 'TRANSCRIPT');
  if (transcript) return { file: transcript, kind: 'TRANSCRIPT' };
  const cc = list.find((f) => String(f.file_type).toUpperCase() === 'CC');
  if (cc) return { file: cc, kind: 'CC' };
  return null;
}

export interface VttCue {
  readonly start: string;
  readonly end: string;
  readonly speaker: string | null;
  readonly text: string;
}

/** A prefix that could be a display name: short, few words, not a finished sentence. */
function nameShapedPrefix(raw: string): string | null {
  const m = /^([^:]{1,60}):\s+(.*)$/.exec(raw);
  if (!m || !m[2]) return null;
  const candidate = m[1].trim();
  if (!candidate || /[.?!]$/.test(candidate)) return null;
  if (candidate.split(/\s+/).length > 5) return null;
  return candidate;
}

/** Every token starts uppercase — how Zoom display names read, and how sentences do not. */
function looksTitleCase(candidate: string): boolean {
  return candidate.split(/\s+/).every((w) => /^[A-Z0-9]/.test(w));
}

/**
 * Parse a WEBVTT body into cues.
 *
 * Tolerant on purpose: Zoom emits an index line before most cues but not all, uses both `.` and
 * `,` as the millisecond separator depending on the producer, and may wrap a long caption across
 * lines. A strict parser throws on a real file; this one keeps what it understands.
 *
 * ## Speaker attribution is decided over the WHOLE transcript, not one cue
 *
 * Zoom writes `Name: text`, but English writes `We agreed on this: the human reviews`. Judged one
 * cue at a time those are indistinguishable — the first attempt here classified that sentence as a
 * speaker called "We agreed on this", because it is short, four words, and has no end stop.
 *
 * So a prefix is accepted as a speaker when EITHER it reads like a display name (every token
 * starts uppercase) OR it recurs at least three times. The second clause is what rescues a
 * lowercase display name; the first is what rescues a speaker who only talks once. A sentence
 * fragment satisfies neither, because fragments contain lowercase function words and rarely repeat
 * verbatim.
 *
 * Known limit, stated rather than hidden: a display name containing a lowercase particle
 * ("Ali van der Berg") fails the title-case test and is only recovered by recurrence.
 */
export function parseVtt(vtt: string): VttCue[] {
  const TIMING = /^\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/;
  const lines = String(vtt).replace(/\r\n/g, '\n').split('\n');

  // Pass 1: collect raw cues and tally every name-shaped prefix.
  const raws: { start: string; end: string; raw: string }[] = [];
  const prefixCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i += 1) {
    const timing = TIMING.exec(lines[i]);
    if (!timing) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '' || TIMING.test(line)) break;
      // An index line directly after timing is not caption text.
      if (body.length === 0 && /^\d+$/.test(line.trim())) continue;
      body.push(line.trim());
    }
    const raw = body.join(' ').trim();
    if (!raw) continue;
    raws.push({ start: timing[1].replace(',', '.'), end: timing[2].replace(',', '.'), raw });
    const candidate = nameShapedPrefix(raw);
    if (candidate) prefixCounts.set(candidate, (prefixCounts.get(candidate) ?? 0) + 1);
  }

  // Pass 2: a prefix becomes a speaker only with corpus-level support.
  return raws.map(({ start, end, raw }) => {
    const candidate = nameShapedPrefix(raw);
    const accepted = candidate !== null
      && (looksTitleCase(candidate) || (prefixCounts.get(candidate) ?? 0) >= 3);
    if (!accepted) return { start, end, speaker: null, text: raw };
    return {
      start,
      end,
      speaker: candidate,
      text: raw.slice(raw.indexOf(':') + 1).trim(),
    };
  });
}

/** Readable transcript: consecutive cues from one speaker merged into a paragraph. */
export function renderTranscript(cues: readonly VttCue[]): string {
  const out: string[] = [];
  let speaker: string | null | undefined;
  let buf: string[] = [];
  let openedAt = '';

  const flush = (): void => {
    if (buf.length === 0) return;
    out.push(`[${openedAt}] ${speaker ?? 'UNKNOWN'}: ${buf.join(' ')}`);
    buf = [];
  };

  for (const c of cues) {
    if (c.speaker !== speaker) {
      flush();
      speaker = c.speaker;
      openedAt = c.start;
    }
    buf.push(c.text);
  }
  flush();
  return out.join('\n\n');
}

/**
 * Cues whose speaker matches, plus `context` cues either side so a reply reads with its question.
 *
 * Returning the neighbours matters for the thing this was built for: "what did Ali and Akiwam
 * agree" is not answerable from one side of the exchange.
 */
export function speakerExchange(
  cues: readonly VttCue[],
  namePattern: RegExp,
  context = 3,
): VttCue[] {
  const keep = new Set<number>();
  cues.forEach((c, idx) => {
    if (c.speaker && namePattern.test(c.speaker)) {
      for (let k = Math.max(0, idx - context); k <= Math.min(cues.length - 1, idx + context); k += 1) {
        keep.add(k);
      }
    }
  });
  return [...keep].sort((a, b) => a - b).map((i) => cues[i]);
}

// ---------------------------------------------------------------------------
// Network. Thin wrappers; the logic above is what gets tested.
// ---------------------------------------------------------------------------

/** Past occurrences of a meeting id, oldest first. Empty when Zoom has none. */
export async function listPastInstances(meetingId: string): Promise<ZoomPastInstance[]> {
  const data = await zoomApiRequest<{ meetings?: ZoomPastInstance[] }>(
    'GET', `/past_meetings/${encodeURIComponent(meetingId)}/instances`,
  );
  return [...(data.meetings ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/** The recording detail for a meeting id OR a specific instance UUID. */
export async function getRecordingDetail(meetingIdOrUuid: string): Promise<ZoomRecordingDetail> {
  const isUuid = !/^\d+$/.test(meetingIdOrUuid.replace(/\s/g, ''));
  const seg = isUuid ? encodeMeetingUuid(meetingIdOrUuid) : encodeURIComponent(meetingIdOrUuid);
  return zoomApiRequest<ZoomRecordingDetail>('GET', `/meetings/${seg}/recordings`);
}

/**
 * Download a transcript file's body.
 *
 * The download host wants the S2S bearer token; `zoomApiRequest` cannot be reused because the URL
 * is absolute and the response is text, not JSON.
 */
export async function downloadTranscriptBody(file: ZoomRecordingFileLite): Promise<string> {
  const token = await getZoomAccessToken();
  const res = await zoomFetchWithTimeout(
    file.download_url,
    { headers: { Authorization: `Bearer ${token}` } },
    60_000,
  );
  if (!res.ok) {
    throw new Error(`Zoom transcript download error ${res.status} for ${file.file_type}`);
  }
  return res.text();
}
