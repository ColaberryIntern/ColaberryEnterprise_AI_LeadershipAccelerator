import { careerPrepChat, logLlmFailure, type LlmCall } from './careerPrepLlm';
import { findCoraReplyViolations } from '../coraPromptRules';
import type { Dashboard } from './prepViews';

/**
 * Career Prep v27 (CP3.4): Cora answers a free question. The common intents (plan, weak skills,
 * 10 minutes, add an interview, progress, the get-hired sheets) never reach here: the client's
 * askRouter handles them without a model call.
 *
 * NUMBER GUARD (kit P4.8): Cora receives only computed metrics, and every number in her reply must
 * appear in that context. A reply with any other number is rejected and retried once with a warning;
 * if it still breaks a rule, she is asked for an answer with no digits at all; if even that fails, a
 * fixed line is returned. Spelled-out numbers are not caught (a known limit of a digit check).
 *
 * COMPLIANCE: the four platform Cora rules that apply to a coaching chat (coraPromptRules.ts rules 1,
 * 3, 4 and 5) are stated in COACHING_RULES. The rest of that file (answer only from a knowledge base,
 * hand off to a person, the needs_human flag, the support address) is for support EMAIL replies and is
 * deliberately not used here. Every reply is still checked with findCoraReplyViolations; a violation is
 * handled exactly like an ungrounded number.
 *
 * LATENCY: the whole exchange has a 20 s budget. Each call is limited to the time left (no SDK retries:
 * the guard's own retry is the retry), and raced against that time, so a hung upstream returns the
 * "could not answer" line with suggestion cards inside the budget.
 */
export const CORA_PROMPT_VERSION = 'career-prep-cora-v3';
const MAX_SENTENCES = 3;
const BUDGET_MS = 20_000;

/** coraPromptRules.ts rules 1, 3, 4 and 5, restated for a coaching chat. */
export const COACHING_RULES = `Rules:
1. Never use the word "free" (Texas Workforce Commission rule 807.172(d)): not about a program, an event or a tool, and not in "feel free".
2. Never promise an outcome: a job, a placement, an introduction, a referral, an interview, or a salary. Never say we do or do not guarantee employment.
3. Never name a person, team, department or email address that is not in CONTEXT.
4. Never say an action has been taken (a booking made, a form submitted, a record changed). You can only coach.`;

export const SYSTEM = `You are Cora, a calm, direct interview coach for adults preparing for job interviews.
Answer in at most ${MAX_SENTENCES} short sentences, in plain American English, with one concrete next step.
Use ONLY the facts and numbers in CONTEXT. Never invent a score, count, time or percentage.
Never comment on appearance, voice quality, the way someone speaks, or any protected trait.
Return JSON: {"reply": "..."}.

${COACHING_RULES}`;

/** The computed metrics Cora may cite, as plain lines. No incidental numbers: every number here is citable. */
export function coraContext(d: Dashboard): string {
  const lines: string[] = [];
  if (d.readiness) lines.push(`Readiness: ${d.readiness.value}${d.readiness.target !== undefined ? `; ready at ${d.readiness.target}` : ''}.`);
  for (const s of d.skills) if (s.score !== undefined) lines.push(`Skill ${s.label}: ${s.score}${s.change30 !== undefined ? ` (change over the last month: ${s.change30})` : ''}.`);
  const anchor = d.interviews.find((i) => i.id === d.anchorId);
  if (anchor) lines.push(`Preparing for: ${anchor.company}, ${anchor.role}, a ${anchor.type.replace('_', ' ')} interview.`);
  if (d.streak > 0) lines.push(`Practice streak: ${d.streak} days.`);
  if (d.thisWeek > 0) lines.push(`Minutes practiced this week: ${d.thisWeek}.`);
  if (!lines.length) lines.push('No practice data yet.');
  return lines.join('\n');
}

const numbersIn = (s: string): string[] => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));

/** True when every number in the reply appears in the context. */
export function numbersGrounded(reply: string, context: string): boolean {
  const allowed = new Set(numbersIn(context));
  return numbersIn(reply).every((n) => allowed.has(n));
}

/** A reply Cora may send: every number grounded and no compliance rule broken. */
export function acceptable(reply: string, context: string): boolean {
  return numbersGrounded(reply, context) && findCoraReplyViolations(reply).length === 0;
}

export function firstSentences(text: string, n = MAX_SENTENCES): string {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [];
  return parts.slice(0, n).join('').trim();
}

const FALLBACK = 'I cannot give you a reliable answer on that yet. Open Your progress to see what your practice shows so far.';
const UNAVAILABLE = 'I could not answer that just now. Try one of the suggestions below, or ask again in a moment.';
const sleepNull = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

export interface CoraAnswer { messages: string[]; grounded: boolean; unavailable: boolean }
export interface CoraDeps { call?: LlmCall; clock?: () => number; wait?: (ms: number) => Promise<null> }

export async function askCora(message: string, dashboard: Dashboard, deps: CoraDeps = {}): Promise<CoraAnswer> {
  const { call = careerPrepChat, clock = Date.now, wait = sleepNull } = deps;
  const context = coraContext(dashboard);
  const base = `CONTEXT:\n${context}\n\nSTUDENT: ${message.slice(0, 2000)}`;
  const start = clock();
  const left = () => BUDGET_MS - (clock() - start);
  /** One call, limited to the time left and raced against it: null when out of time or empty. */
  const ask = async (user: string): Promise<string | null> => {
    const ms = left();
    if (ms <= 0) return null;
    const raw = await Promise.race([call(CORA_PROMPT_VERSION, SYSTEM, user, 300, { timeoutMs: ms, maxRetries: 0 }), wait(ms)]);
    if (!raw) return null;
    const reply = (JSON.parse(raw) as { reply?: unknown }).reply;
    return typeof reply === 'string' && reply.trim() ? firstSentences(reply) : null;
  };
  try {
    const first = await ask(base);
    if (first === null) return { messages: [UNAVAILABLE], grounded: true, unavailable: true };
    if (acceptable(first, context)) return { messages: [first], grounded: true, unavailable: false };
    const second = await ask(`${base}\n\nYour last answer broke a rule: a number that is not in CONTEXT, or one of the rules above. Answer again following every rule.`);
    if (second !== null && acceptable(second, context)) return { messages: [second], grounded: true, unavailable: false };
    const third = await ask(`${base}\n\nAnswer without using any digits at all, following every rule.`);
    if (third !== null && !/\d/.test(third) && findCoraReplyViolations(third).length === 0) return { messages: [third], grounded: true, unavailable: false };
    return { messages: [FALLBACK], grounded: false, unavailable: false };
  } catch (err) {
    logLlmFailure('career_prep_cora_failed', err);
    return { messages: [UNAVAILABLE], grounded: true, unavailable: true };
  }
}
