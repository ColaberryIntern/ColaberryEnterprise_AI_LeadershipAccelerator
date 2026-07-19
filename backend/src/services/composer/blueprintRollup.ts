/**
 * blueprintRollup — keep `curriculum_blueprints.estimated_hours` a live sum of the
 * week's curriculum items instead of a hand-typed number. The week total is the
 * sum of every active `timeline_card`'s `estimated_time` (minutes) for that
 * (program_id, week), including the live sessions, rolled up to hours.
 *
 * Called from every place cards change (publish, create/update/delete/clone) and
 * from generate (pre-publish, off the plan). No-op when the week has no blueprint.
 */
import TimelineCard from '../../models/TimelineCard';
import CurriculumBlueprint from '../../models/CurriculumBlueprint';
import type { CurriculumPlan } from './types';

/** Sum the minutes of all ACTIVE cards for a (program, week). */
export async function sumWeekMinutes(programId: string, week: number): Promise<number> {
  const rows = (await TimelineCard.findAll({
    where: { program_id: programId, week, status: 'active' },
    attributes: ['estimated_time'],
    raw: true,
  })) as unknown as Array<{ estimated_time: number | null }>;
  return rows.reduce((acc, r) => acc + (Number(r.estimated_time) || 0), 0);
}

/** Minutes → hours, rounded to one decimal (e.g. 486 → 8.1). */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/** Sum minutes from a not-yet-published plan's cards (pre-publish fallback). */
export function planMinutes(plan: CurriculumPlan | null | undefined): number {
  const cards = (plan?.cards || []) as Array<{ estimated_time?: number | null }>;
  return cards.reduce((acc, c) => acc + (Number(c.estimated_time) || 0), 0);
}

/**
 * Recompute and persist `estimated_hours` for the blueprint at (programId, week)
 * from the live timeline cards. Falls back to the stored plan's card minutes when
 * no live cards exist yet (so the number is sensible before publish). No-op — and
 * returns null — when there is no blueprint row for that week.
 */
export async function recomputeBlueprintHours(
  programId?: string | null,
  week?: number | null,
): Promise<number | null> {
  if (!programId || week == null) return null;
  const bp = await CurriculumBlueprint.findOne({
    where: { program_id: programId, week },
    order: [['updated_at', 'DESC']],
  });
  if (!bp) return null;

  const liveMinutes = await sumWeekMinutes(programId, week);
  const minutes = liveMinutes > 0 ? liveMinutes : planMinutes(bp.generated_plan);
  const hours = minutesToHours(minutes);
  await bp.update({ estimated_hours: hours });
  return hours;
}

/** Convenience for card-mutation hooks: recompute from a card's (program_id, week). */
export async function recomputeForCard(
  card: { program_id?: string | null; week?: number | null } | null | undefined,
): Promise<number | null> {
  if (!card) return null;
  return recomputeBlueprintHours(card.program_id ?? null, card.week ?? null);
}

/** Recompute a de-duplicated set of (program_id, week) keys (e.g. old+new week on a move). */
export async function recomputeMany(
  keys: Array<{ program_id?: string | null; week?: number | null }>,
): Promise<void> {
  const seen = new Set<string>();
  for (const k of keys) {
    if (!k.program_id || k.week == null) continue;
    const key = `${k.program_id}::${k.week}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await recomputeBlueprintHours(k.program_id, k.week);
  }
}
