/**
 * learnerMemoryFormat — the PURE half of the longitudinal learner-memory writer.
 * No I/O (no models, no LLM client, no clock), so it is unit-testable and holds
 * the logic that must be deterministic:
 *   - buildDistillMessages: the prompt that turns "prior profile + recent
 *     activity" into an updated profile.
 *   - normalizeDistillation: defensive parse of the LLM's JSON.
 *   - shouldDistill: the IDEMPOTENCY rule (at most once per enrollment per day,
 *     and only when there is genuinely new activity).
 *   - renderMemoryLine: the compact line injected into the learner-360.
 *
 * This is the "gets to know you over weeks" engine: a nightly worker distills
 * each student's sessions into an evolving profile that the mentor reads.
 */

export interface DistilledMemory {
  summary: string;          // 2-3 sentences, "they…"
  misconceptions: string[]; // recurring gaps, persist across sessions
  goals: string;            // their current goal, one line
  strengths: string[];      // what they're consistently good at
}

export interface DistillInputs {
  priorSummary?: string | null;
  priorMisconceptions?: string[] | null;
  recentQuestions: string[];   // what they asked the mentor recently
  recentGaps: string[];        // weakest skills (from the genome)
  recentEvalNotes: string[];   // e.g. "Week 3 evaluation: 60% (not passed), weak on Prompting"
  goalHint?: string | null;    // persona goal, if known
}

const clip = (s: string, n = 200) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const strList = (v: any, max: number, n = 80): string[] =>
  (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.trim()).map((x: string) => clip(x, n)).slice(0, max);

/** PURE — the distillation prompt (system + user). The model returns STRICT json. */
export function buildDistillMessages(inputs: DistillInputs): { system: string; user: string } {
  const system =
    'You maintain an evolving profile of a student in an AI Systems Architect Accelerator so their AI mentor gets ' +
    'to know them over time. Given their PRIOR profile and RECENT activity, return an UPDATED profile as STRICT json. ' +
    'Capture what PERSISTS — recurring misconceptions, durable strengths, their real goal, their current knowledge ' +
    'frontier — not one-off noise. Be specific and concise. Never invent facts not supported by the activity.';

  const payload = {
    prior_summary: inputs.priorSummary || null,
    prior_misconceptions: inputs.priorMisconceptions || [],
    recent_questions: inputs.recentQuestions.slice(0, 20),
    weakest_skills: inputs.recentGaps.slice(0, 6),
    recent_evaluations: inputs.recentEvalNotes.slice(0, 6),
    known_goal: inputs.goalHint || null,
  };
  const user =
    `PRIOR PROFILE + RECENT ACTIVITY:\n${JSON.stringify(payload, null, 2)}\n\n` +
    'Return json exactly: { "summary": string (2-3 sentences in third person "they"), ' +
    '"misconceptions": string[] (recurring gaps, max 4), "goals": string (their current goal, one line), ' +
    '"strengths": string[] (max 4) }. Merge the prior profile with the new activity — evolve it, do not restart it.';

  return { system, user };
}

/** PURE — defensively coerce the LLM's json into a typed DistilledMemory. */
export function normalizeDistillation(raw: any): DistilledMemory {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    summary: clip(typeof r.summary === 'string' ? r.summary : '', 600),
    misconceptions: strList(r.misconceptions, 4),
    goals: clip(typeof r.goals === 'string' ? r.goals : '', 160),
    strengths: strList(r.strengths, 4),
  };
}

/**
 * PURE — the idempotency rule. Distill at most once per enrollment per day, and
 * only when there is genuinely new mentor/assessment activity since last time.
 * `today`/`lastDistilledOn` are YYYY-MM-DD strings passed in (no clock here).
 */
export function shouldDistill(lastDistilledOn: string | null, today: string, hasNewActivity: boolean): boolean {
  if (!hasNewActivity) return false;      // nothing new to learn
  if (lastDistilledOn === today) return false; // already distilled today (idempotent)
  return true;
}

/** PURE — is this memory worth injecting? (a brand-new row is all-empty). */
export function hasMemory(mem: Partial<DistilledMemory> | null | undefined): boolean {
  return !!(mem && (mem.summary || (mem.misconceptions && mem.misconceptions.length) || (mem.strengths && mem.strengths.length)));
}

/** PURE — the compact line injected into the learner-360 (budget-capped). */
export function renderMemoryLine(mem: Partial<DistilledMemory> | null | undefined, budget = 500): string {
  if (!hasMemory(mem)) return '';
  const m = mem as DistilledMemory;
  const parts: string[] = [];
  if (m.summary) parts.push(m.summary);
  if (m.misconceptions && m.misconceptions.length) parts.push(`Recurring gaps: ${m.misconceptions.join(', ')}.`);
  if (m.strengths && m.strengths.length) parts.push(`Consistent strengths: ${m.strengths.join(', ')}.`);
  return clip(`What the mentor has learned about them over time: ${parts.join(' ')}`, budget);
}
