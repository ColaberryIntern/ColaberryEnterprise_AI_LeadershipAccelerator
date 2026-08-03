/**
 * architectMindsetLogic — the PURE core of the Architect Time Machine. No I/O, no
 * models, fully unit-testable (architectMindsetLogic.test.ts). The service
 * (architectMindsetService.ts) does the I/O and calls into here.
 *
 * Owns: the 24-state machine + transition rules, the 14 backend completion gates,
 * interview-answer validation, the baseline assessment, the Experience Receipt +
 * compression ratio, and the derived Mindset Ledger projection.
 */
import type { AmScenario, AmInterviewQuestion } from '../../data/architectMindsetScenario';

// ── State machine (24 states, canonical section 4) ───────────────────────────
export const AM_STATES = [
  'not_started', 'arrival', 'request_viewed', 'first_decision_draft', 'first_decision_submitted',
  'zoom_out_in_progress', 'zoom_out_complete', 'interview_part_1_in_progress', 'interview_part_1_complete',
  'architecture_selected', 'consequence_in_progress', 'consequence_complete',
  'interview_part_2_in_progress', 'interview_part_2_complete', 'rearchitecture_draft', 'rearchitecture_submitted',
  'receipt_unlocked', 'adr_generated', 'project_transfer_in_progress', 'project_transfer_complete',
  'evaluation_pending', 'evaluation_complete', 'completion_eligible', 'completed',
  'evaluation_failed_retryable',
] as const;
export type AmState = typeof AM_STATES[number];

const SPINE: AmState[] = AM_STATES.filter((s) => s !== 'evaluation_failed_retryable') as AmState[];
const SPINE_INDEX = new Map<AmState, number>(SPINE.map((s, i) => [s, i]));
const KNOWN = new Set<string>(AM_STATES);

export function spineIndex(state: AmState): number {
  return SPINE_INDEX.has(state) ? (SPINE_INDEX.get(state) as number) : -1;
}

/**
 * A transition is legal when: it is a no-op (idempotent save), a normal forward or
 * backward move (resume / review), or the evaluation retry loop. It is ILLEGAL to
 * mutate a completed record, to reach `completed`/`completion_eligible` via advance
 * (those are set only by the server-gated complete()), or to name an unknown state.
 */
export function isValidTransition(from: AmState, to: string): { ok: boolean; reason?: string } {
  if (!KNOWN.has(to)) return { ok: false, reason: 'unknown_state' };
  const dst = to as AmState;
  if (dst === from) return { ok: true };
  if (from === 'completed') return { ok: false, reason: 'record_immutable' };
  if (dst === 'completed' || dst === 'completion_eligible') return { ok: false, reason: 'completion_is_server_gated' };
  // evaluation retry loop
  if (from === 'evaluation_pending' && dst === 'evaluation_failed_retryable') return { ok: true };
  if (from === 'evaluation_failed_retryable' && dst === 'evaluation_pending') return { ok: true };
  if (from === 'evaluation_failed_retryable' && dst !== 'evaluation_pending') return { ok: false, reason: 'must_retry' };
  return { ok: true };
}

// ── Progress shape (stored in timeline_card_progress.student_progress) ────────
export interface AmInterviewAnswer {
  choice?: string | null;
  choices?: string[];
  custom?: string | null;
  explanation?: string | null;
  answered_at?: string;
  scenario_state?: string;
}
export interface AmProgress {
  state: AmState;
  scenario_version?: string;
  prompt_version?: Record<string, string>;
  first_decision?: { choice?: string; custom?: string | null; reasoning?: string; at?: string };
  revised_decision?: { choice?: string; custom?: string | null; at?: string };
  interview?: Record<string, AmInterviewAnswer>;
  assumptions?: string[];
  tradeoffs?: string[];
  failure_modes?: string[];
  reflection?: string | null;
  commitment?: string | null;
  project_transfer?: { assumed_solution?: string; outcome?: string };
  flags?: { zoom_out_viewed?: boolean; consequence_viewed?: boolean };
  evaluation?: any;
  reached_index?: number;
  started_at?: string;
  last_saved_at?: string;
  completed_at?: string | null;
  retry_count?: number;
}

export function emptyProgress(scenario: AmScenario): AmProgress {
  return { state: 'not_started', scenario_version: scenario.version, interview: {}, assumptions: [], tradeoffs: [], failure_modes: [], flags: {}, retry_count: 0 };
}

const cleanList = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter((x) => x.length >= 2) : []);
export const isMeaningful = (text: any): boolean => typeof text === 'string' && text.trim().length >= 2;

/** Does one interview answer satisfy its question (custom option requires real text)? */
export function isAnswerValid(q: AmInterviewQuestion, a: AmInterviewAnswer | undefined): boolean {
  if (!a) return false;
  const custom = q.options.find((o) => o.custom)?.id;
  if (q.mode === 'multiple') {
    const chosen = Array.isArray(a.choices) ? a.choices : [];
    if (!chosen.length) return false;
    if (custom && chosen.includes(custom)) return isMeaningful(a.custom);
    return true;
  }
  if (!a.choice) return false;
  if (custom && a.choice === custom) return isMeaningful(a.custom);
  return true;
}

/** Validate a batch of submitted answers; returns the ids that are invalid. */
export function invalidAnswers(questions: AmInterviewQuestion[], answers: Record<string, AmInterviewAnswer>): string[] {
  return questions.filter((q) => !isAnswerValid(q, answers[q.id])).map((q) => q.id);
}

// ── The 14 completion gates (backend-authoritative) ──────────────────────────
export interface Gap { code: string; label: string }

export function completionGaps(p: AmProgress, s: AmScenario): Gap[] {
  const gaps: Gap[] = [];
  const push = (code: string, label: string) => gaps.push({ code, label });
  const fd = p.first_decision;
  const fdValid = !!fd && (isMeaningful(fd.choice) || isMeaningful(fd.custom));
  if (!fdValid) push('first_decision', 'Submit your first decision.');

  if (spineIndex(p.state) < spineIndex('consequence_complete') && p.state !== 'completed') push('stages', 'Move through all required stages.');
  if (!(p.flags && p.flags.consequence_viewed)) push('consequence_viewed', 'View the consequence reveal.');

  const q1 = s.interview_part_1 || [];
  const q2 = s.interview_part_2 || [];
  const ans = p.interview || {};
  const bad = invalidAnswers([...q1, ...q2], ans);
  if (bad.length) push('interview', `Answer every required interview question (${bad.length} remaining).`);

  const rd = p.revised_decision;
  if (!(rd && (isMeaningful(rd.choice) || isMeaningful(rd.custom)))) push('revised_decision', 'Submit your revised architectural decision.');

  if (cleanList(p.tradeoffs).length < 1) push('tradeoff', 'Explain at least one tradeoff.');
  if (cleanList(p.assumptions).length < 1) push('assumption', 'Identify at least one assumption.');
  if (cleanList(p.failure_modes).length < 1) push('failure', 'Identify at least one consequence or failure risk.');
  if (!isMeaningful(p.reflection)) push('reflection', 'Submit your final reflection.');
  if (!isMeaningful(p.commitment)) push('commitment', 'Complete your Architect Commitment.');
  if (!p.evaluation) push('evaluation', 'The experience must be evaluated.');
  return gaps;
}

export function isCompletionEligible(p: AmProgress, s: AmScenario): boolean {
  return completionGaps(p, s).length === 0;
}

/**
 * Backfill assumption / tradeoff / failure-mode evidence from the interview when the
 * student answered the multiple-choice flow but did not type explicit lists. Keeps
 * Week 0 completable through the designed flow while still honoring custom text.
 */
export function deriveEvidence(p: AmProgress, s: AmScenario): { assumptions: string[]; tradeoffs: string[]; failure_modes: string[] } {
  const ans = p.interview || {};
  const questions = [...(s.interview_part_1 || []), ...(s.interview_part_2 || [])];
  const labelOfQ = (q: AmInterviewQuestion): string | null => {
    const a = ans[q.id];
    if (!a) return null;
    if (a.choice) { const opt = q.options.find((o) => o.id === a.choice); if (opt?.custom) return isMeaningful(a.custom) ? String(a.custom).trim() : null; return opt ? opt.label : null; }
    return isMeaningful(a.custom) ? String(a.custom).trim() : null;
  };
  // Derive by DIMENSION (scenario-agnostic), not by hardcoded question ids — so any
  // week's assumption/tradeoff/failure question feeds the corresponding evidence.
  const byDimension = (dim: string): string | null => {
    for (const q of questions) { if (q.dimension === dim) { const v = labelOfQ(q); if (v) return v; } }
    return null;
  };
  const assumptions = cleanList(p.assumptions);
  const tradeoffs = cleanList(p.tradeoffs);
  const failure_modes = cleanList(p.failure_modes);
  if (!assumptions.length) { const v = byDimension('assumption_discovery'); if (v) assumptions.push(v); }
  if (!tradeoffs.length) { const v = byDimension('tradeoff_quality'); if (v) tradeoffs.push(v); }
  if (!failure_modes.length) { const v = byDimension('failure_anticipation'); if (v) failure_modes.push(v); }
  return { assumptions, tradeoffs, failure_modes };
}

// ── Baseline assessment (Week 0 is UNSCORED — a stage observation only) ───────
export interface AmStage { slug: string; label: string; min: number }
export const AM_STAGES: AmStage[] = [
  { slug: 'feature_thinker', label: 'Feature Thinker', min: 0 },
  { slug: 'system_explorer', label: 'System Explorer', min: 30 },
  { slug: 'tradeoff_thinker', label: 'Tradeoff Thinker', min: 50 },
  { slug: 'architecture_thinker', label: 'Architecture Thinker', min: 70 },
  { slug: 'architecture_leader', label: 'Architecture Leader', min: 85 },
  { slug: 'systems_steward', label: 'Systems Steward', min: 95 },
];
export function stageForScore(score: number): AmStage {
  let out = AM_STAGES[0];
  for (const s of AM_STAGES) if (score >= s.min) out = s;
  return out;
}

/** A deterministic structural read of the student's answers -> a baseline signal.
 *  Not the formal graded score (Week 1 begins scored growth); a coachable observation. */
export function assessBaseline(p: AmProgress, s: AmScenario): { signal: number; stage: AmStage; observation: string } {
  const ans = p.interview || {};
  const systemsChoice = (qid: string, ids: string[]): number => (ids.includes(String(ans[qid]?.choice)) || isMeaningful(ans[qid]?.custom) ? 1 : 0);
  let hits = 0; let total = 0;
  const rubric: Array<[string, string[]]> = [
    ['q1', ['system', 'outcome']], ['q3', ['one_source', 'just_qa', 'one_user']], ['q4', ['legal', 'personal', 'authority', 'low_evidence']],
    ['q5', ['source', 'wrong', 'escalation', 'cost']], ['q7', ['feature_vs_system', 'speed_vs_care', 'code_vs_decisions']], ['r1', ['users', 'authority', 'failure_path', 'business']],
  ];
  for (const [qid, ids] of rubric) { total += 1; hits += systemsChoice(qid, ids); }
  const evidence = (cleanList(p.assumptions).length ? 1 : 0) + (cleanList(p.tradeoffs).length ? 1 : 0) + (cleanList(p.failure_modes).length ? 1 : 0);
  const signal = Math.round(((hits / Math.max(1, total)) * 0.7 + (evidence / 3) * 0.3) * 100);
  const stage = stageForScore(signal);
  const observation = signal >= 50
    ? 'You entered describing systems, owners, and failure paths rather than tools. That is the architect move.'
    : 'You entered focused on the feature and the build. The series will widen that lens week by week.';
  return { signal, stage, observation };
}

// ── Formal Architect Mindset Score (scored weeks; Week 1+) ───────────────────
// 8 transparent, weighted dimensions (canonical section 9). Deterministic and
// evidence-based: it rewards ENGAGEMENT and DEPTH (answering, reasoning, naming
// assumptions/tradeoffs/failures), never picking a "correct" architecture — there
// is none. The AI narrative (service) may enrich the observation on top of this.
export interface AmDimensionDef { key: string; label: string; weight: number }
export const AM_DIMENSIONS: AmDimensionDef[] = [
  { key: 'system_scope', label: 'System scope recognition', weight: 20 },
  { key: 'assumption_discovery', label: 'Assumption discovery', weight: 15 },
  { key: 'stakeholder_awareness', label: 'Stakeholder awareness', weight: 10 },
  { key: 'tradeoff_quality', label: 'Tradeoff quality', weight: 15 },
  { key: 'failure_anticipation', label: 'Failure anticipation', weight: 15 },
  { key: 'evidence_observability', label: 'Evidence & observability', weight: 10 },
  { key: 'governance_ownership', label: 'Governance & ownership', weight: 10 },
  { key: 'decision_communication', label: 'Decision communication', weight: 5 },
];
export interface AmDimensionScore { key: string; label: string; weight: number; score: number; evidence: string; strength: string; gap: string }
export interface AmScore { dimensions: AmDimensionScore[]; total: number; stage: AmStage }

export function scoreMindset(p: AmProgress, s: AmScenario): AmScore {
  const allQ = [...(s.interview_part_1 || []), ...(s.interview_part_2 || [])];
  const ev = deriveEvidence(p, s);
  const engaged = (qid: string) => {
    const a = (p.interview || {})[qid];
    if (!a) return 0;
    let v = 0.55;                                            // answered
    if (isMeaningful(a.custom) || isMeaningful(a.explanation)) v += 0.30;   // own words / reasoning
    return v;
  };
  const dimensions: AmDimensionScore[] = AM_DIMENSIONS.map((d) => {
    const qs = allQ.filter((q) => q.dimension === d.key);
    let raw = qs.length ? qs.map((q) => engaged(q.id)).reduce((x, y) => x + y, 0) / qs.length : 0.4;
    // cross-cutting evidence boosts (engagement across the whole experience)
    if (d.key === 'assumption_discovery' && ev.assumptions.length) raw = Math.max(raw, 0.72);
    if (d.key === 'failure_anticipation' && ev.failure_modes.length) raw = Math.max(raw, 0.72);
    if (d.key === 'tradeoff_quality' && ev.tradeoffs.length) raw = Math.max(raw, 0.72);
    if (d.key === 'evidence_observability' && isMeaningful(p.reflection)) raw = Math.max(raw, 0.6);
    if (d.key === 'governance_ownership' && isMeaningful(p.commitment)) raw = Math.max(raw, 0.6);
    if (d.key === 'decision_communication' && (isMeaningful(p.first_decision?.reasoning) || isMeaningful(p.reflection))) raw = Math.max(raw, 0.62);
    if (d.key === 'system_scope' && (p.flags?.zoom_out_viewed && p.flags?.consequence_viewed)) raw = Math.max(raw, 0.55);
    const score = Math.round(Math.min(1, Math.max(0, raw)) * 100);
    const strong = score >= 70;
    return {
      key: d.key, label: d.label, weight: d.weight, score,
      evidence: qs.length ? `${qs.length} interview response(s) tagged to this dimension, plus your decisions and evidence.` : 'Inferred from your assumptions, tradeoffs, reflection, and commitment.',
      strength: strong ? 'You engaged this dimension with your own reasoning, not just a selection.' : 'You touched this dimension.',
      gap: strong ? 'Deepen it next week by tying it to a measurable business outcome.' : 'Next week, explain your reasoning in your own words and name the evidence behind it.',
    };
  });
  const total = Math.round(dimensions.reduce((sum, d) => sum + d.score * (d.weight / 100), 0));
  return { dimensions, total, stage: stageForScore(total) };
}

// ── Experience Receipt + compression ratio ───────────────────────────────────
export function computeReceipt(s: AmScenario): { counts: Array<{ label: string; value: string }>; represented_hours: number; minutes: number; ratio: number; qualification: string } {
  const minutes = s.receipt.minutes || 13;
  const ratio = Math.round(s.receipt.represented_hours / (minutes / 60));
  return { counts: s.receipt.counts, represented_hours: s.receipt.represented_hours, minutes, ratio, qualification: s.receipt.qualification };
}

// ── Derived Mindset Ledger (aggregate across the enrollment's architect cards) ─
export interface LedgerEntry {
  completed: boolean;
  decisions: number;
  assumptions: number;
  failure_modes: number;
  perspectives: number;
  represented_hours: number;
}
export function ledgerEntryFor(p: AmProgress, s: AmScenario): LedgerEntry {
  const ev = deriveEvidence(p, s);
  const answered = Object.values(p.interview || {}).filter((a) => a && (a.choice || (a.choices && a.choices.length) || isMeaningful(a.custom))).length;
  return {
    completed: p.state === 'completed',
    decisions: (p.first_decision ? 1 : 0) + (p.revised_decision ? 1 : 0),
    assumptions: ev.assumptions.length,
    failure_modes: ev.failure_modes.length,
    perspectives: Math.min(answered, (s.interview_part_1?.length || 0) + (s.interview_part_2?.length || 0)),
    represented_hours: p.state === 'completed' ? s.receipt.represented_hours : 0,
  };
}
export function projectLedger(entries: LedgerEntry[]): {
  lessons_completed: number; decisions_recorded: number; assumptions_discovered: number;
  failure_modes_examined: number; perspectives_encountered: number; represented_hours: number;
} {
  return entries.reduce((acc, e) => ({
    lessons_completed: acc.lessons_completed + (e.completed ? 1 : 0),
    decisions_recorded: acc.decisions_recorded + e.decisions,
    assumptions_discovered: acc.assumptions_discovered + e.assumptions,
    failure_modes_examined: acc.failure_modes_examined + e.failure_modes,
    perspectives_encountered: acc.perspectives_encountered + e.perspectives,
    represented_hours: acc.represented_hours + e.represented_hours,
  }), { lessons_completed: 0, decisions_recorded: 0, assumptions_discovered: 0, failure_modes_examined: 0, perspectives_encountered: 0, represented_hours: 0 });
}
