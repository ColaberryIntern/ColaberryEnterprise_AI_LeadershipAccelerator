import { classifyError } from '../../utils/errorClassifier';
import {
  modalitiesFor, findModalityViolations, describeMissing,
  type Modality, type RecordingFacts, type ModalityViolation,
} from './presentationModalities';

/**
 * The AI review of a rehearsal: a rubric score, timestamped findings, and three
 * improvements in priority order.
 *
 * IT MAY ONLY TALK ABOUT WHAT WAS RECORDED. An audio-only rehearsal reviewed with
 * "your slides were cluttered and you rarely made eye contact" is worse than no
 * review: both claims are invented, and the student cannot tell which other parts
 * were real. The available modalities are derived from the recording row, named in
 * the prompt as a hard constraint, AND checked again when the review comes back —
 * because an instruction is a request and a check is a guarantee.
 *
 * THREE IMPROVEMENTS, IN PRIORITY ORDER, because a list of eleven is a list nobody
 * acts on. The cap is applied here rather than hoped for in the prompt.
 *
 * IT IS NOT A GRADE. Every row this writes is `evaluator_role = 'ai'` and
 * `visibility = 'private'`. Final grading stays human-controlled; see
 * `presentationFeedbackVisibility.isOfficialGrade`, which refuses to treat an ai row
 * as official no matter who reads it.
 *
 * PROVENANCE IS STORED WITH THE REVIEW: model, rubric version, prompt version. A
 * student asking "why did it say that" six weeks later deserves an answer, and the
 * rubric will have changed by then.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const MODEL = process.env.PRESENTATION_COACH_MODEL || 'gpt-4o';
const WORKFLOW_ID = 'presentation_coach';
const CALL_TIMEOUT_MS = 90_000;
export const MAX_IMPROVEMENTS = 3;

export interface RubricDimension {
  dimension: string;
  weight: number;
  lookFor: string;
}

export interface CoachFinding {
  /** Seconds into the recording, when the evidence is a moment. */
  atSeconds: number | null;
  text: string;
}

export interface CoachReview {
  modalityAnalyzed: Modality[];
  /** Said out loud so silence is never read as approval. */
  notAssessed: string[];
  scores: Array<{ dimension: string; score: number }>;
  findings: CoachFinding[];
  improvements: string[];
  provenance: { model: string; rubricVersion: string; promptVersion: string };
  /** Claims the model made that the recording could not support. Removed, and listed. */
  removed: ModalityViolation[];
}

export type CoachResult =
  | { ok: true; review: CoachReview }
  | { ok: false; reason: 'no_modalities' | 'model_failed' | 'unusable_response'; detail?: string };

/**
 * The constraint block. Stated as what the reviewer MAY NOT say, because a positive
 * list invites the model to fill the gaps.
 */
export function constraintBlock(available: Modality[], missing: Modality[]): string {
  const lines: string[] = [];
  lines.push(`You can observe ONLY these parts of the recording: ${available.join(', ') || 'none'}.`);
  for (const m of missing) {
    lines.push(`- There is no ${m}. Do not comment on it, do not infer it, and do not guess.`);
  }
  lines.push('If you cannot assess something, say that you could not assess it. Never fill a gap with a plausible guess.');
  return lines.join('\n');
}

/** Build the review prompt. Pure, so the constraint can be asserted without a model. */
export function buildCoachPrompt(params: {
  transcript: string | null;
  rubric: RubricDimension[];
  available: Modality[];
  missing: Modality[];
  targetSeconds: number | null;
}): string {
  const { transcript, rubric, available, missing, targetSeconds } = params;
  return [
    'You are reviewing a student rehearsal of a technical demo.',
    '',
    constraintBlock(available, missing),
    '',
    'Score each rubric dimension from 1 to 5:',
    ...rubric.map((r) => `- ${r.dimension} (weight ${r.weight}): ${r.lookFor}`),
    '',
    targetSeconds ? `They were aiming for ${Math.round(targetSeconds / 60)} minutes.` : '',
    '',
    'Return JSON: { "scores": [{"dimension","score"}], "findings": [{"atSeconds","text"}],',
    `"improvements": ["..."] } with AT MOST ${MAX_IMPROVEMENTS} improvements, most important first.`,
    '',
    transcript ? `Transcript:\n${transcript}` : 'No transcript is available.',
  ].filter(Boolean).join('\n');
}

/** Parse the model's JSON without trusting its shape. */
export function parseCoachJson(raw: string): {
  scores: Array<{ dimension: string; score: number }>;
  findings: CoachFinding[];
  improvements: string[];
} | null {
  const text = String(raw || '').trim();
  // The model often wraps JSON in a fence. Take the outermost object.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: any;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;

  const scores = Array.isArray(parsed.scores)
    ? parsed.scores
      .filter((s: any) => s && typeof s.dimension === 'string' && Number.isFinite(Number(s.score)))
      .map((s: any) => ({ dimension: String(s.dimension), score: Number(s.score) }))
    : [];
  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
      .filter((f: any) => f && typeof f.text === 'string' && f.text.trim())
      .map((f: any) => ({
        atSeconds: Number.isFinite(Number(f.atSeconds)) ? Number(f.atSeconds) : null,
        text: String(f.text).trim(),
      }))
    : [];
  const improvements = Array.isArray(parsed.improvements)
    ? parsed.improvements.filter((i: any) => typeof i === 'string' && i.trim()).map((i: string) => i.trim())
    : [];

  return { scores, findings, improvements };
}

function log(event: string, ctx: Record<string, unknown>, outcome: 'success' | 'failure' = 'success'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'presentation-coach', event, outcome, context: ctx,
  }));
}

export interface CoachInput {
  attemptId: string;
  facts: RecordingFacts;
  transcript: string | null;
  rubric: RubricDimension[];
  rubricVersion: string;
  promptVersion: string;
  targetSeconds?: number | null;
}

/**
 * Review one attempt, and store the result as a PRIVATE ai row.
 *
 * Ownership is the caller's: this is reached only after the attempt has been proved
 * to belong to the enrollment.
 */
export async function reviewAttempt(input: CoachInput): Promise<CoachResult> {
  const { available, missing } = modalitiesFor(input.facts);

  // Nothing observable means nothing honest to say. Returning an empty review would
  // read as "we looked and found nothing wrong".
  if (available.length === 0) {
    return { ok: false, reason: 'no_modalities' };
  }

  const prompt = buildCoachPrompt({
    transcript: input.transcript,
    rubric: input.rubric,
    available,
    missing,
    targetSeconds: input.targetSeconds ?? null,
  });

  const { getInstrumentedOpenAI } = await import('../openaiInstrumented');
  const client = getInstrumentedOpenAI({ workflow_id: WORKFLOW_ID, prompt_version: input.promptVersion });

  let raw: string;
  try {
    const resp: any = await client.chat.completions.create(
      { model: MODEL, messages: [{ role: 'user', content: prompt }] },
      { timeout: CALL_TIMEOUT_MS },
    );
    raw = resp?.choices?.[0]?.message?.content || '';
  } catch (err) {
    log('coach_call_failed', { attemptId: input.attemptId, error_class: classifyError(err) }, 'failure');
    return { ok: false, reason: 'model_failed', detail: (err as Error)?.message };
  }

  const parsed = parseCoachJson(raw);
  if (!parsed) return { ok: false, reason: 'unusable_response' };

  // THE CHECK, not the instruction. Any sentence claiming something the recording
  // could not show is removed and listed, so a student can see what was dropped
  // rather than wondering why the review is short.
  const removed: ModalityViolation[] = [];
  const keep = <T extends { text: string }>(items: T[]): T[] => items.filter((item) => {
    const bad = findModalityViolations(item.text, available);
    if (bad.length) { removed.push(...bad); return false; }
    return true;
  });

  const findings = keep(parsed.findings);
  const improvements = keep(parsed.improvements.map((text) => ({ text })))
    .map((i) => i.text)
    .slice(0, MAX_IMPROVEMENTS);

  const review: CoachReview = {
    modalityAnalyzed: available,
    notAssessed: missing.map(describeMissing).filter(Boolean),
    scores: parsed.scores,
    findings,
    improvements,
    provenance: { model: MODEL, rubricVersion: input.rubricVersion, promptVersion: input.promptVersion },
    removed,
  };

  await persist(input.attemptId, review);
  if (removed.length) {
    log('coach_claims_removed', { attemptId: input.attemptId, removed: removed.map((r) => r.modality) }, 'failure');
  }
  return { ok: true, review };
}

/** Always private, always `ai`, always a draft until a human does something with it. */
async function persist(attemptId: string, review: CoachReview): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `INSERT INTO presentation_feedback
       (attempt_id, evaluator_role, evaluator_id, rubric_version, modality_analyzed,
        score_json, findings_json, improvements_json, visibility, model_provenance, review_state)
     VALUES (:aid, 'ai', NULL, :rv, :modality, :scores, :findings, :improvements, 'private', :prov, 'draft')`,
    {
      replacements: {
        aid: attemptId,
        rv: review.provenance.rubricVersion,
        modality: JSON.stringify(review.modalityAnalyzed),
        scores: JSON.stringify(review.scores),
        findings: JSON.stringify(review.findings),
        improvements: JSON.stringify(review.improvements),
        prov: JSON.stringify(review.provenance),
      },
    },
  );
}
