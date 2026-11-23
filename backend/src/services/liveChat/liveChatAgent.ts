/**
 * liveChatAgent.ts: the class assistant in the live chat (2026-11-23).
 *
 * Ali: "I'd like an agent to be able to answer questions they are confident in as the meeting is
 * going on. Also if it's unsure, it can ask me on the instructor portal, but give me multiple
 * choice answers to choose from so it's easy for me, and when I answer, the agent can give the
 * response."
 *
 * For each attendee message the model returns one JSON verdict:
 *   - not a question (a hello, a "done!"): nothing happens;
 *   - a question it is confident about: it answers in the chat as "Class assistant";
 *   - a question it is unsure about: an escalation with three short candidate answers goes to the
 *     presenter window; Ali picks one (or skips) and the assistant posts it.
 *
 * It runs AFTER the attendee's message is saved and never blocks it. Any failure (upstream error,
 * timeout, unparseable verdict) is logged and dropped: the message is still in the chat for the
 * instructor to see, so the worst case is "the assistant stayed quiet".
 *
 * Provider: OpenAI through runtimeAi.chatJson (production has no Anthropic key; Ali chose the
 * existing OpenAI key on 2026-11-23). Model LIVE_CHAT_MODEL, default gpt-4o.
 */
import { chatJson } from '../runtime/runtimeAi';
import { getBroadcast } from '../sessionLiveStateService';
import { insertEscalation, insertMessage, type ChatMessage } from './liveChatStore';

export const ASSISTANT_NAME = 'Class assistant';
const MODEL = process.env.LIVE_CHAT_MODEL || 'gpt-4o';
const TIMEOUT_MS = 30_000;

export interface Verdict {
  kind: 'question' | 'other';
  confident: boolean;
  answer: string;
  options: string[];
}

/** Coerce the model's JSON into a safe verdict, or null when it cannot be trusted. */
export function sanitizeVerdict(raw: unknown): Verdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === 'question' ? 'question' : r.kind === 'other' ? 'other' : null;
  if (!kind) return null;
  if (kind === 'other') return { kind, confident: false, answer: '', options: [] };
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+\n/g, '\n').trim().slice(0, n) : '');
  const answer = clip(r.answer, 800);
  const options = Array.isArray(r.options) ? r.options.map((o) => clip(o, 300)).filter(Boolean).slice(0, 3) : [];
  const confident = r.confident === true && !!answer;
  // An unsure question with no usable options still goes to the instructor (question + Skip only):
  // dropping it would mean nobody ever sees it (2026-11-23).
  return { kind, confident, answer, options: confident ? options : options.length >= 2 ? options : [] };
}

function systemPrompt(slideTitle: string, slideNote: string): string {
  return [
    'You are the class assistant in a live, beginner-friendly online class called "Your Know-How Is Now a Product".',
    'The class teaches people with no technical background to turn a task they repeat at work into a Claude skill:',
    'a short recipe card for the AI with a name, WHEN to use it, steps, the result, and what it must never do.',
    'Attendees follow along on a class page and run short prompts. The instructor is Ali.',
    `The slide on screen right now: "${slideTitle}". ${slideNote}`,
    'Read ONE chat message from an attendee and reply with STRICT json only:',
    '{"kind":"question"|"other","confident":true|false,"answer":"...","options":["...","...","..."]}',
    'kind is "other" for greetings, thanks, reactions, or anything that is not a question; leave the rest empty.',
    'For a question: set confident true ONLY when you are sure and the answer does not depend on Colaberry',
    'policy, prices, schedules, enrollment, refunds, certificates, or anything about this specific class you were',
    'not told. Then write answer: 1 to 3 short, friendly sentences in plain words, no jargon.',
    'When you are not sure, set confident false and write options: three DIFFERENT, CONCRETE answers that Ali,',
    'who does know the facts, might give, so he only has to tap the true one. Each option takes a clear position',
    'and is ready to post as is, for example "Yes, the recording is on the class page within 24 hours.", "Yes, we',
    'email the recording to everyone tomorrow.", "Not this time. Come live next Monday at 6:30 PM Central."',
    'Never write an option that says you are unsure, do not know, or that they should ask Ali: Ali is the one choosing.',
  ].join(' ');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('live chat agent timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Decide what to do with one attendee message. Never throws. */
export async function handleAttendeeMessage(sessionId: string, msg: ChatMessage): Promise<'answered' | 'escalated' | 'ignored' | 'failed'> {
  const started = Date.now();
  try {
    const bc = await getBroadcast(sessionId).catch(() => null);
    const note = bc?.follow ? `${bc.follow.heading}. ${bc.follow.body || ''}` : '';
    const r = await withTimeout(chatJson('live_class_chat', systemPrompt(bc?.title || 'the class', note), msg.content, MODEL, 600), TIMEOUT_MS);
    const v = sanitizeVerdict(r.parsed);
    let outcome: 'answered' | 'escalated' | 'ignored' | 'failed' = 'failed';
    if (v && v.kind === 'other') outcome = 'ignored';
    else if (v && v.confident) {
      await insertMessage(sessionId, 'assistant', ASSISTANT_NAME, `@${msg.display_name} ${v.answer}`, { replyTo: msg.id });
      outcome = 'answered';
    } else if (v) {
      await insertEscalation(sessionId, msg.id, msg.content, v.options);
      outcome = 'escalated';
    }
    console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'live_chat_agent', outcome,
      duration_ms: Date.now() - started, context: { session_id: sessionId, cost_usd: r.cost_usd } }));
    return outcome;
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'live_chat_agent', outcome: 'failure',
      duration_ms: Date.now() - started, error_class: (err as Error)?.name || 'UpstreamError',
      context: { session_id: sessionId, message: (err as Error)?.message } }));
    return 'failed';
  }
}
