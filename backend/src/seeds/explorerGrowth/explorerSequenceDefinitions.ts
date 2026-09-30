import type { SequenceStep } from '../../models/FollowUpSequence';

/**
 * Explorer Growth OS — EPIC 6 T002. The eight sequences.
 *
 * DATA ONLY. The seed writes these; nothing here touches a database.
 *
 * THESE ARE PROMPTS, NOT COPY. `body_template` is empty on every step by design:
 * the engine generates the message at send time from `ai_instructions` plus lead
 * context (`FollowUpSequence.ts:20-23`). Only 12 of ~180 steps across the whole
 * production system carry a body template. Writing copy here would duplicate the
 * campaign engine, which the original brief forbade.
 *
 * EMAIL ONLY. No `sms_template`, no `voice_prompt`, no `fallback_channel`. Those
 * channels stay blocked pending compliance sign-off on opt-in wording, which is
 * still outstanding — and `EXPLORER_AUTO_DIAL_ENABLED` remains false regardless.
 *
 * WHAT `is_active: false` HAS TO DO WITH THIS FILE: nothing, and that is the
 * point. The flag is set at the WRITE SITE in `seedExplorerGrowthCampaigns.ts`,
 * not here, because a literal in a data module is not a persisted row — and
 * `sequenceService.createSequence()` would silently discard it (its param type
 * has no such field and it hardcodes `true`).
 */

/**
 * Appended to every step's instructions, verbatim.
 *
 * WHY IT IS A CONSTANT: the model writes the message, so this is the only place
 * the prohibition can live, and it has to be identical across all 24 steps for a
 * test to assert its presence. Copy-pasting it eight times would drift.
 *
 * WHAT THIS CANNOT DO — stated plainly so nobody mistakes it for a control: this
 * is an instruction to a generator, not a filter on its output. A model that
 * invents a price at render time satisfies this string completely. The real
 * control on generated copy is the send-time quality gate, which belongs to the
 * epic that wires execution. Claiming otherwise here would be a guard that
 * cannot fire, and this programme has shipped three of those already.
 */
export const NEVER_STATE_CLAUSE =
  'NEVER state or imply a cohort date, a price, a payment deadline, a seat count, ' +
  'an application deadline, or anything about what this person has consented to. ' +
  'You are not authoritative for any of those. If the learner asks about one, say ' +
  'a human will confirm it and offer to connect them.';

/** Shared shape for every step: email, one attempt, no body template. */
function step(delay_days: number, subject: string, goal: string, instructions: string): SequenceStep {
  return {
    delay_days,
    channel: 'email',
    subject,
    // Empty by design — the engine renders from ai_instructions at send time.
    body_template: '',
    max_attempts: 1,
    step_goal: goal,
    ai_tone: 'warm, direct, not salesy',
    ai_instructions: `${instructions} ${NEVER_STATE_CLAUSE}`,
  };
}

export interface ExplorerSequenceDefinition {
  name: string;
  description: string;
  steps: SequenceStep[];
}

/**
 * Cadence is deliberately short — two or three steps each.
 *
 * `validateSequenceSteps` allows up to 12 steps over 45 days with non-decreasing
 * delays and a 2-day minimum gap. Filling that budget on a first library would be
 * writing content nobody has reviewed for an audience nobody has emailed yet.
 * Adding steps later is cheap; un-sending is not.
 */
export const EXPLORER_SEQUENCES: ExplorerSequenceDefinition[] = [
  {
    name: 'Explorer Activation — Never Started',
    description: 'Signed up, never engaged. Points at the first step of the curriculum.',
    steps: [
      step(
        0,
        'Your first step is ready',
        'Get the learner to open one piece of content',
        'This person created a free account and has not opened anything yet. Point them at the ONE specific first-step lesson supplied in the context and nothing else. Do not list options; a menu is why people stall. Two or three sentences. Do not imply they have done something wrong or that time is running out.',
      ),
      step(
        4,
        'Still worth twenty minutes',
        'Second and final nudge before going quiet',
        'Same person, four days later, still nothing opened. Acknowledge that starting is the hard part, restate the single first step, and say plainly that this is the last nudge on it. Then stop. Do not add urgency, do not add a new offer.',
      ),
    ],
  },
  {
    name: 'Explorer Activation — Restart',
    description: 'Started and stopped. A return, not an introduction.',
    steps: [
      step(
        0,
        'Picking up where you left off',
        'Re-open the curriculum at the right place',
        'This person engaged before and then stopped. This is a RETURN, not a welcome — do not introduce the programme or explain what it is. Name the specific lesson supplied in the context as the place to resume. Assume competence and prior context.',
      ),
      step(
        5,
        'One thing to come back to',
        'Second and final re-entry attempt',
        'Same returning learner, still not back. One short paragraph, one link, no guilt and no summary of what they missed. If they do not return after this, they are not blocked by a lack of email.',
      ),
    ],
  },
  {
    name: 'Explorer Learning Momentum',
    description: 'Actively working through the curriculum. Points at the next lesson.',
    steps: [
      step(
        0,
        'Your next lesson',
        'Keep an engaged learner moving',
        'This person is actively working through the material. Name the next lesson supplied in the context and say in one sentence why it follows from where they are. Respect their momentum — this is a signpost, not a pep talk.',
      ),
    ],
  },
  {
    name: 'Explorer Community Digest',
    description:
      'Connected to the community. NOTE: the content behind this is a declared gap — community posts are cohort-private.',
    steps: [
      step(
        0,
        'What your cohort has been working on',
        'Draw an engaged learner back into the community',
        'This person participates in the community. Summarise ONLY the community content supplied in the context and nothing beyond it. If no content is supplied, do not invent activity, do not describe the community in general terms, and do not send — an empty digest that sounds full is worse than no digest.',
      ),
    ],
  },
  {
    name: 'Explorer Weekly Intelligence Digest',
    description: 'General nurture. By volume the one that matters most.',
    steps: [
      step(
        0,
        'This week in AI, for practitioners',
        'Stay useful to someone not currently in a lesson',
        'General nurture for a learner who is not mid-lesson. Lead with the content supplied in the context — usually two or three lessons — and say what each is FOR in one line. This should read as useful on its own even if they never click. No progress-shaming, no streak language, no "you have not logged in since".',
      ),
    ],
  },
  {
    name: 'Explorer Referral Invite',
    description: 'Earned the right to be asked. Content purpose is a declared gap.',
    steps: [
      step(
        0,
        'Someone you know',
        'Ask a satisfied learner for one introduction',
        'This person has got real value from the programme. Ask for ONE introduction, not a broadcast. Make it easy to decline in the same sentence you ask. Do not offer an incentive, and do not describe a referral programme — there is not one.',
      ),
    ],
  },
  {
    name: 'Explorer Accelerator Interest',
    description: 'Commercial intent. Content purpose is a declared gap; no learner currently reaches this state.',
    steps: [
      step(
        0,
        'The next step, when you want it',
        'Open a conversation, not a close',
        'This person is showing commercial intent. Offer a CONVERSATION with a human, not a purchase. You are not authoritative for anything about the paid programme — its price, its dates, its capacity, or its terms — so do not describe them even approximately. Your entire job is to offer the conversation.',
      ),
    ],
  },
  {
    name: 'Explorer Broken Journey Recovery',
    description: 'Blocked by something the platform did. Highest priority because it is our fault.',
    steps: [
      step(
        0,
        'That did not work — we are on it',
        'Acknowledge a platform failure and unblock',
        'Something on OUR side blocked this person: a failed upload, a broken link, an access problem. Acknowledge it plainly and take responsibility. Do not ask them to try again unless the context says it is fixed, and do not offer unrelated content — they were trying to do one thing. Shortest message in the entire library.',
      ),
    ],
  },
];

/** Every sequence name, for the seed's campaign→sequence linkage. */
export function definedSequenceNames(): string[] {
  return EXPLORER_SEQUENCES.map((s) => s.name);
}
