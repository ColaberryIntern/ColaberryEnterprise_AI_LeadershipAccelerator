/**
 * buildStationReconciler — enforces the invariant "at most ONE published build
 * station per (program, week, cohort)".
 *
 * The Build Artifact(s) Lab render_band covers BOTH `implementation_task` and
 * `artifact_submission` — they render identically (pick artifact + project, build,
 * upload). A week that publishes both shows the student two near-identical build
 * stations. We keep the `implementation_task` (the "build" framing) and archive any
 * published `artifact_submission` in the same week's build lane.
 *
 * This runs on every boot (idempotent) so a re-scaffold / backfill that re-publishes
 * the duplicate self-heals on the next deploy — the exact failure that resurrected
 * Week 1's "Submit Your Project Artifact" after a manual dedup. A week whose ONLY
 * build station is an artifact_submission (no implementation_task) is left untouched.
 */
import { Op } from 'sequelize';
import TimelineCard from '../../models/TimelineCard';

interface CardLike { id: string; type: string; visibility: string; status: string }

/**
 * Pure decision: given all build-lane cards of ONE (program, week, cohort) group,
 * return the ids of the duplicate build stations to archive — the published
 * `artifact_submission` card(s), but only when a published `implementation_task`
 * also exists in the group (so a lone artifact_submission is never orphaned).
 */
export function duplicateBuildStationIds(cards: CardLike[]): string[] {
  const live = cards.filter((c) => c.visibility === 'published' && c.status === 'active');
  const hasImpl = live.some((c) => c.type === 'implementation_task');
  if (!hasImpl) return [];
  return live.filter((c) => c.type === 'artifact_submission').map((c) => c.id);
}

/** Archive duplicate build stations across every (program, week, cohort). Returns the count archived. */
export async function reconcileBuildStationLayout(): Promise<{ archived: number }> {
  const cards = await TimelineCard.findAll({
    where: { type: { [Op.in]: ['implementation_task', 'artifact_submission'] }, bucket: 'build' },
    attributes: ['id', 'type', 'visibility', 'status', 'program_id', 'week', 'cohort_id'],
  });

  const groups = new Map<string, CardLike[]>();
  for (const c of cards) {
    const key = `${(c as any).program_id}|${c.week}|${(c as any).cohort_id}`;
    const arr = groups.get(key) || [];
    arr.push({ id: c.id, type: c.type, visibility: (c as any).visibility, status: (c as any).status });
    groups.set(key, arr);
  }

  const toArchive: string[] = [];
  for (const group of groups.values()) toArchive.push(...duplicateBuildStationIds(group));

  if (toArchive.length) {
    await TimelineCard.update({ visibility: 'archived' }, { where: { id: { [Op.in]: toArchive } } });
  }
  return { archived: toArchive.length };
}
