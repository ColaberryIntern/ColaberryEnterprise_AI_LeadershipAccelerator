/**
 * digitalTwin — the School Digital Twin (v1: Curriculum Twin). Simulates a
 * curriculum change against the frozen Composer engines (read-only) and predicts
 * the impact on evidence, portfolio, GitHub, quality, and workload before any
 * real change is made. Pure over the composer engines — deterministic + safe.
 */
import { scaffoldPlan } from '../composer/composerAi';
import { estimateEvidence } from '../composer/evidenceEngine';
import { validateCurriculum } from '../composer/validationEngine';
import { PlanCard } from '../composer/types';

export interface TwinResult {
  change: { op: 'remove'; type: string };
  before: { cards: number; github_commits: number; portfolio: number; quality: number; workload_hours: number; publishable: boolean };
  after: { cards: number; github_commits: number; portfolio: number; quality: number; workload_hours: number; publishable: boolean };
  deltas: { cards: number; github_commits: number; portfolio: number; quality: number; workload_hours: number };
  verdict: string;
}

function snapshot(cards: PlanCard[]) {
  const ev = estimateEvidence(cards);
  const v = validateCurriculum(cards);
  return { cards: cards.length, github_commits: ev.github.commits, portfolio: ev.portfolio.entries, quality: v.quality, workload_hours: v.workload_hours, publishable: v.publishable };
}

/** PURE-ish — simulate removing an activity type from a canonical week. */
export function simulateRemoval(type: string): TwinResult {
  const base = scaffoldPlan({ title: 'this week' }, 'week').cards;
  const after = base.filter((c) => c.type !== type);
  const b = snapshot(base);
  const a = snapshot(after);
  const deltas = { cards: a.cards - b.cards, github_commits: a.github_commits - b.github_commits, portfolio: a.portfolio - b.portfolio, quality: a.quality - b.quality, workload_hours: Math.round((a.workload_hours - b.workload_hours) * 10) / 10 };
  const parts: string[] = [];
  if (deltas.cards === 0) parts.push(`"${type}" is not in the canonical week — no effect.`);
  else {
    if (deltas.quality < 0) parts.push(`quality drops ${Math.abs(deltas.quality)}`);
    if (!a.publishable && b.publishable) parts.push('the week no longer passes validation (a dependency breaks)');
    if (deltas.github_commits < 0) parts.push(`~${Math.abs(deltas.github_commits)} fewer GitHub commits`);
    if (deltas.portfolio < 0) parts.push(`${Math.abs(deltas.portfolio)} fewer portfolio artifacts`);
    if (parts.length === 0) parts.push('minimal impact — the week stays coherent');
  }
  return { change: { op: 'remove', type }, before: b, after: a, deltas, verdict: `Removing ${type}: ${parts.join('; ')}.` };
}
