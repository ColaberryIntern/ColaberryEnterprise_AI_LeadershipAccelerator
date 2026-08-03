/**
 * reflectGatingReconciler — self-heals the reflect-chain `unlock_rules`
 * invariant across every (program, week)'s reflect-bucket eval/survey/
 * reflection cards.
 *
 * Runs on every boot (idempotent, read-mostly — only writes cards that are
 * actually wrong) so any card created outside the createCard() auto-gate hook
 * (seed scripts, legacy migrations) or added out of order (e.g. an evaluation
 * added after its week's survey already existed) self-heals on the next
 * deploy — the exact failure that left Week 6/10's evaluations ungated in
 * prod on 2026-07-22. Scoped to what getFeed actually serves (published,
 * active, cohort_id null) so it never touches archived/draft duplicates.
 */
import { Op } from 'sequelize';
import TimelineCard from '../../models/TimelineCard';
import { normalizeRules, UnlockPredicate } from './timelineGatingService';
import { REFLECT_GATED_TYPES, reflectGateFor, reflectSiblingFlags, rulesEqual } from './reflectGating';

interface ReflectCardLike { id: string; type: string; unlock_rules: any }

/**
 * PURE — given ALL reflect-bucket eval/survey/reflection cards of ONE
 * (program, week) group, return the {id, rules} pairs whose CURRENT
 * unlock_rules don't match the computed target chain.
 */
export function reflectGateDrift(cards: ReflectCardLike[]): Array<{ id: string; rules: UnlockPredicate[] }> {
  const siblings = reflectSiblingFlags(cards);
  const drift: Array<{ id: string; rules: UnlockPredicate[] }> = [];
  for (const c of cards) {
    const target = reflectGateFor(c.type, siblings);
    if (!target) continue;
    if (!rulesEqual(normalizeRules(c.unlock_rules), target)) drift.push({ id: c.id, rules: target });
  }
  return drift;
}

/** Repair any reflect-chain gating drift across every served (program, week). Returns counts. */
export async function reconcileReflectGating(): Promise<{ checked: number; fixed: number }> {
  const cards = await TimelineCard.findAll({
    where: {
      cohort_id: null,
      status: 'active',
      visibility: 'published',
      bucket: 'reflect',
      type: { [Op.in]: REFLECT_GATED_TYPES as unknown as string[] },
    },
    attributes: ['id', 'type', 'unlock_rules', 'program_id', 'week'],
  });

  const groups = new Map<string, ReflectCardLike[]>();
  for (const c of cards) {
    const key = `${c.program_id}|${c.week}`;
    const arr = groups.get(key) || [];
    arr.push({ id: c.id, type: c.type, unlock_rules: c.unlock_rules });
    groups.set(key, arr);
  }

  let fixed = 0;
  for (const group of groups.values()) {
    for (const d of reflectGateDrift(group)) {
      await TimelineCard.update({ unlock_rules: d.rules }, { where: { id: d.id } });
      fixed++;
    }
  }
  return { checked: cards.length, fixed };
}
