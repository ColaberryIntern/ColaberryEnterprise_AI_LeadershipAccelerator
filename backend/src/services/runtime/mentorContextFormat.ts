/**
 * mentorContextFormat — the PURE rendering half of mentorContext. No I/O, no
 * model/service imports (the AssessmentResponseItem import is type-only and is
 * erased at build time), so it is unit-testable in isolation and carries the one
 * safety-critical rule: the mentor now holds the answer key, so a graded
 * Evaluation the student has NOT passed must never have its correct option
 * revealed here (they can retake it).
 */
import type { AssessmentResponseItem } from '../../models/AssessmentAttempt';

export const clip = (s: string, n = 160) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export interface AttemptLike {
  kind: string;
  score: number;
  correct_count: number;
  total_count: number;
  passed: boolean | null;
  responses: AssessmentResponseItem[];
}

/**
 * PURE — render one scored attempt for the mentor prompt. For a graded Evaluation
 * the student has NOT passed, correct options are withheld (retryable) and
 * graded_lock=true; a Knowledge Check (already revealed to the student on submit)
 * or a passed Evaluation reveals the answer + explanation to close the gap.
 */
export function renderAttempt(a: AttemptLike): { text: string; graded_lock: boolean } {
  const graded = a.kind === 'evaluation';
  const reveal = !graded || a.passed === true;
  const graded_lock = graded && a.passed !== true;
  const pct = Math.round((a.score || 0) * 100);
  const lines: string[] = [];
  lines.push(
    `${graded ? 'Evaluation' : 'Knowledge Check'}: ${a.correct_count}/${a.total_count} correct (${pct}%)` +
    `${graded ? (a.passed ? ' — passed' : ' — not yet passed, needs 75%') : ''}.`
  );
  const items = Array.isArray(a.responses) ? a.responses : [];
  const right = items.filter((it) => it.is_correct);
  const missed = items.filter((it) => !it.is_correct);
  if (right.length) lines.push(`Correct: ${right.map((it) => clip(it.question)).join('; ')}.`);
  for (const it of missed) {
    const picked = it.selected_index != null && it.options?.[it.selected_index] != null
      ? `they chose "${clip(it.options[it.selected_index], 80)}"`
      : 'left blank';
    const answer = reveal && it.options?.[it.correct_index] != null
      ? ` Correct answer: "${clip(it.options[it.correct_index], 80)}"${it.explanation ? ` — ${clip(it.explanation, 200)}` : ''}.`
      : '';
    lines.push(`Missed [${it.competency || 'general'}]: ${clip(it.question)} (${picked}).${answer}`);
  }
  return { text: lines.join('\n'), graded_lock };
}

/** PURE — pull readable strings out of a card's saved non-quiz work blob. */
export function renderSavedWork(sp: any): string {
  if (typeof sp === 'string') return clip(sp, 600);
  if (!sp || typeof sp !== 'object') return '';
  const out: string[] = [];
  if (typeof sp.prompt === 'string' && sp.prompt.trim()) out.push(`Prompt they wrote: "${clip(sp.prompt, 300)}"`);
  if (typeof sp.output === 'string' && sp.output.trim()) out.push(`Output: "${clip(sp.output, 200)}"`);
  if (typeof sp.reflection === 'string' && sp.reflection.trim()) out.push(`Reflection: "${clip(sp.reflection, 300)}"`);
  if (Array.isArray(sp.responses) && sp.responses.length) {
    out.push(`Responses: ${sp.responses.map((r: any) => clip(typeof r === 'string' ? r : JSON.stringify(r), 120)).join(' | ')}`);
  }
  return clip(out.join(' '), 600);
}
