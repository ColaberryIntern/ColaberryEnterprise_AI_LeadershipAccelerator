import { env } from '../../config/env';
import type { GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import {
  centralDate, createJourneyHandoff, type JourneyHandoffDeps, type JourneyHandoffReason, type JourneyHandoffResult,
} from '../maya/mayaJourneyHandoff';

/**
 * The Explorer tour's opt-in (Colaberry Campus C7): "Have admissions reach out to me" writes ONE Growth Journey handoff.
 *
 * Ali's decision (19 Oct 2026): the click is the consent; nothing is written without it. It is recorded on the row as the trigger
 * reason `campus_tour_opt_in` (the Growth tab's Reason, labeled "Finished the whole tour" in the admissions queue). With no decision
 * behind it, the packet's consent section reads no_decision and consent_basis stays null, exactly like every reply-route handoff.
 *
 * M33/M36 (2026-11-09): the writer logic now lives in maya/mayaJourneyHandoff.ts (create_journey_handoff), the single path by which
 * Maya hands a person to a human. This file is the tour's caller of it and keeps its exported names, result union and log event
 * names, so the Campus contract (POST /api/portal/campus/tour/complete) and its tests are unchanged:
 *   created | already_open -> handoff true; closed | disabled | unavailable -> handoff false. The client shows success copy only for
 *   handoff:true.
 *
 * IDEMPOTENCY: event_ref = campus_tour_opt_in:<enrollment>:<Central date> (see mayaJourneyHandoff.ts).
 */

export type TourHandoffReason = JourneyHandoffReason;
export type TourHandoffResult = JourneyHandoffResult;
export type TourHandoffDeps = JourneyHandoffDeps;

export const TOUR_HANDOFF_REASON = 'campus_tour_opt_in';

export { centralDate };

export async function requestTourHandoff(
  enrollmentId: string, flags: GrowthJourneyFlags = env.growthJourney, asOf: Date = new Date(), deps?: TourHandoffDeps,
): Promise<TourHandoffResult> {
  return createJourneyHandoff(enrollmentId, TOUR_HANDOFF_REASON, flags, asOf, deps, { logPrefix: 'campus_tour_handoff' });
}
