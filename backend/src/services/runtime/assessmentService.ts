/**
 * assessmentService — the Knowledge Check (quiz) + Evaluation engine.
 *
 * Quiz  = a quick, low-stakes entry check ("what you know coming in"); no pass
 *         gate, reveals the correct answer + explanation after submit, awards
 *         learning XP on completion.
 * Eval  = the end-of-section graded test; must hit 75% to PASS, complete, earn
 *         points, and write competency evidence (which moves readiness). Below
 *         75% = no points, retry allowed.
 *
 * Both persist a full AssessmentAttempt (per-question responses + per-competency
 * scores) so a section's quiz (beginning) and evaluation (current) can be paired
 * into a pre/post growth measurement. Questions are generated once per card
 * (blueprint- + competency-aware) and cached on card.metadata.assessment.
 */
import TimelineCard from '../../models/TimelineCard';
import CardSurveyResponse from '../../models/CardSurveyResponse';
import AssessmentAttempt, { AssessmentKind, AssessmentResponseItem, CompetencyScore } from '../../models/AssessmentAttempt';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { getBlueprintContext } from '../timeline/blueprintContext';
import { resolve as resolveType } from '../timeline/typeRegistry';
import { completeActivity } from './runtimeService';

export const EVAL_PASS_THRESHOLD = 0.75;

export interface AssessmentQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  competency: string | null;
}

/** A section's quiz→evaluation pre/post growth. */
export interface SectionProgress {
  week: number;
  beginning: number | null;        // latest quiz score 0..1
  current: number | null;          // latest evaluation score 0..1
  growth: number | null;           // current - beginning
  quiz_taken: boolean;
  evaluation_taken: boolean;
  evaluation_passed: boolean | null;
  per_competency: Array<{ domain: string; beginning: number | null; current: number | null; delta: number | null }>;
}

function kindForCard(card: any): AssessmentKind {
  return card.type === 'evaluation' ? 'evaluation' : 'quiz';
}

function sectionCompetencies(card: any, bpCompetencies: string[]): string[] {
  if (bpCompetencies && bpCompetencies.length) return bpCompetencies;
  const def = resolveType(card.type);
  return (def?.competencies || []) as string[];
}

// ── question generation (cached on the card) ─────────────────────────────────
async function generateQuestions(card: any): Promise<AssessmentQuestion[]> {
  const kind = kindForCard(card);
  const bp = await getBlueprintContext(card.program_id, card.week);
  const competencies = sectionCompetencies(card, bp ? bp.competencies : []);
  const n = kind === 'evaluation' ? 8 : 5;
  const style = kind === 'evaluation'
    ? 'an end-of-section Evaluation — applied, scenario-based questions that test whether the student can USE the concepts'
    : 'a quick entry Knowledge Check — short, foundational recall questions that gauge what the student knows coming in';
  const compList = competencies.length ? competencies.join(', ') : 'the week topic';
  const system = `${bp ? bp.prompt_text + '\n\n' : ''}You write ${style} for the AI Systems Architect Accelerator. `
    + `Cover these competencies as evenly as possible: ${compList}. Every question tags exactly ONE competency from that list. Return STRICT json.`;
  const user = `Return json: { "questions": [ { "question": string, "options": [exactly 4 distinct strings], `
    + `"correct_index": integer 0-3, "explanation": string (1-2 sentences on why the correct option is right), `
    + `"competency": ${competencies.length ? 'one of ' + JSON.stringify(competencies) : 'a short domain slug'} } ] }. `
    + `Exactly ${n} questions, grounded in the week's actual topic. No preamble.`;

  const client = getInstrumentedOpenAI({ workflow_id: 'assessment_generate' });
  const res = await client.chat.completions.create({
    model: DEFAULT_MODEL, temperature: 0.4, max_tokens: 1800, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  const raw: any[] = Array.isArray(parsed.questions) ? parsed.questions : [];
  const clean = raw.map((q) => normalizeQuestion(q, competencies)).filter(Boolean) as AssessmentQuestion[];
  if (!clean.length) throw Object.assign(new Error('Could not generate assessment questions'), { status: 502 });
  return clean;
}

function normalizeQuestion(q: any, competencies: string[]): AssessmentQuestion | null {
  const question = typeof q?.question === 'string' ? q.question.trim() : '';
  const options = Array.isArray(q?.options) ? q.options.map((o: any) => String(o)).filter(Boolean) : [];
  if (!question || options.length < 2) return null;
  let ci = Number.isInteger(q?.correct_index) ? q.correct_index : 0;
  if (ci < 0 || ci >= options.length) ci = 0;
  const comp = typeof q?.competency === 'string' && q.competency.trim()
    ? q.competency.trim()
    : (competencies[0] || null);
  return {
    question, options, correct_index: ci,
    explanation: typeof q?.explanation === 'string' ? q.explanation.trim() : '',
    competency: comp,
  };
}

/** Load the card's questions, generating + caching them on first access. */
export async function ensureQuestions(card: any): Promise<AssessmentQuestion[]> {
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  const existing = meta.assessment?.questions;
  if (Array.isArray(existing) && existing.length) return existing as AssessmentQuestion[];
  const questions = await generateQuestions(card);
  await card.update({ metadata: { ...meta, assessment: { questions, generated_at: new Date().toISOString() } } });
  return questions;
}

/** PURE — score a set of responses against the questions. No I/O; unit-tested.
 *  Missing/skipped answers (selected_index null or absent) count as incorrect. */
export function scoreResponses(
  questions: AssessmentQuestion[],
  responses: Array<{ index: number; selected_index: number | null; time_ms?: number | null }>,
): { items: AssessmentResponseItem[]; correct: number; total: number; score: number; competency_scores: Record<string, CompetencyScore> } {
  const byIndex = new Map(responses.map((r) => [r.index, r]));
  const items: AssessmentResponseItem[] = questions.map((q, i) => {
    const r = byIndex.get(i);
    const selected = (r && typeof r.selected_index === 'number') ? r.selected_index : null;
    return {
      question: q.question, competency: q.competency, options: q.options,
      selected_index: selected, correct_index: q.correct_index,
      is_correct: selected === q.correct_index,
      explanation: q.explanation, time_ms: (r && typeof r.time_ms === 'number') ? r.time_ms : null,
    };
  });
  const correct = items.filter((i) => i.is_correct).length;
  const total = questions.length;
  const score = total ? correct / total : 0;
  const agg: Record<string, { correct: number; total: number }> = {};
  for (const it of items) {
    const c = it.competency || 'general';
    (agg[c] = agg[c] || { correct: 0, total: 0 }).total += 1;
    if (it.is_correct) agg[c].correct += 1;
  }
  const competency_scores: Record<string, CompetencyScore> = {};
  for (const [c, v] of Object.entries(agg)) competency_scores[c] = { correct: v.correct, total: v.total, pct: v.total ? v.correct / v.total : 0 };
  return { items, correct, total, score, competency_scores };
}

// ── read: the student-facing assessment (no answers leaked) ──────────────────
function attemptReview(a: AssessmentAttempt) {
  return {
    kind: a.kind, score: a.score, correct_count: a.correct_count, total_count: a.total_count,
    passed: a.passed, pass_threshold: a.pass_threshold, attempt_number: a.attempt_number,
    items: a.responses, competency_scores: a.competency_scores, submitted_at: a.submitted_at,
  };
}

export async function getAssessment(enrollmentId: string, cardId: string) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || (card as any).visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });
  const kind = kindForCard(card);
  const questions = await ensureQuestions(card);
  // The QUIZ is a low-stakes learning check — reveal the answer + explanation so the
  // student gets immediate feedback. The EVALUATION is graded — strip answers until submit.
  const reveal = kind === 'quiz';
  const publicQuestions = questions.map((q, i) => ({
    index: i, question: q.question, options: q.options, competency: q.competency,
    ...(reveal ? { correct_index: q.correct_index, explanation: q.explanation } : {}),
  }));
  const last = await AssessmentAttempt.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId }, order: [['submitted_at', 'DESC']] });
  const section = await getSectionProgress(enrollmentId, (card as any).program_id, (card as any).week);
  return {
    kind, pass_threshold: kind === 'evaluation' ? EVAL_PASS_THRESHOLD : null,
    question_count: questions.length, questions: publicQuestions,
    last_attempt: last ? attemptReview(last) : null, section,
  };
}

// ── submit: score, persist, gate points, correlate ──────────────────────────
export interface SubmitBody {
  responses: Array<{ index: number; selected_index: number | null; time_ms?: number | null }>;
  duration_ms?: number | null;
  started_at?: string | null;
}

export async function submitAssessment(enrollmentId: string, cardId: string, body: SubmitBody) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || (card as any).visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });
  const kind = kindForCard(card);
  const questions = await ensureQuestions(card);
  const { items, correct, total, score, competency_scores } = scoreResponses(questions, body.responses || []);
  const passed = kind === 'evaluation' ? score >= EVAL_PASS_THRESHOLD : null;

  const prior = await AssessmentAttempt.count({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  await AssessmentAttempt.create({
    enrollment_id: enrollmentId, card_id: cardId,
    program_id: (card as any).program_id ?? null, week: (card as any).week ?? null,
    kind, score, correct_count: correct, total_count: total, passed,
    pass_threshold: kind === 'evaluation' ? EVAL_PASS_THRESHOLD : null,
    attempt_number: prior + 1, duration_ms: body.duration_ms ?? null,
    responses: items, competency_scores,
    started_at: body.started_at ? new Date(body.started_at) : null, submitted_at: new Date(),
  } as any);

  // completion + points: quiz always completes (learning XP); eval only on pass.
  let completion: any = null;
  if (kind === 'quiz') {
    completion = await completeActivity(enrollmentId, cardId, { work: `Knowledge Check: ${correct}/${total} correct` });
  } else if (passed) {
    completion = await completeActivity(enrollmentId, cardId, { work: `Evaluation: ${Math.round(score * 100)}% (passed)` });
  }

  const section = await getSectionProgress(enrollmentId, (card as any).program_id, (card as any).week);
  return {
    kind, score, correct_count: correct, total_count: total, passed,
    pass_threshold: kind === 'evaluation' ? EVAL_PASS_THRESHOLD : null,
    attempt_number: prior + 1, items, competency_scores, section,
    completion: completion ? { outcome: completion.outcome, artifact: completion.artifact, readiness: completion.readiness } : null,
  };
}

// ── pre/post correlation for a section ───────────────────────────────────────
export async function getSectionProgress(enrollmentId: string, programId?: string | null, week?: number | null): Promise<SectionProgress | null> {
  if (!programId || week == null) return null;
  const base = { enrollment_id: enrollmentId, program_id: programId, week };
  const [quiz, evaluation] = await Promise.all([
    AssessmentAttempt.findOne({ where: { ...base, kind: 'quiz' }, order: [['submitted_at', 'DESC']] }),
    AssessmentAttempt.findOne({ where: { ...base, kind: 'evaluation' }, order: [['submitted_at', 'DESC']] }),
  ]);
  if (!quiz && !evaluation) return null;
  const beginning = quiz ? quiz.score : null;
  const current = evaluation ? evaluation.score : null;
  const growth = (beginning != null && current != null) ? current - beginning : null;
  const domains = new Set<string>([
    ...Object.keys(quiz?.competency_scores || {}),
    ...Object.keys(evaluation?.competency_scores || {}),
  ]);
  const per_competency = Array.from(domains).map((d) => {
    const b = quiz?.competency_scores?.[d]?.pct ?? null;
    const c = evaluation?.competency_scores?.[d]?.pct ?? null;
    return { domain: d, beginning: b, current: c, delta: (b != null && c != null) ? c - b : null };
  });
  return {
    week: week as number, beginning, current, growth,
    quiz_taken: !!quiz, evaluation_taken: !!evaluation,
    evaluation_passed: evaluation?.passed ?? null, per_competency,
  };
}

const prettyDom = (d: string) => (d || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * A short natural-language summary of a section's Evaluation score + weekly Survey
 * answers, for the (after-survey) Reflection to reference. Null when neither the
 * evaluation nor the survey has been done yet.
 */
export async function sectionResultsSummary(enrollmentId: string, programId?: string | null, week?: number | null): Promise<string | null> {
  if (!programId || week == null) return null;
  const lines: string[] = [];

  const section = await getSectionProgress(enrollmentId, programId, week);
  if (section && section.current != null) {
    lines.push(`Evaluation: scored ${Math.round(section.current * 100)}% (${section.evaluation_passed ? 'passed' : 'not yet passed — needs 75%'}).`);
    if (section.growth != null) lines.push(`Growth since the entry Knowledge Check: ${section.growth >= 0 ? '+' : ''}${Math.round(section.growth * 100)} points.`);
    const comps = (section.per_competency || []).filter((c) => c.current != null);
    if (comps.length) {
      const sorted = [...comps].sort((a, b) => (b.current || 0) - (a.current || 0));
      const strong = sorted[0], weak = sorted[sorted.length - 1];
      if (strong && weak && strong.domain !== weak.domain) {
        lines.push(`Strongest: ${prettyDom(strong.domain)} (${Math.round((strong.current || 0) * 100)}%); needs work: ${prettyDom(weak.domain)} (${Math.round((weak.current || 0) * 100)}%).`);
      }
    }
  }

  const survey = await CardSurveyResponse.findOne({ where: { enrollment_id: enrollmentId, program_id: programId, week } });
  const answers: any = survey ? (survey as any).answers : null;
  if (answers) {
    const items = Array.isArray(answers.items) ? answers.items : [];
    const rated = items.filter((i: any) => typeof i.rating === 'number');
    if (rated.length) {
      const avg = rated.reduce((sum: number, i: any) => sum + i.rating, 0) / rated.length;
      lines.push(`Weekly survey: average self-rating ${avg.toFixed(1)}/5 across ${rated.length} questions.`);
    }
    if (answers.open && String(answers.open).trim()) lines.push(`Their survey comment: "${String(answers.open).trim().slice(0, 200)}".`);
  }

  return lines.length ? lines.join(' ') : null;
}
