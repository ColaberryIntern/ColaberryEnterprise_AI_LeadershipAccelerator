/**
 * mentorMemoryFormat — the PURE half of the runtime mentor's conversation memory.
 * No I/O, so it is unit-testable in isolation.
 *
 * Why: the runtime mentor persists every exchange to MentorTurn but never read
 * them back — it trusted the browser-supplied `history`, so a page reload or a
 * return visit next week started the conversation cold. This module turns stored
 * turns into a model-ready window: the most recent exchanges verbatim, plus a
 * compact rolling summary of everything older so continuity survives without
 * blowing the token budget.
 */

export interface TurnLike { question: string | null; reply: string | null; mode?: string | null; }
export interface Msg { role: 'user' | 'assistant'; content: string; }

const clip = (s: string, n = 160) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** A "complete" turn is one that actually produced a reply (a mid-failed write
 *  leaves a question with no reply; skip it so history stays cleanly alternating). */
function complete(turns: TurnLike[]): TurnLike[] {
  return (turns || []).filter((t) => t && typeof t.reply === 'string' && t.reply.trim().length > 0);
}

/** PURE — expand stored turns (chronological) into alternating user/assistant messages. */
export function turnsToMessages(turns: TurnLike[]): Msg[] {
  const out: Msg[] = [];
  for (const t of complete(turns)) {
    const user = (t.question && t.question.trim()) ? t.question.trim() : `(${t.mode || 'help'} requested)`;
    out.push({ role: 'user', content: user });
    out.push({ role: 'assistant', content: (t.reply as string).trim() });
  }
  return out;
}

/** PURE — a compact, budget-capped summary of the OLDER exchanges (the ones that
 *  fall out of the verbatim window), so the coach keeps the gist. */
export function summarizeTurns(older: TurnLike[], budget = 600): string {
  const done = complete(older);
  if (!done.length) return '';
  const topics = done
    .map((t) => (t.question && t.question.trim()) ? clip(t.question, 60) : `(${t.mode || 'help'})`)
    .filter(Boolean);
  const n = done.length;
  const body = `the student worked through ${n} earlier exchange${n === 1 ? '' : 's'} on: ${topics.join('; ')}`;
  return clip(body, budget);
}

/**
 * PURE — build the conversation window from stored turns (chronological):
 * the last `recentTurns` exchanges verbatim, plus a rolling summary of the rest.
 */
export function buildConversationWindow(
  turns: TurnLike[],
  recentTurns = 6,
  summaryBudget = 600,
): { summary: string; recent: Msg[] } {
  const done = complete(turns);
  const recent = done.slice(-recentTurns);
  const older = done.slice(0, Math.max(0, done.length - recentTurns));
  return { summary: summarizeTurns(older, summaryBudget), recent: turnsToMessages(recent) };
}
