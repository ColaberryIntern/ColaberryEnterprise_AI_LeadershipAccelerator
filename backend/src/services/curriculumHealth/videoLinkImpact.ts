/**
 * videoLinkImpact — pure blast-radius reasoning for a failing curriculum video.
 *
 * "A video is dead" is a fact nobody can act on. "This seals Week 3's evaluation,
 * survey and reflection chain for the live cohort" is. This module turns the
 * former into the latter without any I/O, so the reasoning is unit-testable.
 *
 * The mechanism it encodes, from `timelineGatingService` and `reflectGating`:
 *
 *   a published + active + completable learn card carries a watch requirement
 *     -> a dead embed emits no watch beats
 *       -> the card can never reach 'completed'
 *         -> section_complete{bucket:learn, scope:week} can never be met
 *           -> that week's evaluation stays locked
 *             -> survey (gated on evaluation) and reflection (gated on survey) too.
 *
 * Two asymmetries matter and are easy to get backwards:
 *
 *  1. An ARCHIVED card does not seal anything. `globalCurriculumWhere()` selects
 *     only `visibility='published'`, so an archived card leaves the gate's target
 *     set entirely. Archiving a broken learn card is the emergency release valve,
 *     not the damage. Only student-reachable cards can seal a week.
 *
 *  2. A card with a NULL week cannot seal a week either, because every gate
 *     predicate in production is `scope:'week'`. It is still a broken video worth
 *     reporting, just not a gate incident.
 */

/** The subset of a timeline card this module needs. */
export interface ImpactCard {
  id: string;
  title: string;
  week: number | null;
  bucket: string | null;
  type: string | null;
  visibility: string | null;
  status: string | null;
  cohort_id: string | null;
  program_id: string | null;
  video_id: string | null;
}

export interface CardImpact {
  card_id: string;
  title: string;
  week: number | null;
  bucket: string | null;
  student_reachable: boolean;
  /** True when this card's failure makes its week's gate chain unsatisfiable. */
  seals_week: boolean;
  blocks: string;
}

/** Mirrors `curriculumScope.globalCurriculumWhere()`. Keep the two in step. */
export function isStudentReachable(card: ImpactCard, canonicalProgramId: string): boolean {
  return (
    card.cohort_id === null &&
    card.status === 'active' &&
    card.visibility === 'published' &&
    (card.program_id === null || card.program_id === canonicalProgramId)
  );
}

/**
 * What one failing card actually blocks.
 *
 * `completable` comes from the caller because it is resolved through the
 * curriculum type registry, which is I/O. A non-completable type (announcement,
 * system, event) is excluded from the gate's target set, so it cannot seal.
 */
export function assessCard(
  card: ImpactCard,
  canonicalProgramId: string,
  completable: boolean,
): CardImpact {
  const reachable = isStudentReachable(card, canonicalProgramId);
  const seals =
    reachable && completable && card.bucket === 'learn' && typeof card.week === 'number';

  let blocks: string;
  if (!reachable) {
    blocks = `Nothing. The card is ${card.visibility}/${card.status}, so no student can reach it and no gate counts it.`;
  } else if (seals) {
    blocks = `Week ${card.week}: the card itself, and the whole evaluation -> survey -> reflection chain for that week, because section_complete{bucket:learn, scope:week} can never be satisfied.`;
  } else if (card.bucket !== 'learn') {
    blocks = `The card only. It sits in the '${card.bucket}' bucket, which no gate predicate targets.`;
  } else if (card.week === null) {
    blocks = 'The card only. Its week is NULL and every gate predicate in production is scope:week.';
  } else {
    blocks = `The card only. Its type '${card.type}' is not completable, so the gate excludes it.`;
  }

  return {
    card_id: card.id,
    title: card.title,
    week: card.week,
    bucket: card.bucket,
    student_reachable: reachable,
    seals_week: seals,
    blocks,
  };
}

/** Weeks whose gate chain is sealed, ascending. Feeds the student-impact query. */
export function sealedWeeks(impacts: CardImpact[]): number[] {
  const weeks = new Set<number>();
  for (const i of impacts) {
    if (i.seals_week && typeof i.week === 'number') weeks.add(i.week);
  }
  return Array.from(weeks).sort((a, b) => a - b);
}

/**
 * Severity for an alert, driven by blast radius rather than by failure mode.
 * A dead video nobody can reach is not an emergency; one sealing a live week is.
 */
export function severityFor(sealsWeek: boolean, studentsAffected: number): number {
  if (!sealsWeek) return 3;
  if (studentsAffected >= 50) return 9;
  if (studentsAffected > 0) return 7;
  return 5;
}
