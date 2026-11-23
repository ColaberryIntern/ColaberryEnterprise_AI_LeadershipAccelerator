/**
 * liveGuestRun.ts: "Run it here" for the class follow-along page (2026-11-23).
 *
 * Ali, during prep for Nov 2026 Session 3: on a phone, "Open in Claude" leaves the class page and
 * the attendee has to find their way back. "These prompts have to be run on the same screen. Fix
 * that." So the follow-along page can send the slide's prompt (and follow-up replies, for the
 * five-question interview) here, and the answer appears under the prompt.
 *
 * Provider: production has no Anthropic key, and Ali chose (2026-11-23) to use the OpenAI key
 * already in production, through the repo's instrumented helper (runtimeAi.chatText). The model
 * is LIVE_RUN_MODEL, default gpt-4o.
 *
 * Who may call it: only a checked-in attendee of THIS class (a valid guest pass for the session
 * and a guest row that still exists). The route also has an IP rate limit.
 *
 * Failure modes handled (Failure-First):
 *  - bad pass or expired check-in: 401 "Please join again" (the page offers check-in again);
 *  - malformed conversation (wrong roles, empty, too long): 400, nothing is sent upstream;
 *  - too many runs from one attendee in this class: 429 with a copy-paste fallback message;
 *  - upstream slow: 504 after RUN_TIMEOUT_MS; upstream error or empty answer: 502. Neither is
 *    retried here: the attendee presses Run again, which is the retry, and costs one more call.
 * Not handled: per-run cost caps beyond the per-attendee count (the counter is per process and
 * resets on restart, which is acceptable for a one-hour class).
 */
import { GuestError, verifyGuestPass } from './sessionGuestService';
import { findGuest } from './sessionGuestStore';
import { chatText, type ChatMessage } from './runtime/runtimeAi';

export const RUN_LIMITS = { turns: 12, chars: 4000, totalChars: 16000, perGuest: 40 } as const;
export const RUN_TIMEOUT_MS = 45_000;
const RUN_MODEL = process.env.LIVE_RUN_MODEL || 'gpt-4o';

const SYSTEM = [
  'You are the AI assistant in a live, beginner-friendly class. Each message is a prompt an attendee',
  'copied from the class slide, or their reply to you. Do exactly what the prompt asks, the way a',
  'helpful assistant would. Use plain words. When asked for a table, use a markdown table. When the',
  'prompt says to ask questions one at a time, ask only the next question and wait. Keep answers',
  'short enough to read on a phone. Use made-up data only; never ask for real company data.',
].join(' ');

/** Runs used per attendee per class, in this process. */
const used = new Map<string, number>();

/** For tests only. */
export function resetRunCounters(): void { used.clear(); }

/**
 * Validate an untrusted conversation. Returns null when it is not acceptable as a whole: roles
 * must alternate starting and ending with the user, every turn must be non-empty text, and the
 * turn and character caps must hold. Nothing is trimmed into shape: a conversation that breaks a
 * cap is refused rather than silently cut, so the attendee never gets an answer to half a prompt.
 */
export function sanitizeRunMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > RUN_LIMITS.turns) return null;
  let total = 0;
  const out: ChatMessage[] = [];
  for (let k = 0; k < raw.length; k++) {
    const m = raw[k] as { role?: unknown; content?: unknown };
    const role = k % 2 === 0 ? 'user' : 'assistant';
    if (!m || m.role !== role || typeof m.content !== 'string') return null;
    const content = m.content.trim();
    if (!content || content.length > RUN_LIMITS.chars) return null;
    total += content.length;
    out.push({ role, content });
  }
  if (total > RUN_LIMITS.totalChars || out[out.length - 1].role !== 'user') return null;
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new GuestError(504, 'The answer is taking too long. Press Run again.')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Run one turn of a checked-in attendee's conversation and return the answer text. */
export async function runAsGuest(sessionId: string, pass: string | undefined, rawMessages: unknown): Promise<{ reply: string }> {
  const gid = verifyGuestPass(pass, sessionId);
  const guest = gid ? await findGuest(sessionId, gid) : null;
  if (!guest) throw new GuestError(401, 'Please join again');

  const messages = sanitizeRunMessages(rawMessages);
  if (!messages) throw new GuestError(400, 'That prompt is too long or not in the right shape. Copy it into Claude instead.');

  const key = `${sessionId}:${guest.id}`;
  const n = used.get(key) || 0;
  if (n >= RUN_LIMITS.perGuest) {
    throw new GuestError(429, 'You have used all the runs for this class. Copy the prompt into Claude to keep going.');
  }
  used.set(key, n + 1);

  const started = Date.now();
  try {
    const r = await withTimeout(chatText('live_class_run', SYSTEM, messages, RUN_MODEL, 1200), RUN_TIMEOUT_MS);
    if (!r.text) throw new GuestError(502, 'No answer came back. Press Run again.');
    console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'live_guest_run', outcome: 'success',
      duration_ms: Date.now() - started, context: { session_id: sessionId, turns: messages.length, cost_usd: r.cost_usd } }));
    return { reply: r.text };
  } catch (err) {
    const isGuest = err instanceof GuestError;
    console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'live_guest_run', outcome: 'failure',
      duration_ms: Date.now() - started, error_class: isGuest ? 'TimeoutOrEmpty' : (err as Error)?.name || 'UpstreamError',
      context: { session_id: sessionId } }));
    if (isGuest) throw err;
    throw new GuestError(502, 'The assistant could not answer right now. Press Run again.');
  }
}
