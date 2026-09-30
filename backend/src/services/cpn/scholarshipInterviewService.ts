/**
 * scholarshipInterviewService — the OpportunityLift interview, in the browser,
 * right after the scholarship interest form.
 *
 * Ali asked for AI Flotation's model applied to scholarship applicants: "we
 * interview them on what they want to build". This is the written path;
 * `callbackRequestService` already provides the voice one, and the decision was
 * that voice must be an EQUAL path with the form always offered, never the
 * fallback for people who could not manage a phone call.
 *
 * It is modelled on `delivery/flotationInterviewService.ts` and keeps that file's
 * two load-bearing properties: one question at a time, and a hard cap enforced in
 * code rather than requested in the prompt.
 *
 * ## WHY THIS IS NOT THE FLOTATION PROMPT WITH THE NOUNS SWAPPED
 *
 * Flotation interviews a business about a workflow. This interviews a person who
 * is asking for money, which changes what is safe to ask and what the asking
 * feels like from the other side.
 *
 * Three rules follow from that, and all three are in the prompt rather than in a
 * comment somewhere hoping to be honoured:
 *
 *   1. NEVER ask about money, debt, hardship, benefits, immigration status,
 *      health, or who someone lives with. The public privacy page promises never
 *      to publish those. The honest version of that promise is not to collect
 *      them. If somebody volunteers one anyway it stays in their own words in the
 *      transcript and is never lifted into the summary.
 *
 *   2. NEVER make somebody argue for their own worth. "Why do you deserve this"
 *      is the question this whole programme exists not to ask. The design stance
 *      is dignity and access, not charity, and an interview that reads as an
 *      audition contradicts every page around it.
 *
 *   3. NEVER imply a decision. Eligibility rules and the selection process do not
 *      exist yet - the site says so plainly on /scholarships/ - so the interview
 *      cannot hint that answering well helps. It says a person will read it,
 *      because that is the only thing that is true.
 *
 * ## The 25 hours is the one hard question, and it is asked as a fact
 *
 * The commitment is the honest crux of the whole programme, and the kindest thing
 * is to surface it early: someone whose week genuinely cannot hold it is better
 * served knowing now. So the interview asks what their week actually looks like -
 * a question about hours, not about willingness. "Are you committed?" invites
 * everyone to say yes and tells us nothing.
 */

import { chatJson } from '../runtime/runtimeAi';

export interface InterviewTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface InterviewFacts {
  name?: string | null;
  cityState?: string | null;
}

/**
 * The most exchanges an interview may run.
 *
 * Shorter than Flotation's twelve. That is a discovery call with a business;
 * this is somebody telling us what they want to do with their life, and eight
 * exchanges is about four minutes. Past that it stops being a conversation and
 * starts being a screening, which is the thing rule 2 above forbids.
 */
export const MAX_EXCHANGES = 8;

export type InterviewResult =
  | { ok: true; done: boolean; message: string; exchanges: number; runtime_ms: number; cost_usd: number }
  | { ok: false; error_class: 'EmptyInput' | 'EmptyModelResponse'; error: string };

const OPENING_HINT =
  'This is their first message. Reflect back what they said in their own words, then ask ONE thing that opens it up.';

const CLOSING_LINE =
  'Thank you — that is genuinely useful, and a person here will read it. You do not need to do anything else right now.';

/** The topics worth understanding. Not a checklist to walk; a picture to form. */
const WHAT_TO_UNDERSTAND = [
  'What they want to be able to build or do. Concrete beats aspirational: "an app that tracks my mum\'s medication" tells you more than "get into tech".',
  'Where they are starting from, including whether they have begun the free training yet.',
  'Why now. What changed, or what they are trying to get away from or toward.',
  'What their week actually looks like, in hours — the scholarship needs about 25 a week for a year.',
  'What would be different for them a year from now if this worked.',
];

export function buildInterviewPrompt(facts: InterviewFacts, exchanges: number): string {
  const who = [
    facts.name ? `Their name is ${facts.name}.` : null,
    facts.cityState ? `They are in ${facts.cityState}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const remaining = MAX_EXCHANGES - exchanges;

  return [
    'You are talking with someone who has just told OpportunityLift they are interested in a scholarship that would pay for a year of AI career training. You are warm, curious and brief. You are having a conversation, not filling in a form and not conducting an assessment.',
    who,
    '',
    'WHAT YOU ARE TRYING TO UNDERSTAND, over the whole conversation:',
    ...WHAT_TO_UNDERSTAND.map((d) => `  - ${d}`),
    '',
    'NEVER ASK ABOUT — this is not a style preference, these are off limits:',
    '- Money, income, debt, savings, benefits, or whether they can afford anything.',
    '- Hardship, hard circumstances, or anything framed as what they have overcome.',
    '- Immigration or citizenship status.',
    '- Health, disability, or care responsibilities.',
    '- Who they live with, or their family situation.',
    'If they volunteer any of it, acknowledge it briefly and warmly, do not follow up on it, and move the conversation back to what they want to build.',
    '',
    'NEVER ASK THEM TO JUSTIFY THEMSELVES. No "why do you deserve this", no "what makes you a good candidate", nothing that asks them to argue for their own worth. That question is the reason this programme exists, and asking it would undo the whole thing.',
    '',
    'NEVER IMPLY A DECISION. You are not assessing, scoring, screening or shortlisting, and applications are not even open yet. Do not say anything that suggests a good answer helps them or a poor one hurts. If they ask how they are doing, tell them plainly that this is not a test, that a person will read it, and that nothing here decides anything.',
    '',
    'HOW TO ASK:',
    '- ONE question at a time. Never stack two.',
    '- Do NOT ask what you can reasonably infer from what they already said. Infer it, say what you assumed in passing, and let them correct you.',
    '- Follow what they care about. If they keep returning to one thing, go there rather than completing your list.',
    '- Short messages. Two or three sentences. No preamble, no "great question", no long summarising back.',
    '- Plain language, read-aloud simple. Never say "leverage", "upskill", "journey", "passion" or "opportunity".',
    '- Ask about the 25 hours as a question about their week, not their commitment. "What does a normal week look like for you?" not "can you commit?". Everyone says yes to the second one.',
    '',
    'A QUESTION YOU COULD HAVE ANSWERED YOURSELF IS A FAILURE, and walking the list above one item at a time is the worst thing you can do here. That is the form this replaces.',
    '',
    'WHEN TO STOP:',
    'Stop when you understand what they want to build, roughly where they are starting, and what their week holds. You do not need every topic.',
    remaining <= 2
      ? `You have at most ${remaining} exchanges left. Prioritise what is missing and be ready to close.`
      : '',
    '',
    'RETURN STRICT JSON: { "message": "<what you say next>", "done": <true when you have enough> }',
    'When done is true, thank them briefly and say a person here will read it. DO NOT promise an email — this site cannot send one.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function transcriptFor(turns: InterviewTurn[]): string {
  return turns.map((t) => `${t.role === 'user' ? 'applicant' : 'interviewer'}: ${t.text}`).join('\n');
}

/**
 * Produce the interviewer's next message.
 *
 * Returns `done` when the model has enough OR the cap is reached — the cap wins,
 * because a model deciding for itself when to stop asking a scholarship applicant
 * questions is exactly the failure this file's header describes.
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

  // Enforced HERE, not requested in the prompt, so a model that wants to keep
  // going cannot.
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

  const { parsed, runtime_ms, cost_usd } = await chatJson(
    'cpn-scholarship-interview',
    system,
    user,
    undefined,
    700
  );

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

/** The conversation as it was said. Used for the stored transcript. */
export function interviewTranscript(turns: InterviewTurn[]): string {
  return transcriptFor(turns);
}

/**
 * A short written brief for the reviewer.
 *
 * Prose, and deliberately not fields. A reviewer reading six sentences forms a
 * picture of a person; a reviewer reading six scored attributes starts ranking
 * people against criteria nobody has agreed yet. There is no score here and there
 * is not going to be one until the board writes the selection process.
 *
 * Returns null rather than throwing: a summary that fails to generate must never
 * cost somebody their interview, and the transcript is the record that matters.
 */
export async function summariseForReviewer(params: {
  transcript: string;
  facts?: InterviewFacts;
}): Promise<string | null> {
  const transcript = (params.transcript || '').trim();
  if (!transcript) return null;

  const system = [
    'You are writing a short brief so that a person at a scholarship programme can read one page and understand who they are about to talk to.',
    '',
    'WRITE:',
    '- Four to six sentences of plain prose. No headings, no bullets, no bold.',
    '- What they want to build or do, in their own words where you can.',
    '- Where they are starting from, and what their week looks like in hours.',
    '- Anything they said that a reviewer would want to follow up on.',
    '',
    'DO NOT:',
    '- Score, rank, rate or grade them in any way, including in words like "strong candidate" or "promising".',
    '- Recommend or advise against anything. You are not part of the decision and there is no decision to be part of yet.',
    '- Repeat anything they said about money, hardship, immigration status, health or their household, even if they volunteered it. Leave it in the transcript where they said it.',
    '- Invent, infer or round anything. If they did not say how many hours, say that they did not.',
    '',
    'RETURN STRICT JSON: { "summary": "<the brief>" }',
  ].join('\n');

  try {
    const { parsed } = await chatJson(
      'cpn-scholarship-interview-summary',
      system,
      `TRANSCRIPT:\n${transcript}`,
      undefined,
      600
    );
    const summary = typeof (parsed as any)?.summary === 'string' ? (parsed as any).summary.trim() : '';
    return summary || null;
  } catch {
    // Swallowed on purpose. The transcript is already saved; a missing summary is
    // a reviewer reading the raw conversation, which is worse but not lost.
    return null;
  }
}
