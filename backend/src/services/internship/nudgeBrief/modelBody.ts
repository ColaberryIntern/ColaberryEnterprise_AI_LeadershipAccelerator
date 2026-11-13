/**
 * modelBody - the middle of the message, written by the model, gated on the facts.
 *
 * ## What this is for
 *
 * Measured on 2026-11-11: 13 of 13 messages opened with the same sentence, and 48% of all
 * sentences were text another intern also received. The cause is structural rather than a matter
 * of wording - `close()` is six string literals keyed on the focus and `wayThrough()` is three
 * quarters the same, so two interns on one tier get those sentences byte for byte. Interpolating
 * their numbers into a fixed sentence makes a message accurate; it does not make it responsive.
 *
 * Ali, 2026-11-11, asked as a multiple choice and answered A: the model may write the body, as a
 * hybrid, behind a gate on the facts.
 *
 * ## Why the model writes only the MIDDLE
 *
 * The first line and the closing line are structural promises. The first is their name, which the
 * sender and every test depend on; the last is one reply with a date, which is the entire point of
 * sending at all. Letting the model near either trades a real guarantee for a stylistic gain. It
 * writes the three blocks in between, where the sameness actually lives.
 *
 * ## Why the gate is a list of refusals rather than a score
 *
 * `composeBrief` is documented PURE, and it stays that way: this module never runs inside it.
 * Exactly as `summary.ts` upgrades `fallbackSummary`, the deterministic body is composed first and
 * is what ships unless a model draft passes every check below. The failure mode of this subsystem
 * is a false sentence arriving in Ali's name, by email, at a real person who may never say so - so
 * the gate rejects on any doubt and the cost of rejection is only that today's wording is used.
 *
 * ## The checks, and the mistake each one exists for
 *
 *   gendered pronoun   nobody's pronouns are in the data. The 9 Nov dry run gendered an intern.
 *   invented number    `summary.ts` learned this one: "46 of 136" when the real number was 47.
 *   invented date word a day name the facts never mention is a commitment nobody made.
 *   unquoted quote     a sentence in quotation marks must appear VERBATIM in their own words.
 *                      This is the whole premise - say what they actually sent - and a model
 *                      paraphrasing someone and presenting it as their words is worse than silence.
 *   invented link      a URL not in the facts.
 *   sender guards      `briefProblems`, so a draft that could not be sent is never shown as one.
 */
import type { ChatClient } from '../portfolioReport/narrate';
import type { SidecarIntern } from '../portfolioReport/sidecar/types';
import { checkEscalation, type EscalationLevel } from './escalationGate';
import { chooseFocus, nextRealTask, theirLastWord } from './shapes';
import { briefProblems, type BriefDeadline, type NudgeBrief } from './types';

export const BODY_MODEL = process.env.INTERN_NUDGE_MODEL || process.env.INTERN_REPORT_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 30000;

/**
 * Day and month names. A model that names one the facts never mentioned has invented a date, and
 * a date in a manager's email is a commitment somebody now believes in.
 *
 * `today`, `tomorrow` and `tonight` are deliberately NOT here. They are relative to the moment of
 * sending rather than claims about a calendar, they are ordinary manager language, and the
 * deterministic close already uses them ("Reply today with the day you will have the first one
 * recorded"). Including them rejected almost every reasonable draft, including this file's own
 * example of a good one.
 */
const DATE_WORD = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;

const numbersIn = (s: string): string[] => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
const wordsIn = (s: string, re: RegExp): string[] => (s.match(re) ?? []).map((w) => w.toLowerCase());
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export interface BodyFacts {
  firstName: string;
  focus: string;
  tier: string;
  /** Their own words, as the sidecar holds them. The only text a quote may be drawn from. */
  theirWords: { subject: string; receivedAt: string; text: string } | null;
  openQuestions: Array<{ subject: string; text: string }>;
  promises: Array<{ quote: string; sentAt: string }>;
  project: { name: string | null; hasRepo: boolean } | null;
  signals: Record<string, number | string | boolean | null>;
  deadline: { dueOn: string; daysLeft: number; outstanding: string[] } | null;
  nextTask: { title: string; dueOn: string | null } | null;
  /**
   * The hardest this message may be. Only the LEVEL is carried, never the warrant's reason text:
   * `validateMiddle` checks every number in a draft against `JSON.stringify(facts)`, so a
   * sentence like "3 messages with nothing back" would quietly widen the set of numbers the model
   * is allowed to state.
   */
  escalationCeiling: EscalationLevel;
  /** Today's deterministic middle. The model is rewriting this, not inventing from nothing. */
  draft: string;
}

export const SYSTEM = [
  'You write the middle of a short email from a manager to one software intern.',
  'You are given facts as JSON and a draft. Rewrite the draft so it speaks to this person.',
  '',
  'Rules, all of them hard:',
  '- Use ONLY the facts given. Never state a number, a date, a day name or a link that is not in them.',
  '- Never use he, she, his, her, him, hers. You do not know their pronouns.',
  '- If you put words in quotation marks, they must appear EXACTLY in theirWords.text. Otherwise do not quote.',
  '- No em dashes or en dashes. No angle brackets.',
  '- Do not greet them and do not sign off. Someone else writes the first line and the last line.',
  '- Two to six sentences. Plain, direct, warm, no filler, no praise they did not earn.',
  '- Unless escalationCeiling is "ultimatum", never raise them leaving, never suggest the program',
  '  may be wrong for them, and never state a limit on what we will keep doing.',
  '- Unless escalationCeiling is at least "pressure", do not make their silence the subject: no',
  '  counting messages back at them, no naming a pattern, no "I am going to be straight with you".',
  '- Lead with the single thing that matters most to them today, and say why it matters.',
  '',
  'Return JSON: {"middle": "..."}',
].join('\n');

/**
 * The facts for one brief, drawn from the sidecar and the brief the pure composer already made.
 *
 * Nothing is fetched and nothing is derived that `composeBrief` did not already derive, so the
 * model cannot be shown a fact the deterministic message could not also have used.
 */
export function factsForBrief(intern: SidecarIntern, brief: NudgeBrief, deadline: BriefDeadline | null): BodyFacts {
  const word = theirLastWord(intern);
  return bodyFacts({
    firstName: brief.firstName,
    // The SAME warrant the brief was composed under, so the model is told about the message it is
    // rewriting rather than about a freshly computed one that may have moved.
    escalationCeiling: brief.escalation.level,
    focus: chooseFocus(intern, deadline, brief.escalation),
    tier: brief.tier,
    theirWords: word ? { subject: word.subject, receivedAt: word.received_at, text: word.excerpt } : null,
    openQuestions: brief.openQuestions.map((q) => ({ subject: q.subject, text: q.text })),
    promises: brief.promises.map((p) => ({ quote: p.quote, sentAt: p.sentAt })),
    project: brief.projectName || brief.signals.hasRepo
      ? { name: brief.projectName, hasRepo: brief.signals.hasRepo }
      : null,
    signals: { ...brief.signals },
    deadline: deadline
      ? { dueOn: deadline.dueOn, daysLeft: deadline.daysLeft, outstanding: [...deadline.outstanding] }
      : null,
    nextTask: nextRealTask(intern)
      ? { title: String(nextRealTask(intern)?.label ?? ''), dueOn: null }
      : null,
    draft: brief.bodyParts.middle,
  });
}

/** Everything the model is allowed to know. Nothing here is guessed. */
export function bodyFacts(input: {
  firstName: string; focus: string; tier: string;
  theirWords: BodyFacts['theirWords']; openQuestions: BodyFacts['openQuestions'];
  promises: BodyFacts['promises']; project: BodyFacts['project'];
  signals: BodyFacts['signals']; deadline: BodyFacts['deadline'];
  nextTask: BodyFacts['nextTask']; draft: string;
  /** Omitted means `none`: a caller that cannot say what is warranted gets the gentlest ceiling. */
  escalationCeiling?: EscalationLevel;
}): BodyFacts {
  // Spread first, then the default, so an explicit `undefined` cannot overwrite it back out.
  return { ...input, escalationCeiling: input.escalationCeiling ?? 'none' };
}

/** Returns the cleaned middle, or the reason it was refused. */
export function validateMiddle(text: unknown, facts: BodyFacts): { ok: true; middle: string } | { ok: false; reason: string } {
  const s = String(text ?? '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!s) return { ok: false, reason: 'empty' };
  if (s.length > 1600) return { ok: false, reason: `too long (${s.length})` };
  if (s.length < 60) return { ok: false, reason: `too short (${s.length})` };

  if (/\b(he|she|his|her|hers|him)\b/i.test(s)) return { ok: false, reason: 'gendered pronoun' };

  /**
   * Harder on them than the evidence supports.
   *
   * The model is handed a deterministic draft that already respects the ceiling, so this catches
   * it reaching for severity the facts did not give it: a rewrite of "tell me what is in the way"
   * that arrives as "tell me whether this is still working for you" is a different message about a
   * different subject, and it is the one that costs a person.
   */
  const tone = checkEscalation(s, facts.escalationCeiling);
  if (!tone.ok) {
    return { ok: false, reason: `escalates beyond the evidence: wrote "${tone.phrase}" at ${tone.found} when ${tone.allowed} is the ceiling` };
  }

  const problems = briefProblems(s);
  if (problems.length) return { ok: false, reason: `sender would refuse it: ${problems.join('; ')}` };

  const sentences = s.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length);
  if (sentences.length < 2 || sentences.length > 8) return { ok: false, reason: `${sentences.length} sentences` };

  // A greeting or a sign-off means it wrote a line that is not its to write.
  if (new RegExp(`^\\s*(hi|hello|hey|dear)\\b|^\\s*${facts.firstName}\\s*,`, 'i').test(s)) {
    return { ok: false, reason: 'wrote the greeting, which is not its line' };
  }

  const factsJson = JSON.stringify(facts);

  const allowedNumbers = new Set(numbersIn(factsJson));
  const invented = numbersIn(s).filter((n) => !allowedNumbers.has(n));
  if (invented.length) return { ok: false, reason: `number not in facts: ${invented.join(', ')}` };

  const allowedDates = new Set(wordsIn(factsJson, DATE_WORD));
  const inventedDates = [...new Set(wordsIn(s, DATE_WORD))].filter((w) => !allowedDates.has(w));
  if (inventedDates.length) return { ok: false, reason: `date word not in facts: ${inventedDates.join(', ')}` };

  if (/https?:\/\/\S+/i.test(s)) {
    const links = (s.match(/https?:\/\/\S+/gi) ?? []).filter((u) => !factsJson.includes(u.replace(/[.,)]+$/, '')));
    if (links.length) return { ok: false, reason: `link not in facts: ${links.join(', ')}` };
  }

  // Quotation marks are a claim about what THEY said. Check it, verbatim, against their own words.
  const source = norm([facts.theirWords?.text ?? '', facts.theirWords?.subject ?? '',
    ...facts.openQuestions.map((q) => `${q.subject} ${q.text}`),
    ...facts.promises.map((p) => p.quote)].join(' '));
  for (const m of s.matchAll(/"([^"]{8,})"/g)) {
    if (!source.includes(norm(m[1]))) return { ok: false, reason: `quoted words are not theirs: "${m[1].slice(0, 60)}"` };
  }

  return { ok: true, middle: s };
}

/** One model attempt. Null on any failure, which always means "use the deterministic body". */
export async function writeMiddle(client: ChatClient, facts: BodyFacts): Promise<{ middle: string } | { reason: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await client.chat.completions.create({
      model: BODY_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(facts) }],
    }, { signal: ctl.signal });
    let parsed: unknown;
    try { parsed = JSON.parse(String(resp?.choices?.[0]?.message?.content ?? '')); } catch { parsed = null; }
    const v = validateMiddle((parsed as { middle?: unknown } | null)?.middle, facts);
    return v.ok ? { middle: v.middle } : { reason: v.reason };
  } catch (err) {
    return { reason: `${(err as { name?: string })?.name ?? 'Error'}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Put the message back together with a new middle.
 *
 * The head and the tail come from `composeBrief`, which already produced them, so there is no
 * second place where a message gets assembled and no way for the two to drift.
 */
export function assembleBody(parts: { head: string; middle: string; tail: string }, middle: string): string {
  return [parts.head, middle.trim(), parts.tail].filter((x) => x.trim().length).join('\n\n').trim();
}

/**
 * Upgrade one brief's body, or leave it exactly as it was.
 *
 * Returns a NEW brief rather than mutating, because `composeBrief` is pure and callers are
 * entitled to assume a brief does not change under them. `deterministicBody` is never touched:
 * that is the text an unattended send uses.
 */
export async function upgradeBody<T extends {
  firstName: string; body: string; deterministicBody: string; bodyFromModel: boolean;
  bodyParts: { head: string; middle: string; tail: string }; warnings: readonly string[];
}>(brief: T, facts: BodyFacts, client: ChatClient | null): Promise<T> {
  if (!client) return brief;
  const r = await writeMiddle(client, facts);
  if ('reason' in r) {
    logRejected(brief.firstName, r.reason);
    return brief;
  }
  const body = assembleBody(brief.bodyParts, r.middle);
  // The assembled whole is checked again. The middle passed on its own, but the sender's guards
  // apply to the message that actually goes out, and joining three pieces is where a stray
  // sign-off or a doubled sentence would appear.
  const problems = briefProblems(body);
  if (problems.length) {
    logRejected(brief.firstName, `assembled body would be refused: ${problems.join('; ')}`);
    return brief;
  }
  return { ...brief, body, bodyFromModel: true };
}

/** Structured log, same shape and reasoning as summary.ts's rejection line. */
export function logRejected(firstName: string, reason: string): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'intern-nudge',
    event: 'nudge_body_rejected', outcome: 'partial', error_class: 'ContractViolation',
    context: { intern: firstName, reason },
  }));
}
