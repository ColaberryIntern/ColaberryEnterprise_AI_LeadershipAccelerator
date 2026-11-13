/**
 * Record a moment a producer CHOSE, while the show is running (D10).
 *
 * Sibling of `broadcastClipMarkerService`, which records the moments the deck produces. Same
 * split as everywhere else in this subtree: the rules are in `broadcastClipMarkerPolicy` and
 * this is the I/O that feeds them plus the one write that follows.
 *
 * ## It differs from its sibling in one way that matters
 *
 * The marker service must never be able to break the show: it runs inside the request the deck
 * makes to advance a slide, so it swallows every failure and the caller does not await it.
 *
 * This one is the OPPOSITE. A press is a person pressing a button and then looking at the
 * screen to see whether it worked. Swallowing a failure here would mean a producer believing a
 * moment was captured when it was not, and finding out after the class when the clip is not in
 * the list. So this returns an outcome the route turns into a status code, and the strip says
 * what happened.
 *
 * Nothing about the slide comes from the client. The press carries only "now"; the server
 * decides which airing it belongs to, how far into the recording it lands, which slide the
 * class is on and whether that slide can be trusted. A client that could name its own timecode
 * could point a clip anywhere in the recording.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { decideLiveClipMark, type ResolvedSlide, type LiveMarkDecision } from './broadcastClipMarkerPolicy';

export interface LiveMarkContext {
  sessionId: string;
  nowMs?: number;
}

export interface LiveMarkDeps {
  loadOccurrence?: (sessionId: string) => Promise<{
    id: string; editorial_state: string; content_started_at: Date | null;
  } | null>;
  /** What the deck last broadcast: where the class is, and what it called that slide. */
  loadDeckPosition?: (sessionId: string) => Promise<{ slideIndex: number | null; title: string | null }>;
  resolveSlide?: (sessionId: string, slideIndex: number) => Promise<ResolvedSlide | null>;
  insert?: (occurrenceId: string, mark: {
    slideIndex: number; timecodeSeconds: number; label: string;
    segmentId: string; segmentLabel: string; slideTitle: string; labelled: boolean;
  }) => Promise<boolean>;
  log?: (line: string) => void;
}

export type LiveMarkOutcome =
  /** Written. `timecodeSeconds` is where it landed, so the strip can say so. */
  | { outcome: 'marked'; timecodeSeconds: number; labelled: boolean }
  /** Already a mark on this second. The press did nothing and that is correct. */
  | { outcome: 'duplicate'; timecodeSeconds: number }
  /** The policy said no. `reason` is the wire value; the client turns it into a sentence. */
  | { outcome: 'refused'; reason: string }
  | { outcome: 'failed' };

function logLine(event: string, context: Record<string, unknown>, outcome: 'success' | 'failure' = 'success'): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'broadcast',
    event,
    outcome,
    ...(outcome === 'failure' ? { error_class: String(context.error_class ?? 'ClipMarkError') } : {}),
    context,
  });
}

/** The occurrence a live session is airing as. The source ref is the only join that exists. */
async function loadOccurrenceForSession(sessionId: string) {
  const rows = await sequelize.query<{
    id: string; editorial_state: string; content_started_at: Date | null;
  }>(
    `SELECT o.id, o.editorial_state, o.content_started_at
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'live_session' AND r.source_id = :sid
      LIMIT 1`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * Where the class is, according to the deck's last broadcast.
 *
 * Required lazily for the same reason the marker service does it: the module reaches Sequelize
 * models, and importing it at load pulls a live connection into every consumer of this file.
 */
async function loadDeckPositionFromBroadcast(sessionId: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { getBroadcast } = require('../sessionLiveStateService');
  const bc = await getBroadcast(sessionId);
  return {
    slideIndex: bc && typeof bc.slide_index === 'number' ? bc.slide_index : null,
    title: bc && bc.title ? String(bc.title) : null,
  };
}

async function resolveSlideFromSpec(sessionId: string, slideIndex: number): Promise<ResolvedSlide | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { slidesForSession } = require('../sessionLiveStateService');
  const slides = await slidesForSession(sessionId);
  const s = slides?.[slideIndex];
  if (!s) return null;
  return {
    title: String(s.title || ''),
    segmentId: String(s.segmentId || ''),
    segmentLabel: String(s.segmentLabel || ''),
    publicValue: s.publicValue ? String(s.publicValue) : undefined,
  };
}

/**
 * The write. Returns whether a row was actually created.
 *
 * ON CONFLICT DO NOTHING against the unique (occurrence_id, timecode_seconds), so a double-tap
 * or a retried request cannot mint two clips of one moment. The RETURNING clause is what makes
 * "already marked" distinguishable from "marked": without it a duplicate press would report
 * success, and a producer pressing twice would have no way to tell that from two marks.
 */
async function insertMark(occurrenceId: string, m: {
  slideIndex: number; timecodeSeconds: number; label: string;
  segmentId: string; segmentLabel: string; slideTitle: string; labelled: boolean;
}): Promise<boolean> {
  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO broadcast_clip_marks
       (occurrence_id, timecode_seconds, slide_index, label, segment_id, segment_label, slide_title, labelled)
     VALUES (:occurrenceId, :timecodeSeconds, :slideIndex, :label, :segmentId, :segmentLabel, :slideTitle, :labelled)
     ON CONFLICT (occurrence_id, timecode_seconds) DO NOTHING
     RETURNING id`,
    {
      replacements: {
        occurrenceId,
        timecodeSeconds: m.timecodeSeconds,
        slideIndex: m.slideIndex,
        label: m.label,
        segmentId: m.segmentId || null,
        segmentLabel: m.segmentLabel || null,
        slideTitle: m.slideTitle || null,
        labelled: m.labelled,
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows.length > 0;
}

/** Mark the moment, and say what happened. Never throws. */
export async function recordLiveClipMark(
  ctx: LiveMarkContext,
  deps: LiveMarkDeps = {},
): Promise<LiveMarkOutcome> {
  const log = deps.log ?? ((l: string) => console.warn(l));
  try {
    const loadOccurrence = deps.loadOccurrence ?? loadOccurrenceForSession;
    const loadDeckPosition = deps.loadDeckPosition ?? loadDeckPositionFromBroadcast;
    const resolveSlide = deps.resolveSlide ?? resolveSlideFromSpec;
    const insert = deps.insert ?? insertMark;

    const occ = await loadOccurrence(ctx.sessionId);
    const position = await loadDeckPosition(ctx.sessionId);
    const slide = occ && position.slideIndex !== null
      ? await resolveSlide(ctx.sessionId, position.slideIndex)
      : null;

    const decision: LiveMarkDecision = decideLiveClipMark({
      occurrenceId: occ ? occ.id : null,
      editorialState: occ ? occ.editorial_state : null,
      contentStartedAtMs: occ && occ.content_started_at
        ? new Date(occ.content_started_at).getTime() : null,
      nowMs: ctx.nowMs ?? Date.now(),
      slideIndex: position.slideIndex as number,
      deckTitle: position.title,
      slide,
    });

    if (!decision.record) {
      log(logLine('broadcast_clip_mark_refused', {
        sessionId: ctx.sessionId, reason: decision.reason,
      }));
      return { outcome: 'refused', reason: decision.reason };
    }

    const created = await insert(occ!.id, { ...decision.marker, labelled: decision.labelled });
    log(logLine(created ? 'broadcast_clip_marked_live' : 'broadcast_clip_mark_duplicate', {
      occurrenceId: occ!.id,
      timecodeSeconds: decision.marker.timecodeSeconds,
      slideIndex: decision.marker.slideIndex,
      labelled: decision.labelled,
    }));

    return created
      ? { outcome: 'marked', timecodeSeconds: decision.marker.timecodeSeconds, labelled: decision.labelled }
      : { outcome: 'duplicate', timecodeSeconds: decision.marker.timecodeSeconds };
  } catch (err: any) {
    log(logLine('broadcast_clip_mark_failed', {
      sessionId: ctx.sessionId, error: err?.message ?? 'unknown',
    }, 'failure'));
    return { outcome: 'failed' };
  }
}

export interface StoredClipMark {
  timecode_seconds: number;
  slide_index: number;
  label: string;
  segment_id: string | null;
  segment_label: string | null;
  slide_title: string | null;
  labelled: boolean;
}

/** Every press for one airing, in recording order. */
export async function listClipMarks(occurrenceId: string): Promise<StoredClipMark[]> {
  return sequelize.query<StoredClipMark>(
    `SELECT timecode_seconds, slide_index, label, segment_id, segment_label, slide_title, labelled
       FROM broadcast_clip_marks
      WHERE occurrence_id = :occurrenceId
      ORDER BY timecode_seconds ASC`,
    { replacements: { occurrenceId }, type: QueryTypes.SELECT },
  );
}
