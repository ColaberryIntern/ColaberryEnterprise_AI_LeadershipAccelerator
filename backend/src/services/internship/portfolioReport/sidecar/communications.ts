/**
 * communications - PURE. The most insightful messages exchanged with the interns in the report
 * window (Ali, 10 Nov 2026: "for every report, find me the 10 most insightful communications").
 *
 * "Insightful" is scored, not guessed, so the same mail always ranks the same way and every pick
 * says WHY it was picked (`signals`). Points:
 *   from the intern                    +2   (their own thinking; Ali's replies still qualify, +0)
 *   reports a blocker                  +3   a question +2   (timeline.classifyEmail, the same rule
 *                                                           the timeline colors with)
 *   finding / decision language        +1 each distinct term, max +4 ("root cause", "found",
 *                                           "decided", "trade-off", "recommend", ...)
 *   concrete evidence                  +1 each kind, max +3 (a story id, a PR or commit, a file path,
 *                                           a measured number)
 *   substance                          +1 at 80+ words, +2 at 200+
 *   still unanswered (from them)       +2
 *   last 3 days                        +1
 *   automated / system mail            -6   too short (< 15 words) -2
 * Quoted history ("On ... wrote:") is cut before scoring, so a one-line reply does not inherit the
 * thread it quotes. One message per subject per intern (the best one). The report-wide top 10 takes
 * at most MAX_PER_INTERN from any one intern, so one prolific writer cannot fill the list.
 */
import { ownText } from '../emailText';
import { classifyEmail } from '../timeline';
import type { Conversation } from '../types';

export const TOP_N = 10;
export const MAX_PER_INTERN = 3;
const DAY = 86400000;

export interface Communication {
  enrollment_id: string;
  intern: string;
  direction: 'from_intern' | 'from_ali';
  received_at: string;
  subject: string;
  excerpt: string;
  score: number;
  signals: string[];
  answered: boolean | null;
}

const FINDING = [
  ['root cause', /\broot cause\b/i], ['found', /\b(found|discovered|noticed|turns out|realized)\b/i],
  ['bug / failure', /\b(bug|broke|broken|fails?|failing|error|regression|crash)\b/i],
  ['decision', /\b(decided|decision|chose|instead of|trade-?off|option [a-c1-3])\b/i],
  ['recommendation', /\b(recommend|propose|suggest|should we|plan is)\b/i],
  ['risk', /\b(risk|security|leak|exposed|compliance|privacy)\b/i],
  ['learning', /\b(learned|lesson|insight|why it)\b/i],
] as const;
const EVIDENCE = [
  ['story id', /\b(STORY|[A-Z]{2,})-\d+\b/], ['PR / commit', /\b(PR\s*#?\d+|pull\/\d+|commit\s+[0-9a-f]{7,})\b/i],
  ['file path', /\b[\w-]+\/[\w./-]+\.(ts|js|py|sql|md|json|ya?ml|tsx|html|csv)\b/], ['measured number', /\b\d+(\.\d+)?\s?(%|ms|s|seconds|minutes|hours|days|rows|tests|errors|users)\b/i],
] as const;
const AUTOMATED_FROM = /(noreply|no-reply|notifications?@|info@colaberry|support@colaberry|mailer)/i;
const AUTOMATED_SUBJECT = /^(re:\s*)?(\[?(internship report|daily|weekly|reminder|notification|digest|alert)\b|ali, here's)/i;
// `ownText` moved to ../emailText so `timeline.classifyEmail` can clean the same way without
// importing this module, which would have been circular (this file imports classifyEmail).
// Re-exported because this is where its callers and its tests already look for it.
export { ownText };

/**
 * `content` = the message SAYS something (a blocker, a question, a finding, evidence, or 80+ words).
 * Only content-bearing messages can rank: without this a recent unanswered "Thanks!" scored 3 on
 * who sent it and when, none of which is insight.
 */
export function scoreMessage(m: { direction: Communication['direction']; from: string; subject: string; text: string; atMs: number; nowMs: number; answered: boolean | null }): { score: number; signals: string[]; content: boolean } {
  const signals: string[] = [];
  let score = 0;
  let content = false;
  const add = (n: number, why: string, isContent = false): void => { score += n; signals.push(why); if (isContent) content = true; };
  if (AUTOMATED_FROM.test(m.from) || AUTOMATED_SUBJECT.test(m.subject)) add(-6, 'automated');
  if (m.direction === 'from_intern') add(2, 'from the intern');
  const kind = classifyEmail(m.subject, m.text);
  if (kind === 'stuck') add(3, 'reports a blocker', true);
  else if (kind === 'question') add(2, 'asks a question', true);
  const all = `${m.subject} ${m.text}`;
  let f = 0;
  for (const [name, re] of FINDING) if (f < 4 && re.test(all)) { add(1, name, true); f += 1; }
  let e = 0;
  for (const [name, re] of EVIDENCE) if (e < 3 && re.test(all)) { add(1, name, true); e += 1; }
  const words = m.text ? m.text.split(' ').length : 0;
  if (words >= 200) add(2, `${words} words`, true);
  else if (words >= 80) add(1, `${words} words`, true);
  else if (words < 15) add(-2, 'very short');
  if (m.direction === 'from_intern' && m.answered === false) add(2, 'unanswered');
  if (m.nowMs - m.atMs <= 3 * DAY) add(1, 'last 3 days');
  return { score, signals, content };
}

const EXCERPT = 600;

/**
 * Cut an excerpt so it ends where a sentence ends, never in the middle of a word.
 *
 * ## Why this is not a cosmetic change
 *
 * `shapes.ts` refuses to reference an intern's own words, and the reason is written into a test
 * called "never quotes the excerpt": a 600-character hard slice ended Quincy's message at
 * `"the live expor"`. That was the correct call about a broken snippet, and it left the composer
 * with only a subject line and a date to write from. The measured consequence on 2026-11-11 was
 * that 13 of 13 messages opened with the identical sentence.
 *
 * So fix the snippet rather than overriding the objection. A sentence-complete excerpt can be
 * referenced safely; a mid-word one cannot, and should not be.
 *
 * Falls back to a word boundary with an ellipsis when there is no sentence end late enough to use
 * - better a clean "..." than a sentence fragment presented as a whole thought. The 40% floor
 * stops a single early period (an initial, "e.g.", a version number) from cutting a long message
 * down to one clause.
 */
export function trimToSentence(text: string, max: number = EXCERPT): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const end = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (end >= Math.floor(max * 0.4)) return window.slice(0, end + 1).trimEnd();
  const space = window.lastIndexOf(' ');
  return `${window.slice(0, space > 0 ? space : max - 3).trimEnd()}...`;
}

/**
 * True when an excerpt ends on a sentence, so a composer may reference it as a whole thought.
 *
 * A trailing ellipsis is explicitly NOT complete, even though it ends in a period. That is the
 * whole case this predicate exists to catch, and a naive `/[.?!]$/` passes it.
 */
export function isSentenceComplete(excerpt: string): boolean {
  const t = excerpt.trim();
  return /[.?!]$/.test(t) && !/\.\.\.$/.test(t);
}

const subjectKey = (s: string): string => s.replace(/^((re|fw|fwd):\s*)+/i, '').trim().toLowerCase();

/** Every scored message, per intern, best first. `interns` = (enrollment id, name, lower-case email). */
export function rankCommunications(rows: Conversation[], interns: Array<{ enrollmentId: string; name: string; email: string }>, nowMs: number): Map<string, Communication[]> {
  const out = new Map<string, Communication[]>();
  for (const it of interns) {
    const mine = rows
      .map((r) => {
        const from = String(r.from_address ?? '').toLowerCase();
        const direction: Communication['direction'] | null = from === it.email ? 'from_intern'
          : from.endsWith('@colaberry.com') && String(r.to_text ?? '').toLowerCase().includes(it.email) ? 'from_ali' : null;
        return direction ? { r, direction, from, atMs: Date.parse(String(r.received_at)) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x && Number.isFinite(x.atMs));
    const lastOurs = Math.max(-Infinity, ...mine.filter((x) => x.direction === 'from_ali').map((x) => x.atMs));
    const best = new Map<string, Communication>();
    for (const x of mine) {
      const subject = String(x.r.subject ?? '(no subject)');
      const text = ownText(x.r.body);
      const answered = x.direction === 'from_intern' ? lastOurs > x.atMs : null;
      const { score, signals, content } = scoreMessage({ direction: x.direction, from: x.from, subject, text, atMs: x.atMs, nowMs, answered });
      if (!content) continue;
      const c: Communication = {
        enrollment_id: it.enrollmentId, intern: it.name, direction: x.direction, received_at: new Date(x.atMs).toISOString(),
        subject, excerpt: trimToSentence(text, EXCERPT), score, signals, answered,
      };
      const key = `${x.direction}:${subjectKey(subject)}`;
      const prev = best.get(key);
      if (!prev || c.score > prev.score || (c.score === prev.score && c.received_at > prev.received_at)) best.set(key, c);
    }
    out.set(it.enrollmentId, [...best.values()].filter((c) => c.score > 0).sort(byRank));
  }
  return out;
}

/** Higher score first; ties broken by newest, then subject, so the order is total and stable. */
export function byRank(a: Communication, b: Communication): number {
  return b.score - a.score || b.received_at.localeCompare(a.received_at) || a.subject.localeCompare(b.subject) || a.enrollment_id.localeCompare(b.enrollment_id);
}

/** The report-wide top N, at most MAX_PER_INTERN from any one intern. */
export function topCommunications(perIntern: Map<string, Communication[]>, n = TOP_N): Communication[] {
  const taken = new Map<string, number>();
  const out: Communication[] = [];
  for (const c of [...perIntern.values()].flat().sort(byRank)) {
    if (out.length >= n) break;
    const k = taken.get(c.enrollment_id) ?? 0;
    if (k >= MAX_PER_INTERN) continue;
    taken.set(c.enrollment_id, k + 1);
    out.push(c);
  }
  return out;
}
