import { careerPrepChat, logLlmFailure, type LlmCall } from './careerPrepLlm';
import type { Dashboard } from './prepViews';

/**
 * Career Prep v27 (CP3.4): Cora answers a free question. The common intents (plan, weak skills,
 * 10 minutes, add an interview, progress, the get-hired sheets) never reach here: the client's
 * askRouter handles them without a model call.
 *
 * NUMBER GUARD (kit P4.8): Cora receives only computed metrics, and every number in her reply must
 * appear in that context. A reply with any other number is rejected and retried once with a warning;
 * if it still invents one, she is asked for an answer with no digits at all; if even that has digits,
 * a fixed line is returned. She never comments on appearance, accent or any protected trait.
 */
export const CORA_PROMPT_VERSION = 'career-prep-cora-v1';
const MAX_SENTENCES = 3;

const SYSTEM = `You are Cora, a calm, direct interview coach for adults preparing for job interviews.
Answer in at most ${MAX_SENTENCES} short sentences, in plain American English, with one concrete next step.
Use ONLY the facts and numbers in CONTEXT. Never invent a score, count, time or percentage.
Never comment on appearance, voice quality, the way someone speaks, or any protected trait.
Return JSON: {"reply": "..."}.`;

/** The computed metrics Cora may cite, as plain lines. Nothing here is made up: absent values are absent. */
export function coraContext(d: Dashboard): string {
  const lines: string[] = [];
  if (d.readiness) lines.push(`Readiness: ${d.readiness.value} out of 100${d.readiness.target !== undefined ? `; ready at ${d.readiness.target}` : ''}.`);
  for (const s of d.skills) if (s.score !== undefined) lines.push(`Skill ${s.label}: ${s.score}${s.change30 !== undefined ? ` (30-day change ${s.change30})` : ''}.`);
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

export function firstSentences(text: string, n = MAX_SENTENCES): string {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [];
  return parts.slice(0, n).join('').trim();
}

const FALLBACK = 'I cannot give you a reliable number on that yet. Open Your progress to see what your practice shows so far.';
const UNAVAILABLE = 'I could not answer that just now. Try one of the suggestions below, or ask again in a moment.';

async function ask(call: LlmCall, user: string): Promise<string | null> {
  const raw = await call(CORA_PROMPT_VERSION, SYSTEM, user, 300);
  if (!raw) return null;
  const reply = (JSON.parse(raw) as { reply?: unknown }).reply;
  return typeof reply === 'string' && reply.trim() ? firstSentences(reply) : null;
}

export async function askCora(message: string, dashboard: Dashboard, call: LlmCall = careerPrepChat): Promise<{ messages: string[]; grounded: boolean }> {
  const context = coraContext(dashboard);
  const base = `CONTEXT:\n${context}\n\nSTUDENT: ${message.slice(0, 2000)}`;
  try {
    const first = await ask(call, base);
    if (first === null) return { messages: [UNAVAILABLE], grounded: true };
    if (numbersGrounded(first, context)) return { messages: [first], grounded: true };
    const second = await ask(call, `${base}\n\nYour last answer used a number that is not in CONTEXT. Answer again using only numbers from CONTEXT.`);
    if (second !== null && numbersGrounded(second, context)) return { messages: [second], grounded: true };
    const third = await ask(call, `${base}\n\nAnswer without using any digits at all.`);
    if (third !== null && !/\d/.test(third)) return { messages: [third], grounded: true };
    return { messages: [FALLBACK], grounded: false };
  } catch (err) {
    logLlmFailure('career_prep_cora_failed', err);
    return { messages: [UNAVAILABLE], grounded: true };
  }
}
