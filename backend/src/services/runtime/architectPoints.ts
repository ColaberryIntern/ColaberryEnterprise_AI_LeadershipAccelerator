/**
 * architectPoints — what the Architect Time Machine tells the student about the
 * engagement points for its card.
 *
 * The card's points are awarded server-side when the experience completes
 * (architectMindsetService.complete -> completeActivity -> onCardCompleted ->
 * awardCardCompletionPoints). There is no "Collect points" button, so the student
 * only knows they were paid if the UI says so. This module supplies that number.
 *
 * Self-heal: when a COMPLETED card is opened, the award is retried. That is safe
 * because awardCardCompletionPoints is idempotent per (enrollment, `card:<id>`)
 * and never throws; it returns 0 when the points are already on the ledger. It
 * closes the gap where the first award silently returned 0 (a transient error)
 * and the student had no other way to get it re-run.
 *
 * Failure modes: any error resolving or awarding yields value/awarded_now of 0,
 * never an exception, so points can never block the experience from loading.
 */
import { awardCardCompletionPoints, resolveCardEngagementPoints, CardLike } from '../progression/cardPointsService';

export interface ArchitectPointsView {
  value: number;        // the card's worth (its "+N pts" badge), 0 when it carries none
  awarded_now: number;  // points newly credited by this call (0 when already on the ledger)
}

export async function architectPointsView(enrollmentId: string, card: CardLike, completed: boolean): Promise<ArchitectPointsView> {
  let value = 0;
  try { value = await resolveCardEngagementPoints(card); } catch { value = 0; }
  const awarded_now = completed ? await awardCardCompletionPoints(enrollmentId, card) : 0;
  return { value, awarded_now };
}
