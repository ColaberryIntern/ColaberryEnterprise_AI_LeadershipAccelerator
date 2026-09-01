/**
 * portfolioNarrativeService — the story, written from evidence, approved by a human.
 *
 * Step 5, and the one change that alters what this platform promises. Everything else on
 * the record is rendered from a field; this is generated prose about a person, published
 * where an employer will read it.
 *
 * ── THE TENSION, STATED PLAINLY ─────────────────────────────────────────────
 *
 * `capstoneRecordCompiler` guarantees it INVENTS NOTHING, and that guarantee is why a
 * student can defend every line of their record in a room. A language model writing
 * narrative is, on its face, the opposite of that.
 *
 * The reconciliation is the thing Repo2Reputation does not have and we do: **a mentor
 * approves the text before it publishes.** Generated narrative is therefore treated
 * exactly like a learner-authored headline — frozen at approval, never read live. Nothing
 * a model wrote reaches a stranger without a human having read that exact sentence.
 *
 * ── THREE RULES THE PROMPT CANNOT BE TRUSTED TO KEEP ────────────────────────
 *
 * A prompt is a request, not a guarantee, so each of these is enforced in code:
 *
 *   1. THE MODEL SEES ONLY EVIDENCE. It is handed the inferred skills with their bases,
 *      the repo signals, and the project fields — never the raw file tree, never the
 *      assessment tables, never anything the page would not otherwise publish. It cannot
 *      cite what it was never shown.
 *   2. THE OUTPUT IS LENGTH-BOUNDED AND SHAPE-CHECKED. Two paragraphs, hard character
 *      cap, no headings, no lists, no links. A long generated essay on a portfolio reads
 *      as filler and buries the artefacts underneath it.
 *   3. FAILURE PRODUCES NOTHING, NEVER A GUESS. If the model is unavailable, slow, or
 *      returns something malformed, the record carries no narrative and the page renders
 *      without one. An absent paragraph is a page that looks deliberate; an invented one
 *      is a claim a student has to defend and cannot.
 *
 * ── FAILURE-FIRST ───────────────────────────────────────────────────────────
 *
 * (1) Timeout is explicit at 30s; the caller is a review request, not a page load, so a
 * slow model must not hang a request. (2) No retry: a second attempt on a generation this
 * cheap adds latency for a learner who is waiting, and the action is re-runnable by hand.
 * (3) Recovery: ask again — it is idempotent and stores nothing until it succeeds.
 * (4) Handled: no key, model unavailable, timeout, empty completion, over-length output,
 * output containing markup, insufficient evidence. Not handled: nothing reaching a caller.
 */

import type { InferredSkill } from '../sbp/skillInference';
import type { RepoSignals } from '../sbp/repoSignals';

/** Hard ceiling. Past this it stops being a summary and starts being filler. */
const MAX_CHARS = 900;
const TIMEOUT_MS = 30_000;
const MODEL = 'gpt-4o-mini';

export interface NarrativeInput {
  full_name: string;
  /** Project facts, already the ones the page publishes. */
  project: {
    name?: string | null;
    problem?: string | null;
    what_it_does?: string | null;
    organization?: string | null;
    industry?: string | null;
  } | null;
  skills: InferredSkill[];
  signals: RepoSignals | null;
}

export interface NarrativeResult {
  /** The prose, or null. Null is a legitimate, common outcome. */
  narrative: string | null;
  /** Why there is none, for the log and for the learner. Never shown as page copy. */
  reason?: 'insufficient_evidence' | 'unavailable' | 'malformed';
}

/**
 * Enough to write about?
 *
 * A repo with one committed skill and no project facts produces a paragraph that says
 * nothing, and a paragraph that says nothing is worse than silence on a page whose whole
 * value is that it can be believed.
 */
export function hasEnoughToSay(input: NarrativeInput): boolean {
  const skills = Array.isArray(input.skills) ? input.skills : [];
  const hasProject = !!(input.project?.problem || input.project?.what_it_does);
  return skills.length >= 2 || (skills.length >= 1 && hasProject);
}

/**
 * The evidence the model is allowed to see. Built field by field, like the public
 * projection — the model cannot cite what it was never handed.
 */
export function buildEvidenceBlock(input: NarrativeInput): string {
  const lines: string[] = [];
  const p = input.project;
  if (p?.name) lines.push(`Project: ${p.name}`);
  if (p?.organization) lines.push(`Built for: ${p.organization}`);
  if (p?.industry) lines.push(`Sector: ${p.industry}`);
  if (p?.problem) lines.push(`Problem it addresses: ${p.problem}`);
  if (p?.what_it_does) lines.push(`What it does: ${p.what_it_does}`);

  const s = input.signals;
  if (s?.languages?.length) {
    lines.push(`Languages committed: ${s.languages.map((l) => `${l.name} (${l.files} files)`).join(', ')}`);
  }
  if (s?.practices) {
    const observed = Object.entries(s.practices).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' '));
    if (observed.length) lines.push(`Observed in the repository: ${observed.join(', ')}`);
  }

  for (const skill of input.skills ?? []) {
    lines.push(`${skill.label} — evidenced by: ${skill.basis.join('; ')}`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You write two short paragraphs for a software engineer\'s portfolio page, read by a',
  'recruiter or hiring manager.',
  '',
  'RULES, all absolute:',
  '- Use ONLY the evidence given. Never add a technology, employer, metric, duration or',
  '  achievement that is not stated there. If the evidence is thin, write less.',
  '- Never claim skill level. Say what they built, not that they are proficient, expert,',
  '  senior or experienced.',
  '- No headings, no bullet points, no markdown, no links.',
  '- Two paragraphs maximum. Plain, factual, specific. No superlatives, no filler',
  '  openers like "passionate" or "results-driven".',
  '- Write in the third person, using their name once at most.',
].join('\n');

/**
 * Strip anything the shape rules forbid, and reject rather than repair a bad output.
 *
 * Repairing is tempting and wrong: a model that returned headings and links was not
 * following instruction, and silently reshaping its output publishes prose nobody
 * inspected in the form it will appear.
 */
export function validateNarrative(raw: unknown): NarrativeResult {
  if (typeof raw !== 'string') return { narrative: null, reason: 'malformed' };
  const text = raw.trim();
  if (!text) return { narrative: null, reason: 'malformed' };
  if (text.length > MAX_CHARS) return { narrative: null, reason: 'malformed' };
  // Markup of any kind means the instruction was not followed.
  if (/^#|^\s*[-*]\s|\[.+?\]\(.+?\)|https?:\/\//m.test(text)) {
    return { narrative: null, reason: 'malformed' };
  }
  return { narrative: text };
}

/**
 * Generate the narrative, or return null.
 *
 * Never throws. Every failure path yields `{ narrative: null }` with a reason, because a
 * record compile must not fail because a model was slow.
 */
export async function generateNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  if (!hasEnoughToSay(input)) return { narrative: null, reason: 'insufficient_evidence' };

  const evidence = buildEvidenceBlock(input);
  if (!evidence.trim()) return { narrative: null, reason: 'insufficient_evidence' };

  try {
    const { getInstrumentedOpenAI } = await import('../openaiInstrumented');
    const openai = getInstrumentedOpenAI({ workflow_id: 'portfolio_narrative' });

    const completion = await Promise.race([
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Engineer: ${input.full_name}\n\nEvidence:\n${evidence}` },
        ],
        // Low, not zero: zero produces stilted repetition across a cohort, where every
        // page opens with the same clause. Low keeps it grounded and readable.
        temperature: 0.3,
        max_tokens: 320,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('narrative_timeout')), TIMEOUT_MS)),
    ]);

    return validateNarrative((completion as any)?.choices?.[0]?.message?.content);
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'portfolio_narrative_unavailable', outcome: 'partial',
      error_class: err?.name === 'Error' && err?.message === 'narrative_timeout'
        ? 'TimeoutError' : (err?.error_class || err?.name || 'Error'),
      context: { message: err?.message },
    }));
    return { narrative: null, reason: 'unavailable' };
  }
}
