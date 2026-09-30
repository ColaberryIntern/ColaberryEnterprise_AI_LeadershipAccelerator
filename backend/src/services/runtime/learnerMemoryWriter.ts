/**
 * learnerMemoryWriter — the nightly worker that distills each active student's
 * recent sessions into their evolving LearnerMemory, so the mentor gets to know
 * them over weeks. Pairs with the pure learnerMemoryFormat.
 *
 * Idempotency (NON-NEGOTIABLE): keyed on (enrollment, day) via
 * `last_distilled_on` + a "new activity" check, so re-running the batch the same
 * day is a no-op and produces the same end state.
 *
 * Failure-first: a distillation that throws leaves `last_distilled_on` UNSET, so
 * the next nightly run retries it; the batch isolates per-student failures and
 * logs them (structured). The daily re-run is the recovery path (no partial
 * writes — the LearnerMemory upsert only fires after a successful distill).
 */
import { Op } from 'sequelize';
import LearnerMemory from '../../models/LearnerMemory';
import MentorTurn from '../../models/MentorTurn';
import AssessmentAttempt from '../../models/AssessmentAttempt';
import UserCurriculumProfile from '../../models/UserCurriculumProfile';
import { getSkillGaps } from '../skillGenomeService';
import { chatJson } from './runtimeAi';
import { buildDistillMessages, normalizeDistillation, shouldDistill, DistillInputs } from './learnerMemoryFormat';

const dayStr = (now: Date): string => now.toISOString().slice(0, 10);

export interface DistillResult { distilled: boolean; reason?: string }

/** Distill (or evolve) ONE student's memory. Idempotent per (enrollment, day). */
export async function distillLearnerMemory(enrollmentId: string, now: Date = new Date()): Promise<DistillResult> {
  const today = dayStr(now);
  const existing = await LearnerMemory.findOne({ where: { enrollment_id: enrollmentId } });

  const newest = await MentorTurn.findOne({
    where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']], attributes: ['created_at'],
  });
  const newestTurnAt: Date | null = newest ? (newest as any).created_at : null;
  const lastTurnAt = existing?.last_turn_at ?? null;
  const hasNewActivity = !!newestTurnAt && (!lastTurnAt || new Date(newestTurnAt) > new Date(lastTurnAt));

  if (!shouldDistill(existing?.last_distilled_on ?? null, today, hasNewActivity)) {
    return { distilled: false, reason: existing?.last_distilled_on === today ? 'already_today' : 'no_new_activity' };
  }

  // Gather recent activity (all read-only).
  const turns = await MentorTurn.findAll({
    where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']], limit: 25, attributes: ['question'],
  });
  const recentQuestions = turns
    .map((t: any) => t.question).filter((q: any) => typeof q === 'string' && q.trim()).map((q: string) => q.trim());
  const gaps = await getSkillGaps(enrollmentId).catch(() => [] as any[]);
  const recentGaps = gaps.slice(0, 6).map((g: any) => g.name).filter(Boolean);
  const evals = await AssessmentAttempt.findAll({
    where: { enrollment_id: enrollmentId, kind: 'evaluation' }, order: [['submitted_at', 'DESC']], limit: 6,
    attributes: ['score', 'passed', 'week'],
  });
  const recentEvalNotes = evals.map((e: any) =>
    `Week ${e.week ?? '?'} evaluation: ${Math.round((e.score || 0) * 100)}%${e.passed ? ' passed' : ' not passed'}`);
  const profile = await UserCurriculumProfile.findOne({
    where: { enrollment_id: enrollmentId }, attributes: ['goal'],
  }).catch(() => null);

  const inputs: DistillInputs = {
    priorSummary: existing?.summary ?? null,
    priorMisconceptions: existing?.misconceptions ?? [],
    recentQuestions, recentGaps, recentEvalNotes,
    goalHint: (profile as any)?.goal ?? null,
  };

  const { system, user } = buildDistillMessages(inputs);
  const r = await chatJson('learner_memory_distill', system, user, undefined, 700);
  const mem = normalizeDistillation(r.parsed);

  // Write only after a successful distill (no partial state; safe to re-run).
  // Explicit update-or-create on the existing row keyed by the unique
  // enrollment_id — avoids Sequelize.upsert conflicting on the fresh UUID PK.
  const fields = {
    summary: mem.summary, misconceptions: mem.misconceptions, goals: mem.goals,
    strengths: mem.strengths, last_distilled_on: today, last_turn_at: newestTurnAt,
  };
  if (existing) {
    await existing.update(fields);
  } else {
    await LearnerMemory.create({ enrollment_id: enrollmentId, ...fields } as any);
  }

  return { distilled: true };
}

export interface BatchResult { scanned: number; distilled: number; skipped: number; errors: number }

/** Distill every student who had mentor activity in the last 2 days. Per-student
 *  failures are isolated + logged; the run is safe to repeat (idempotent). */
export async function runLearnerMemoryBatch(now: Date = new Date()): Promise<BatchResult> {
  const since = new Date(now.getTime() - 2 * 86400000);
  const rows = await MentorTurn.findAll({
    where: { created_at: { [Op.gte]: since } }, attributes: ['enrollment_id'], group: ['enrollment_id'],
  });
  const ids = Array.from(new Set(rows.map((r: any) => r.enrollment_id).filter(Boolean)));

  let distilled = 0, skipped = 0, errors = 0;
  for (const eid of ids) {
    try {
      const res = await distillLearnerMemory(eid, now);
      if (res.distilled) distilled++; else skipped++;
    } catch (e: any) {
      errors++;
      console.warn(JSON.stringify({
        level: 'warn', service: 'learner_memory', event: 'distill_failed',
        enrollment_id: eid, error_class: e?.name || 'Error', message: String(e?.message || e),
      }));
    }
  }
  console.log(JSON.stringify({ level: 'info', service: 'learner_memory', event: 'batch_done', scanned: ids.length, distilled, skipped, errors }));
  return { scanned: ids.length, distilled, skipped, errors };
}
