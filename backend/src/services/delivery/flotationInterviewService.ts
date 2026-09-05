/**
 * flotationInterviewService — the AI interview, in the browser, right after the form.
 *
 * §14's first door is "Chat with Project AI: conversational discovery". The call door was
 * built first because it was harder; this is the one most people will actually use, because
 * it starts the moment they finish typing instead of requiring them to pick up a phone.
 *
 * It feeds the SAME pipeline: the transcript extracts to a `ProjectUnderstanding` with
 * `source: 'chat'`, which projects to the same blueprint and renders on the same wow screen.
 * Nothing downstream knows or cares which door someone walked through, which is exactly
 * what the one-contract design was for.
 *
 * ## §2 is the hard part, not the conversation
 *
 * The Minimum Human Effort Protocol is explicit:
 *
 *     Can we safely infer it?      -> infer + disclose
 *     Can we recommend a default?  -> recommend + one-click accept
 *     Do we need this decision now? -> no: defer and continue
 *     Otherwise                     -> ask
 *
 * and then: "Do not convert traditional discovery forms into conversational
 * questionnaires. Every question must have a reason."
 *
 * That is the whole risk here. The lazy version of this feature walks the twenty dimensions
 * and asks twenty questions, which is a worse experience than the form it replaced - slower,
 * and it feels like an interrogation rather than a conversation. So the prompt is built
 * around what can be INFERRED from what they have already said, and the model is told
 * plainly that a question it could have answered itself is a failure.
 *
 * ## Bounded, because an interview that never ends is a bad one
 *
 * Hard cap on exchanges. A person who has told us enough should be released, and one who
 * keeps talking should not be billed for indefinitely. The cap is also the honest answer to
 * "what if the model never decides it has enough" - it does not get to decide alone.
 */

import { chatJson } from '../runtime/runtimeAi';
import { UNDERSTANDING_DIMENSIONS, DIMENSION_LABELS } from './projectUnderstanding';

export interface InterviewTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface InterviewFacts {
  name?: string | null;
  company?: string | null;
  role?: string | null;
}

/**
 * The most exchanges an interview may run.
 *
 * Twelve is roughly a five-minute conversation. Past that, someone either has nothing more
 * to say or is being interrogated, and both are reasons to stop.
 */
export const MAX_EXCHANGES = 12;

export type InterviewResult =
  | { ok: true; done: boolean; message: string; exchanges: number; runtime_ms: number; cost_usd: number }
  | { ok: false; error_class: 'EmptyInput' | 'EmptyModelResponse'; error: string };

const OPENING_HINT =
  'Open by reflecting back what they already told you, in their words, then ask ONE thing that moves the picture forward.';

const CLOSING_LINE =
  'Thanks — that gives me enough to write this up. Your summary is appearing on this page now.';

export function buildInterviewPrompt(facts: InterviewFacts, exchanges: number): string {
  const who = [
    facts.name ? `Their name is ${facts.name}.` : null,
    facts.company ? `They work at ${facts.company}.` : null,
    facts.role ? `Their role is ${facts.role}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const remaining = MAX_EXCHANGES - exchanges;

  return [
    'You are interviewing someone about a business problem they want software to solve. You are curious and brief, and you are talking, not filling in a form.',
    who,
    '',
    'WHAT YOU ARE TRYING TO UNDERSTAND, over the whole conversation:',
    ...UNDERSTANDING_DIMENSIONS.slice(0, 12).map((d) => `  ${DIMENSION_LABELS[d]}`),
    '',
    'HOW TO ASK — this matters more than coverage:',
    '- ONE question at a time. Never stack two questions in a message.',
    '- Do NOT ask what you can reasonably infer from what they have already said. Infer it, and say what you assumed in passing so they can correct you.',
    '- Do NOT ask about anything that does not change what gets built. If the answer would not change the work, skip it.',
    '- Follow what they seem to care about. If they keep returning to one pain, go deeper there rather than completing your list.',
    '- Short messages. Two or three sentences. No preamble, no "great question", no summarising back at length.',
    '- Plain language. Never say "requirements", "stakeholders", "leverage" or "solution".',
    '',
    'A QUESTION YOU COULD HAVE ANSWERED YOURSELF IS A FAILURE. Walking the list above one item at a time is the single worst thing you can do here — that is the form this is replacing.',
    '',
    'WHEN TO STOP:',
    'Stop when you understand the workflow, who touches it, what hurts, and what "better" looks like. You do not need every topic above.',
    remaining <= 3
      ? `You have at most ${remaining} exchanges left. Prioritise what is still missing and be ready to close.`
      : '',
    '',
    'RETURN STRICT JSON: { "message": "<what you say next>", "done": <true when you have enough> }',
    'When done is true, your message should thank them briefly and say their summary is being written. Do not promise an email.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function transcriptFor(turns: InterviewTurn[]): string {
  return turns.map((t) => `${t.role === 'user' ? 'human' : 'assistant'}: ${t.text}`).join('\n');
}

/**
 * Produce the interviewer's next message.
 *
 * Returns `done` when the model has enough OR the cap is reached - the cap wins, because a
 * model deciding for itself when to stop asking is exactly the failure mode §2 describes.
 */
export async function nextInterviewMessage(params: {
  turns: InterviewTurn[];
  facts?: InterviewFacts;
}): Promise<InterviewResult> {
  const turns = (params.turns || []).filter((t) => t && typeof t.text === 'string' && t.text.trim());
  if (turns.length === 0) {
    return { ok: false, error_class: 'EmptyInput', error: 'nothing has been said yet' };
  }

  const exchanges = turns.filter((t) => t.role === 'user').length;

  // The cap is enforced HERE, not requested in the prompt, so a model that wants to keep
  // going cannot. An interview that never ends is a bad interview and an unbounded bill.
  if (exchanges >= MAX_EXCHANGES) {
    return { ok: true, done: true, message: CLOSING_LINE, exchanges, runtime_ms: 0, cost_usd: 0 };
  }

  const system = buildInterviewPrompt(params.facts || {}, exchanges);
  const user = [
    turns.length === 1 ? OPENING_HINT : '',
    'THE CONVERSATION SO FAR:',
    transcriptFor(turns),
  ]
    .filter(Boolean)
    .join('\n');

  const { parsed, runtime_ms, cost_usd } = await chatJson('flotation-interview', system, user, undefined, 700);

  const message = typeof (parsed as any)?.message === 'string' ? (parsed as any).message.trim() : '';
  if (!message) {
    return { ok: false, error_class: 'EmptyModelResponse', error: 'model returned no message' };
  }

  return {
    ok: true,
    done: Boolean((parsed as any)?.done),
    message,
    exchanges,
    runtime_ms,
    cost_usd,
  };
}

/** The transcript in the shape the extractor expects for `source: 'chat'`. */
export function interviewTranscript(turns: InterviewTurn[]): string {
  return transcriptFor(turns);
}
