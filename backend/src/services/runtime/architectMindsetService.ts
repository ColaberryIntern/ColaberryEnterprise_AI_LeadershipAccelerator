/**
 * architectMindsetService — the Architect Time Machine runtime engine. Persists
 * the multi-stage experience in the existing timeline_card_progress.student_progress
 * JSONB (unique per card+enrollment, so refresh/reopen/double-POST are idempotent),
 * runs a graceful AI evaluation with a deterministic fallback, and gates completion
 * on the 14 backend gates before delegating to the platform's authoritative
 * onCardCompleted (via completeActivity). Modeled on assessmentService.
 *
 * Week 0 is a baseline demonstration (unscored). The scenario is hand-authored in
 * data/architectMindsetScenario.ts; later weeks generate + cache a scenario.
 */
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import PortfolioArtifact from '../../models/PortfolioArtifact';
import { completeActivity } from './runtimeService';
import { chatJson } from './runtimeAi';
import {
  AmScenario, AmInterviewQuestion, scenarioForWeek,
} from '../../data/architectMindsetScenario';
import {
  AmProgress, AmState, emptyProgress, isValidTransition, invalidAnswers, isMeaningful,
  completionGaps, deriveEvidence, assessBaseline, computeReceipt, ledgerEntryFor, projectLedger,
} from './architectMindsetLogic';

const TYPE_SLUG = 'architect_mindset';
const httpErr = (message: string, status: number, extra?: Record<string, any>) => Object.assign(new Error(message), { status, ...(extra || {}) });

// ── scenario resolution ──────────────────────────────────────────────────────
export function scenarioForCard(card: any): AmScenario | null {
  const meta = card?.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  if (meta.architect_scenario && typeof meta.architect_scenario === 'object') return meta.architect_scenario as AmScenario;
  return scenarioForWeek(card?.week);   // Week 0 is code-authored
}

function normalize(raw: any, scenario: AmScenario): AmProgress {
  const base = emptyProgress(scenario);
  if (!raw || typeof raw !== 'object') return base;
  return { ...base, ...raw, interview: { ...(raw.interview || {}) }, flags: { ...(raw.flags || {}) } };
}

async function load(enrollmentId: string, cardId: string) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || (card as any).visibility !== 'published') throw httpErr('Card not available', 404);
  if ((card as any).type !== TYPE_SLUG) throw httpErr('Not an Architect Time Machine card', 400);
  const scenario = scenarioForCard(card);
  if (!scenario) throw httpErr('This experience is being prepared, please check back shortly.', 409);
  const [row] = await TimelineCardProgress.findOrCreate({
    where: { card_id: cardId, enrollment_id: enrollmentId },
    defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'available', student_progress: emptyProgress(scenario) } as any,
  });
  return { card, scenario, row, progress: normalize(row.student_progress, scenario) };
}

async function save(row: TimelineCardProgress, progress: AmProgress, status?: 'in_progress' | 'completed') {
  progress.last_saved_at = new Date().toISOString();
  const patch: any = { student_progress: progress };
  if (status) patch.status = status;
  if (!row.started_at && progress.started_at) patch.started_at = new Date(progress.started_at);
  await row.update(patch);
}

// ── GET state (resume) ───────────────────────────────────────────────────────
export async function getState(enrollmentId: string, cardId: string) {
  const { scenario, row, progress } = await load(enrollmentId, cardId);
  return {
    scenario, progress,
    status: row.status,
    receipt: computeReceipt(scenario),
    gaps: progress.state === 'completed' ? [] : completionGaps({ ...progress, ...deriveEvidence(progress, scenario) }, scenario),
    ledger: await getLedger(enrollmentId),
  };
}

// ── advance a stage (validated, idempotent autosave) ─────────────────────────
export interface AdvanceBody { to: string; patch?: Partial<AmProgress> }
export async function advance(enrollmentId: string, cardId: string, body: AdvanceBody) {
  const { row, progress } = await load(enrollmentId, cardId);
  if (progress.state === 'completed') return { state: progress.state, saved: true }; // immutable, no-op
  const t = isValidTransition(progress.state, body.to);
  if (!t.ok) throw httpErr('Invalid transition', 422, { code: t.reason, from: progress.state, to: body.to });
  const patch = body.patch || {};
  // shallow-merge the allowed fields (never blindly trust the client with `state`)
  const next: AmProgress = {
    ...progress,
    ...patch,
    interview: { ...(progress.interview || {}), ...((patch as any).interview || {}) },
    flags: { ...(progress.flags || {}), ...((patch as any).flags || {}) },
    state: body.to as AmState,
  };
  if (!next.started_at) next.started_at = new Date().toISOString();
  await save(row, next, 'in_progress');
  return { state: next.state, saved: true };
}

// ── save interview answers (part 1 / part 2), validate custom text ───────────
export interface InterviewBody { part: 1 | 2; answers: Record<string, any> }
export async function saveInterview(enrollmentId: string, cardId: string, body: InterviewBody) {
  const { scenario, row, progress } = await load(enrollmentId, cardId);
  if (progress.state === 'completed') throw httpErr('This experience is already complete.', 409);
  const questions: AmInterviewQuestion[] = body.part === 2 ? (scenario.interview_part_2 || []) : (scenario.interview_part_1 || []);
  const incoming = body.answers && typeof body.answers === 'object' ? body.answers : {};
  // reject a custom-selected-but-empty answer loudly (frontend-only validation is insufficient)
  const merged = { ...(progress.interview || {}) } as Record<string, any>;
  for (const q of questions) if (incoming[q.id]) merged[q.id] = { ...incoming[q.id], answered_at: new Date().toISOString(), scenario_state: progress.state };
  const bad = invalidAnswers(questions.filter((q) => merged[q.id]), merged);
  if (bad.length) throw httpErr('Please complete your answer before continuing.', 422, { code: 'custom_answer_required', questions: bad });
  const next: AmProgress = { ...progress, interview: merged };
  if (!next.started_at) next.started_at = new Date().toISOString();
  await save(row, next, 'in_progress');
  return { saved: true, answered: Object.keys(merged).length };
}

// ── evaluate (graceful: AI enrich, deterministic fallback) ───────────────────
export async function evaluate(enrollmentId: string, cardId: string) {
  const { scenario, row, progress } = await load(enrollmentId, cardId);
  const enriched: AmProgress = { ...progress, ...deriveEvidence(progress, scenario), state: 'evaluation_pending' };
  await save(row, enriched, 'in_progress');
  const baseline = assessBaseline(enriched, scenario);
  let observation = baseline.observation;
  let source: 'ai' | 'deterministic' = 'deterministic';
  try {
    const answers = Object.entries(enriched.interview || {}).map(([id, a]: any) => `${id}: ${a.choice || ''}${isMeaningful(a.custom) ? ' — ' + a.custom : ''}`).join('\n');
    const system = 'You are an experienced software architect debriefing a student after a decision simulation. Assume there is no single correct architecture. Reward evidence, assumptions, tradeoffs, failure anticipation, governance, and clear communication, never jargon. Two sentences, warm and specific, no score. Return STRICT json.';
    const user = `Week ${scenario.week} baseline. Principle: ${scenario.principle}\nThe student's answers:\n${answers}\nTheir commitment: "${enriched.commitment || ''}"\nReturn json { "observation": string }.`;
    const r = await chatJson('architect_mindset_eval', system, user, undefined, 400);
    if (r?.parsed?.observation && isMeaningful(r.parsed.observation)) { observation = String(r.parsed.observation).trim(); source = 'ai'; }
  } catch { /* keep the deterministic observation — completion is never blocked by an AI outage */ }
  const evaluation = { baseline: scenario.baseline, signal: baseline.signal, stage: baseline.stage, observation, source, at: new Date().toISOString() };
  const done: AmProgress = { ...enriched, evaluation, state: 'evaluation_complete' };
  await save(row, done, 'in_progress');
  return { evaluation, gaps: completionGaps(done, scenario) };
}

// ── build the Architect Decision Record from progress ────────────────────────
function labelOf(scenario: AmScenario, qid: string, p: AmProgress): string | null {
  const q = [...(scenario.interview_part_1 || []), ...(scenario.interview_part_2 || [])].find((x) => x.id === qid);
  const a = (p.interview || {})[qid];
  if (!q || !a) return null;
  if (a.choice) { const o = q.options.find((x) => x.id === a.choice); if (o?.custom) return isMeaningful(a.custom) ? String(a.custom).trim() : null; return o ? o.label : null; }
  return isMeaningful(a.custom) ? String(a.custom).trim() : null;
}
function buildAdr(p: AmProgress, s: AmScenario) {
  const ev = deriveEvidence(p, s);
  return {
    context: s.request.text,
    decision: (p.revised_decision && isMeaningful(p.revised_decision.custom) ? p.revised_decision.custom : (p.commitment || labelOf(s, 'q8', p) || 'Map the whole system before choosing a tool.')),
    assumption: ev.assumptions[0] || null,
    consequence: ev.failure_modes[0] || null,
    tradeoff: ev.tradeoffs[0] || null,
    owner: labelOf(s, 'q6', p),
    commitment: p.commitment || null,
  };
}

// ── complete (backend-authoritative; all 14 gates) ───────────────────────────
export async function complete(enrollmentId: string, cardId: string) {
  const { card, scenario, row } = await load(enrollmentId, cardId);
  let progress = normalize(row.student_progress, scenario);
  if (progress.state === 'completed') {
    // idempotent: already done -> return the stored artifact + ledger, no re-award
    const existing = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
    return { already: true, artifact: existing ? existing.toJSON() : null, receipt: computeReceipt(scenario), evaluation: progress.evaluation, baseline: scenario.baseline, ledger: await getLedger(enrollmentId) };
  }
  // backfill derived evidence, then ensure evaluation
  progress = { ...progress, ...deriveEvidence(progress, scenario) };
  if (!progress.evaluation) { await save(row, progress, 'in_progress'); await evaluate(enrollmentId, cardId); progress = normalize((await row.reload()).student_progress, scenario); }
  const gaps = completionGaps(progress, scenario);
  if (gaps.length) throw httpErr('A few steps remain before this can be marked complete.', 422, { code: 'gate_unmet', gaps });

  // Architect Decision Record -> PortfolioArtifact (created BEFORE completeActivity so
  // its auto-artifact path reuses ours; dedup one per card).
  const existing = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  if (!existing) {
    const adr = buildAdr(progress, scenario);
    await PortfolioArtifact.create({
      enrollment_id: enrollmentId, card_id: cardId, kind: 'architecture_decision',
      title: `ADR — ${scenario.title}`,
      summary: `Architect Decision Record from ${scenario.experience}, Week ${scenario.week}: ${String(adr.decision).slice(0, 180)}`,
      content: { adr, week: scenario.week, scenario_version: scenario.version, receipt: computeReceipt(scenario) },
      competencies: (card as any).competencies || [],
    } as any);
  }

  progress.state = 'completion_eligible';
  await save(row, progress, 'in_progress');
  const result = await completeActivity(enrollmentId, cardId, { work: `${scenario.experience} — Week ${scenario.week} (${scenario.baseline ? 'baseline' : 'lesson'})` });

  progress.state = 'completed';
  progress.completed_at = new Date().toISOString();
  await save(row, progress, 'completed');

  return {
    already: false,
    outcome: result.outcome,
    artifact: result.artifact,
    readiness: result.readiness,
    receipt: computeReceipt(scenario),
    evaluation: progress.evaluation,
    baseline: scenario.baseline,
    ledger: await getLedger(enrollmentId),
  };
}

// ── derived Mindset Ledger (aggregate across the enrollment's architect cards) ─
export async function getLedger(enrollmentId: string) {
  const cards = await TimelineCard.findAll({ where: { type: TYPE_SLUG }, attributes: ['id', 'week', 'metadata'] });
  if (!cards.length) return projectLedger([]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const progs = await TimelineCardProgress.findAll({ where: { enrollment_id: enrollmentId, card_id: cards.map((c) => c.id) } });
  const entries = progs.map((pr) => {
    const c: any = byId.get(pr.card_id);
    const sc = scenarioForCard(c);
    if (!sc) return null;
    return ledgerEntryFor(normalize(pr.student_progress, sc), sc);
  }).filter(Boolean) as any[];
  return projectLedger(entries);
}
