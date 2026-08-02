/**
 * capeDiagnosticService — the 6-10 minute "Adaptive confirmation" challenge
 * (design doc §5) and the backend half of "Test out" (§11). Both a
 * system-prompted diagnostic and a learner-initiated "test out" flow through
 * these exact same two functions — `trigger` is stored for
 * analytics/explainability only and never branches the scoring logic (task
 * instruction: not a separate ad hoc mechanism).
 *
 * `startDiagnostic` performs no DB write — the item bank is deterministic
 * given `skillId`, so there is nothing to persist until the learner submits.
 * `submitDiagnosticAttempt` is the ONLY write path onto `diagnostic_attempts`,
 * via `findOrCreate` keyed on `idempotency_key` — a retried submit with the
 * same `attemptId` returns the ALREADY-STORED outcome rather than re-scoring
 * or duplicating (append-only, insert-only, matching
 * capeEvidenceLedgerService.ts's established convention).
 *
 * Outcomes feed ONLY the placement path (`capePlacementService.ts` reads the
 * latest `diagnostic_attempts` row) — never `student_skill_evidence`'s
 * verified bands in this phase (see capePlacementService.ts doc comment and
 * execution-contract.md Assumption 4 for the full rationale).
 */
import { randomUUID } from 'crypto';
import { DiagnosticAttempt } from '../../models';
import type { DiagnosticOutcome, DiagnosticTrigger } from '../../models/DiagnosticAttempt';
import { getDiagnosticItems, isValidDiagnosticSkillId, toPublicItem, PublicDiagnosticItem } from '../../constants/diagnosticItemBank';

export class CapeDiagnosticError extends Error {
  error_class = 'ValidationError';
  status = 400;
  constructor(message: string) { super(message); this.name = 'CapeDiagnosticError'; }
}

export interface StartDiagnosticResult {
  attempt_id: string;
  skill_id: string;
  trigger: DiagnosticTrigger;
  items: PublicDiagnosticItem[];
}

/** Returns a fresh attempt_id + the item set (answer keys stripped). No DB write. */
export function startDiagnostic(skillId: string, trigger: DiagnosticTrigger = 'diagnostic_prompt'): StartDiagnosticResult {
  if (!isValidDiagnosticSkillId(skillId)) {
    throw new CapeDiagnosticError(`unknown skill_id: ${skillId}`);
  }
  const items = getDiagnosticItems(skillId);
  if (items.length === 0) {
    throw new CapeDiagnosticError(`no diagnostic items configured for skill_id: ${skillId}`);
  }
  return {
    attempt_id: randomUUID(),
    skill_id: skillId,
    trigger,
    items: items.map(toPublicItem),
  };
}

export interface SubmitAnswer { item_id: string; selected_option: string; }
export interface SubmitDiagnosticResult {
  outcome: DiagnosticOutcome;
  bridge_recommended: boolean;
  created: boolean;
}

function scoreOutcome(items: ReturnType<typeof getDiagnosticItems>, answers: SubmitAnswer[]): { outcome: DiagnosticOutcome; correctCount: number } {
  const answerByItem = new Map(answers.map((a) => [a.item_id, a.selected_option]));
  let correctCount = 0;
  for (const item of items) {
    if (answerByItem.get(item.id) === item.correct_option) correctCount += 1;
  }
  const total = items.length;
  let outcome: DiagnosticOutcome;
  if (correctCount === total) outcome = 'confirmed';
  else if (correctCount === 0) outcome = 'not_confirmed';
  else outcome = 'partial';
  return { outcome, correctCount };
}

/**
 * Scores `answers` against the item bank and writes ONE append-only
 * `diagnostic_attempts` row, idempotency-keyed on `diagnostic:<attemptId>:<skillId>`.
 * A retried submit with the same `attemptId` for the same `skillId` returns
 * the row's ALREADY-COMPUTED outcome (findOrCreate) — it never re-scores
 * against a possibly-different `answers` payload on retry, which is the
 * correct idempotent behavior (the FIRST submission is authoritative).
 */
export async function submitDiagnosticAttempt(
  enrollmentId: string,
  skillId: string,
  attemptId: string,
  answers: SubmitAnswer[],
  trigger: DiagnosticTrigger = 'diagnostic_prompt',
): Promise<SubmitDiagnosticResult> {
  if (!isValidDiagnosticSkillId(skillId)) {
    throw new CapeDiagnosticError(`unknown skill_id: ${skillId}`);
  }
  const items = getDiagnosticItems(skillId);
  if (items.length === 0) {
    throw new CapeDiagnosticError(`no diagnostic items configured for skill_id: ${skillId}`);
  }
  // Defensive at the service boundary regardless of the route's Zod
  // validation (CLAUDE.md: a service must be safe even called directly, and
  // a generic Error/TypeError is not an acceptable classification here).
  if (!Array.isArray(answers) || answers.some((a) => !a || typeof a.item_id !== 'string' || typeof a.selected_option !== 'string')) {
    throw new CapeDiagnosticError('answers must be a non-empty array of { item_id, selected_option } strings');
  }

  const { outcome } = scoreOutcome(items, answers);
  const idempotency_key = `diagnostic:${attemptId}:${skillId}`;

  // Stored for admin/explainability (§5 "so an admin can explain or correct
  // it") — which items were asked, what was answered, and the resulting
  // score, WITHOUT re-exposing the answer key beyond what was already public.
  const auditRecord = items.map((item) => ({
    item_id: item.id,
    kind: item.kind,
    selected_option: answers.find((a) => a.item_id === item.id)?.selected_option ?? null,
    correct: answers.find((a) => a.item_id === item.id)?.selected_option === item.correct_option,
  }));

  const [row, created] = await DiagnosticAttempt.findOrCreate({
    where: { idempotency_key },
    defaults: {
      enrollment_id: enrollmentId,
      skill_id: skillId,
      trigger,
      items: auditRecord,
      outcome,
      idempotency_key,
    },
  });

  return {
    outcome: (row as any).outcome,
    bridge_recommended: (row as any).outcome === 'partial',
    created,
  };
}
