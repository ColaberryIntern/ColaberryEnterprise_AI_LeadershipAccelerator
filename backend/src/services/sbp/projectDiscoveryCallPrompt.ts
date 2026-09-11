import { ANGLE_TO_DIMENSION } from './intakeTruth';
import type { UnderstandingItem } from '../delivery/projectUnderstanding';

/**
 * projectDiscoveryCallPrompt — what the voice agent is told, per call. PURE.
 *
 * ## Built fresh, never saved in a vendor dashboard
 *
 * The brief is explicit: implement a dedicated project-discovery prompt, and do
 * not silently reuse a saved lead-capture prompt that can drift from
 * application truth. A prompt stored in Synthflow is a second copy of the
 * interview that nothing in this repository tests, and the first time the angle
 * list changes the two disagree with no error anywhere.
 *
 * So the agent slot holds a shell and this builds the call.
 *
 * ## The call OPENS with what they already said
 *
 * Phase 3 is continue-only by decision: the phone is offered once a description
 * exists. That is what makes a voice interview bearable. Cold, the agent has
 * nothing and must work all ten angles, which is the long interrogation the
 * whole description-first change exists to avoid. Warm, it opens with "you told
 * us X, I have three things to ask".
 *
 * ## What it must not do
 *
 * No passwords, no API keys, no payment details, no sensitive data the build
 * does not need. A voice call is recorded and transcribed, so anything asked
 * for is anything stored.
 */

export interface CallPromptInput {
  /** What the student called the project, when they named it. */
  readonly projectName?: string | null;
  /** Truth already gathered, from the description and any chat answers. */
  readonly known: readonly UnderstandingItem[];
  /** Angle names still unanswered, in priority order. */
  readonly remainingAngles: readonly string[];
}

/** Hard ceiling on the call. An interview that never ends is a bad one. */
export const MAX_CALL_ANGLES = 5;

const KNOWN_LINE_MAX = 180;
const trim = (s: string): string => (s.length <= KNOWN_LINE_MAX ? s : `${s.slice(0, KNOWN_LINE_MAX - 3)}...`);

/**
 * How to ASK each angle out loud.
 *
 * Different wording from the web, same fact key. The brief allows exactly this:
 * web and phone wording may differ for usability, but each maps to the same
 * fact. Spoken questions are shorter, carry no bullet lists, and never say the
 * angle's own name.
 */
export const SPOKEN_ANGLE: Readonly<Record<string, string>> = {
  'THE GUARDRAIL': 'what they would want to check themselves before this went out or got saved',
  'THE TOOLS': 'which apps or spreadsheets this has to work with, and let them list them',
  'WHEN IT IS NOT SURE': 'what they do when they are not sure about one of these themselves',
  'THE MEASURE': 'how long this takes them today, or how often it goes wrong',
  'EARNING AUTONOMY': 'what they would need to see before letting it run on its own',
  'THE JUDGEMENT': 'the call they are handing over, and what they look at when they make it',
  'THE OPERATOR': 'who is actually going to use this, and how comfortable they are with tools',
  'TRIGGER AND RHYTHM': 'what makes this start, and how many in a normal week',
  'THE STANDOUT AND THE CUT': 'what would make someone say they did not know it could do that',
  'THE JOB': 'in one sentence, what this exists to produce and for whom',
};

/** The angles this call will actually cover, capped and in priority order. */
export function callAngles(remaining: readonly string[]): string[] {
  return remaining
    .filter((a) => a in SPOKEN_ANGLE && a in ANGLE_TO_DIMENSION)
    .slice(0, MAX_CALL_ANGLES);
}

/** One line per thing we already know, so the agent can say it back. */
function knownLines(known: readonly UnderstandingItem[]): string[] {
  return known
    .filter((i) => typeof i.value === 'string' && i.value.trim().length > 0)
    .slice(0, 12)
    .map((i) => `- ${i.dimension}: ${trim(i.value.trim())}`);
}

export function buildProjectDiscoveryCallPrompt(input: CallPromptInput): string {
  const angles = callAngles(input.remainingAngles);
  const known = knownLines(input.known);
  const name = (input.projectName ?? '').trim();

  return [
    'You are calling a student about a system they are building, to finish an interview',
    'they started online. You are not selling anything and this is not a sales call.',
    '',
    name ? `They are calling it: ${name}` : 'They have not named it yet.',
    '',
    known.length
      ? 'WHAT THEY HAVE ALREADY TOLD US. Open by summarising this back in one sentence so they\n'
        + 'know you have read it. Never ask about anything in this list.\n'
        + known.join('\n')
      : 'They have given only a short description, so keep the call short and let them talk.',
    '',
    angles.length
      ? `ASK ONLY THESE ${angles.length}, in this order:\n`
        + angles.map((a, i) => `${i + 1}. Ask ${SPOKEN_ANGLE[a]}.`).join('\n')
      : 'There is nothing left to ask. Confirm what is above, thank them, and end the call.',
    '',
    'HOW TO ASK. One question at a time. Their words, their work, no system-design',
    'vocabulary. If they answer something you were going to ask later, do not ask it again.',
    'A follow-up is fine when an answer is vague. "I do not know" is a complete answer and',
    'you move on rather than pressing.',
    '',
    'NEVER ask for a password, an API key, a payment detail, or any personal data the build',
    'does not need. This call is recorded and transcribed, so anything you ask for is stored.',
    '',
    'Close by telling them they can review and correct everything on the web.',
  ].filter(Boolean).join('\n');
}
