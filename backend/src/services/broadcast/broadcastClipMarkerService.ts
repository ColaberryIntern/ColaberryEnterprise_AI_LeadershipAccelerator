/**
 * Record where a clip starts, when the instructor advances the show (L7.3).
 *
 * The rules are in `broadcastClipMarkerPolicy`; this is the I/O that feeds them and the one
 * write that follows. Same split as the health and replay loops, for the same reason: the
 * decision can be argued with in a test without a database.
 *
 * IT MUST NEVER BE ABLE TO BREAK THE SHOW. This runs on every slide advance, inside the request
 * the instructor's deck makes to move the class forward. A clip marker is a by-product; the
 * advance is the thing that matters. So every path here swallows its own failure and logs it,
 * and the caller is expected to fire this without awaiting a result it would act on.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { decideClipMarker, type ResolvedSlide } from './broadcastClipMarkerPolicy';

export interface MarkerContext {
  sessionId: string;
  slideIndex: number;
  /** What the deck asserted. Used only to detect drift, never as content. */
  deckTitle: string | null;
  nowMs?: number;
}

export interface ClipMarkerDeps {
  /** The airing this session is bound to, if any. */
  loadOccurrence?: (sessionId: string) => Promise<{
    id: string; editorial_state: string; content_started_at: Date | null;
  } | null>;
  /** The slide at this index on the CURRENT spec, not the deck's frozen copy. */
  resolveSlide?: (sessionId: string, slideIndex: number) => Promise<ResolvedSlide | null>;
  insert?: (occurrenceId: string, marker: {
    slideIndex: number; timecodeSeconds: number; label: string;
    segmentId: string; segmentLabel: string; slideTitle: string;
  }) => Promise<void>;
  log?: (line: string) => void;
}

function logLine(event: string, context: Record<string, unknown>, outcome: 'success' | 'failure' = 'success'): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'broadcast',
    event,
    outcome,
    ...(outcome === 'failure' ? { error_class: String(context.error_class ?? 'ClipMarkerError') } : {}),
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
 * The slide at this index on the live spec.
 *
 * Required lazily for the same reason `slidesForSession` does it: the kit builder reaches the
 * Sequelize models, and importing them at module load pulls a live connection into every
 * consumer of this file.
 */
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

async function insertMarker(occurrenceId: string, m: {
  slideIndex: number; timecodeSeconds: number; label: string;
  segmentId: string; segmentLabel: string; slideTitle: string;
}): Promise<void> {
  // ON CONFLICT DO NOTHING against the unique (occurrence_id, slide_index): stepping back and
  // forward again must not mint a second marker for one moment. The database arbitrates rather
  // than a check-then-write in here, which would race with itself on a fast advance.
  await sequelize.query(
    `INSERT INTO broadcast_clip_markers
       (occurrence_id, slide_index, timecode_seconds, label, segment_id, segment_label, slide_title)
     VALUES (:occurrenceId, :slideIndex, :timecodeSeconds, :label, :segmentId, :segmentLabel, :slideTitle)
     ON CONFLICT (occurrence_id, slide_index) DO NOTHING`,
    {
      replacements: {
        occurrenceId,
        slideIndex: m.slideIndex,
        timecodeSeconds: m.timecodeSeconds,
        label: m.label,
        segmentId: m.segmentId || null,
        segmentLabel: m.segmentLabel || null,
        slideTitle: m.slideTitle || null,
      },
    },
  );
}

/**
 * Mark the moment, or say why not. Never throws.
 *
 * Returns the decision reason so a test can assert on it; the production caller ignores it.
 */
export async function recordClipMarker(
  ctx: MarkerContext,
  deps: ClipMarkerDeps = {},
): Promise<string> {
  const log = deps.log ?? ((l: string) => console.warn(l));
  try {
    const loadOccurrence = deps.loadOccurrence ?? loadOccurrenceForSession;
    const resolveSlide = deps.resolveSlide ?? resolveSlideFromSpec;
    const insert = deps.insert ?? insertMarker;

    const occ = await loadOccurrence(ctx.sessionId);
    const slide = occ ? await resolveSlide(ctx.sessionId, ctx.slideIndex) : null;

    const decision = decideClipMarker({
      occurrenceId: occ ? occ.id : null,
      editorialState: occ ? occ.editorial_state : null,
      contentStartedAtMs: occ && occ.content_started_at ? new Date(occ.content_started_at).getTime() : null,
      nowMs: ctx.nowMs ?? Date.now(),
      slideIndex: ctx.slideIndex,
      deckTitle: ctx.deckTitle,
      slide,
    });

    if (!decision.record) return decision.reason;

    await insert(occ!.id, decision.marker);
    log(logLine('broadcast_clip_marked', {
      occurrenceId: occ!.id,
      slideIndex: decision.marker.slideIndex,
      timecodeSeconds: decision.marker.timecodeSeconds,
      label: decision.marker.label,
    }));
    return 'recorded';
  } catch (err: any) {
    // A failed marker must never surface to the instructor mid-class.
    log(logLine('broadcast_clip_mark_failed', {
      sessionId: ctx.sessionId, slideIndex: ctx.slideIndex, error: err?.message ?? 'unknown',
    }, 'failure'));
    return 'failed';
  }
}

export interface StoredClipMarker {
  slide_index: number;
  timecode_seconds: number;
  label: string;
  segment_label: string | null;
  slide_title: string | null;
}

/** The clip list for one airing, in the order it happened. */
export async function listClipMarkers(occurrenceId: string): Promise<StoredClipMarker[]> {
  return sequelize.query<StoredClipMarker>(
    `SELECT slide_index, timecode_seconds, label, segment_label, slide_title
       FROM broadcast_clip_markers
      WHERE occurrence_id = :occurrenceId
      ORDER BY timecode_seconds ASC, slide_index ASC`,
    { replacements: { occurrenceId }, type: QueryTypes.SELECT },
  );
}
