/**
 * cardDwellService — the generic dwell gate for passive-content curriculum types
 * (intel breakdowns, reflections, discussions, study, Q&A) that award points but
 * have no other completion criteria. Ali's rule: you must sit with the content for
 * N continuous seconds (never under 2 minutes) before the Collect button appears,
 * and leaving restarts the clock.
 *
 * Mirrors watchProgressService exactly: pure math in dwellGateMath, state stored in
 * `timeline_card_progress.analytics.dwell` (read-merge-update), and a 422 gate
 * (`assertDwellRequirement`) wired into onCardCompleted. Only dwell-gated types
 * (dwellGateConfig) are affected — everything else passes through untouched.
 */
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import { accumulateDwell, meetsDwell, type DwellState } from './dwellGateMath';
import { dwellSecondsFor } from './dwellGateConfig';

export interface DwellVerdict { dwell_s: number; required_s: number; met: boolean; }

/** Record one dwell heartbeat and return the gate status for the UI. */
export async function recordDwellBeat(enrollmentId: string, cardId: string, beat: { delta_s: number }): Promise<DwellVerdict> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || card.visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });

  const requiredS = dwellSecondsFor(card);
  if (requiredS == null) return { dwell_s: 0, required_s: 0, met: true };   // type isn't dwell-gated

  const [progress] = await TimelineCardProgress.findOrCreate({
    where: { card_id: cardId, enrollment_id: enrollmentId },
    defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'available' },
  });
  if (progress.status === 'completed') return { dwell_s: requiredS, required_s: requiredS, met: true };

  const analytics = progress.analytics && typeof progress.analytics === 'object' ? { ...progress.analytics } : {};
  const dwell = accumulateDwell(analytics.dwell, beat, new Date().toISOString(), requiredS);
  analytics.dwell = dwell;
  await progress.update({ analytics, started_at: progress.started_at || new Date() });

  return meetsDwell(dwell, requiredS);
}

/**
 * Completion gate: for a dwell-gated card, block collection until the required
 * continuous dwell has been met. Same 422 shape as the watch/read gates. No-op for
 * types that aren't dwell-gated, and never re-gates an already-completed card.
 */
export async function assertDwellRequirement(enrollmentId: string, card: { id: string; type?: string | null; render_band?: string | null }): Promise<void> {
  const requiredS = dwellSecondsFor(card);
  if (requiredS == null) return;
  const progress = await TimelineCardProgress.findOne({ where: { card_id: card.id, enrollment_id: enrollmentId } });
  if (progress?.status === 'completed') return;
  const verdict = meetsDwell((progress?.analytics?.dwell ?? null) as DwellState | null, requiredS);
  if (verdict.met) return;
  const left = Math.max(1, verdict.required_s - verdict.dwell_s);
  throw Object.assign(
    new Error(`Spend about ${left}s more with this open to collect your points.`),
    { status: 422, code: 'dwell_requirement', dwell_s: verdict.dwell_s, required_s: verdict.required_s },
  );
}
