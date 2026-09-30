/**
 * interviewMethod - how the AI Flotation interview is conducted, whichever mouth asks.
 *
 * ## Why this is one module
 *
 * On 2026-09-17 Ali pasted a 2,300-character brief - the team, the hours, the workflow,
 * the pain, the outcome - and asked to be called. The agent opened with "could you walk
 * me through how your team handles that work today, step by step?". He said "I just gave
 * you this step by step information", it apologised, asked again, and he hung up after 37
 * seconds. The typed interviewer would never have done that: its first rule is that a
 * question you could have answered yourself is a failure. The voice script had its own
 * five-item list and none of those rules. Two interviews, one intake - the exact thing
 * the intake was rebuilt to prevent.
 *
 * So the method lives here, once. `buildInterviewPrompt` (typed) and
 * `buildFlotationCallPrompt` (voice) both compose it verbatim, and a test reads both
 * prompts and fails if either one drifts. The mouths differ only in what is specific to
 * them - a phone call must say it is an AI and must not promise prices; a chat returns
 * JSON - never in what they ask or how.
 */

import { UNDERSTANDING_DIMENSIONS, DIMENSION_LABELS } from './projectUnderstanding';

/** The most of a written brief that is carried into the call and the write-up. */
export const WRITTEN_BRIEF_MAX = 5000;

/**
 * What the interviewer is trying to understand and how it is allowed to ask. The heart
 * of both prompts. Word for word the same in each, on purpose.
 */
export function interviewMethodLines(): string[] {
  return [
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
  ];
}

/**
 * How to treat what the person wrote before the conversation started.
 *
 * Everything in it is already answered. The interviewer's job is to show it read the
 * brief, in one sentence, and then ask ONLY about what the brief leaves out - and if the
 * brief leaves nothing out that would change the build, to say so and stop.
 */
export function writtenBriefLines(written: string | null | undefined): string[] {
  const text = (written || '').trim().slice(0, WRITTEN_BRIEF_MAX);
  if (!text) {
    return ['They have not described anything yet, so your first job is to find out what the work is.'];
  }
  return [
    'THEY ALREADY WROTE THIS, before the conversation, in their own words:',
    `"${text}"`,
    '',
    'Every sentence of that is ALREADY ANSWERED. Do not ask them to walk you through it, repeat it, or "start from the beginning". Asking for anything it already says is the failure described above.',
    'Open with ONE sentence that shows you read it — name the specific thing they are building and the specific pain — then ask the one thing it does not cover that would change what gets built.',
    'If it already covers the workflow, who touches it, what hurts and what "better" looks like, you may have enough: confirm the one or two things you would otherwise have to guess, then stop.',
  ];
}

/**
 * The written brief and the spoken conversation as one transcript for the extractor,
 * so the write-up knows what they wrote as well as what they said. Without this the
 * extractor saw only the call: on 2026-09-17 a 37-second call produced a one-item
 * understanding of a project described in full, in writing, ten minutes earlier.
 */
export function conversationWithWrittenBrief(written: string | null | undefined, transcript: string): string {
  const text = (written || '').trim().slice(0, WRITTEN_BRIEF_MAX);
  const spoken = (transcript || '').trim();
  if (!text) return spoken;
  const head = `human (written before the call): ${text}`;
  return spoken ? `${head}\n${spoken}` : head;
}
