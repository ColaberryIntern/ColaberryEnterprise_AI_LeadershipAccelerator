import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { sessionIdParamSchema } from '../schemas/broadcastSchema';
import { buildRundown, type DeckPosition, type RundownSlide } from '../services/broadcast/broadcastRundown';
// The producer-identity decision, imported rather than restated. Two copies of "who is a
// producer" is the one duplication this surface cannot afford to get wrong — and it lives in
// its own module rather than in the sibling controller so that importing it does not pull that
// file's models, entitlement loaders and provider client in behind a one-line boolean.
import { isStaff } from '../middlewares/participantStaff';

/**
 * GET /api/portal/broadcasts/session/:sessionId/rundown — P4-02's segment rundown.
 *
 * ITS OWN ROUTE, AND NOT PART OF THE PRODUCER READ. The producer read is what puts a class on
 * air; it must keep working when anything else does not. Folding the rundown into it would put
 * the kit spec — a build over the week blueprint, the session, the cohort and the saved kit
 * config — behind the Go Live button, so a content problem would take away the lifecycle
 * control. That is the same argument `broadcastController`'s audience read already makes about
 * telemetry health, and it is why this is a second request rather than four more fields.
 *
 * IT DELIBERATELY DOES NOT RETURN THE CLASS CLOCK. `content_started_at` is already on the
 * producer read, the same page already polls that, and the strip's clock is already computed
 * from it. Sending it twice would create two copies that can disagree across a slow poll, and
 * the one thing a pace verdict must not do is measure against a different start than the clock
 * sitting next to it.
 *
 * STAFF ONLY. A rundown is presenter notes in table form: it names the segments, their planned
 * windows and what each is worth as public content. The refusal precedes the read, so a
 * non-producer learns nothing about whether the session exists.
 */
export async function getSessionRundown(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = sessionIdParamSchema.parse(req.params);

    if (!isStaff(req)) {
      res.status(403).json({ error: 'Forbidden', reason: 'not_a_producer' });
      return;
    }

    /**
     * Required lazily, for the reason `slidesForSession` itself gives: the kit builder reaches
     * the Sequelize models, and importing them at module load pulls a live connection into
     * every consumer of this file.
     */
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { slidesForSession, getBroadcast } = require('../services/sessionLiveStateService');

    const [slides, broadcast] = await Promise.all([
      slidesForSession(sessionId) as Promise<RundownSlide[] | null>,
      getBroadcast(sessionId) as Promise<Record<string, unknown> | null>,
    ]);

    if (!slides) {
      // The session does not exist, or has no week blueprint to build a plan from. Not an
      // error: a rundown is a property of a class that has one, and saying so lets the client
      // render nothing rather than an empty table that reads as a show with no segments.
      res.json({ planned: false, segments: [] });
      return;
    }

    /**
     * `slide_index` IS PASSED THROUGH RAW, which looks like laziness and is the opposite.
     *
     * It comes out of a JSONB column, so nothing about its shape is guaranteed. Narrowing it
     * here would collapse "the deck sent `\"2\"`" into the same `null` as "no deck has ever
     * written to this session" — and those are the two ends of `PositionState`: one is a
     * contract violation worth showing a producer, the other is the ordinary state of most
     * classes. `buildRundown` owns that distinction, so it gets the value as it was stored.
     *
     * The title is narrowed, because there the two cases genuinely are one: a missing title and
     * an empty one both mean the deck did not say, and `deckHasDrifted` takes that as agreement.
     */
    const rawTitle = broadcast?.title;
    const position: DeckPosition = {
      slideIndex: broadcast ? broadcast.slide_index : null,
      deckTitle: typeof rawTitle === 'string' && rawTitle ? rawTitle : null,
    };

    const rundown = buildRundown(slides, position);

    res.json({
      planned: true,
      total_minutes: rundown.totalMinutes,
      slide_count: rundown.slideCount,
      position_state: rundown.positionState,
      current_segment_id: rundown.currentSegmentId,
      current_slide_index: rundown.currentSlideIndex,
      current_slide_title: rundown.currentSlideTitle,
      deck_claimed_title: rundown.deckClaimedTitle,
      // snake_case on the wire, camelCase inside, mapped at the boundary — the same split the
      // clip list makes, so a client reading two broadcast routes meets one convention.
      segments: rundown.segments.map((s) => ({
        id: s.id,
        label: s.label,
        planned_start_min: s.plannedStartMin,
        planned_end_min: s.plannedEndMin,
        first_slide: s.firstSlide,
        last_slide: s.lastSlide,
        slide_count: s.slideCount,
        standing: s.standing,
      })),
    });
  } catch (err: unknown) {
    /**
     * A malformed session id is the caller's mistake, not ours. Handled first and explicitly,
     * because a ZodError carries no `status` and would otherwise fall through to the 500 branch
     * below — reporting a bad UUID as an internal fault and logging it as one.
     */
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
      return;
    }
    const status = Number((err as { status?: number })?.status) || 500;
    const error_class = (err as { error_class?: string })?.error_class || 'UnexpectedError';
    if (status >= 500) {
      // The message is deliberately not logged: a driver error can carry a connection string
      // and stdout is captured by the container runtime. Same rule as the sibling controller.
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
        event: 'broadcast_rundown_failed', outcome: 'failure', error_class,
        context: { error_name: (err as Error)?.name ?? 'unknown' },
      }));
    }
    res.status(status).json({ error: status >= 500 ? 'Internal error' : error_class });
  }
}
