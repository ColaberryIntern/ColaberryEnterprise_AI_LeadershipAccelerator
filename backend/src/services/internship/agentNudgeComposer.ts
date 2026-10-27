/**
 * agentNudgeComposer - what to say to one agent builder today, and whether to say anything.
 *
 * Ali, 23 Oct: "I would like to create a nudge system, but one that is actually looking at what
 * they are doing and helping them with the next step to move forward... I want to send out a
 * message M-F but they need to be different each time. We can send them out if they aren't
 * sending me issues and I don't detect movement or commits."
 *
 * ── THE WORDS COME FROM THE DATA, NEVER FROM THE CALLER ─────────────────────────────────
 *
 * `internshipNudge.ts` is built so there is no path from a request to the text a student reads,
 * and that property is not negotiable just because the copy got cleverer. So this module takes a
 * MEASURED state and returns words. Nothing a caller types reaches a builder through here; the
 * only free text in the whole path is still the manager's optional note, capped and escaped by
 * the existing renderer.
 *
 * ── TWO SEPARATE QUESTIONS, DELIBERATELY NOT MERGED ─────────────────────────────────────
 *
 *   1. `decideNudge` - SHOULD anything be sent on an automatic run?
 *   2. `composeNudge` - what would it say?
 *
 * They are split because the manual button and the weekday run want different answers. A manager
 * pressing send on a green builder wants the congratulations; the automatic run must not mail
 * somebody who committed an hour ago. Merging them would mean one of the two callers had to lie
 * about its intent to get the behavior it needed.
 *
 * ── WHAT SUPPRESSES AN AUTOMATIC NUDGE ──────────────────────────────────────────────────
 *
 * Two things, both of which mean "a human is already in this loop":
 *
 *   - **They wrote in.** An intern who emailed about a blocker is waiting on an answer, not on
 *     encouragement. Nudging them reads as not having been read, which is worse than silence.
 *   - **They moved.** A commit or a verified story is the thing the nudge exists to produce. If
 *     it already happened, the nudge has nothing to ask for.
 *
 * ── A ZERO IS A CLAIM ABOUT SOMEBODY'S WORK ─────────────────────────────────────────────
 *
 * If a builder's stories carry no acceptance criteria, nothing they do CAN be verified, and
 * "you have verified 0" would be the system blaming someone for its own gap. That state gets its
 * own branch and its own words, and it never scolds.
 */

export type NudgeBand = 'green' | 'yellow' | 'orange' | 'red' | 'black' | 'unknown';

export interface NudgeStory {
  storyId: string;
  title: string;
  dueOn: string | null;
  /** False when the story has no acceptance criteria, so finishing it cannot be graded. */
  gradeable: boolean;
}

export interface AgentNudgeState {
  domain: string;
  /** The agent's name, which is what the builder calls their own project. */
  agent: string | null;
  firstName: string;
  email: string;
  band: NudgeBand;
  daysSinceCommit: number | null;
  verified: number;
  stories: number;
  overdue: number;
  /** Stories carrying at least one acceptance criterion. Zero means nothing can be graded. */
  gradeableStories: number;
  nextStory: NudgeStory | null;
  lastVerifiedStoryId: string | null;
  /** Their own commits in the recent window, platform commits already excluded. */
  recentCommitSubjects: string[];
  /** Days since they last emailed in, null if never. Used for wording, not for the decision. */
  daysSinceTheyWrote: number | null;
  /**
   * They wrote and we have not answered yet.
   *
   * This, not "they wrote recently", is what suppresses a nudge. Measured against production on
   * 23 Oct the cruder rule held back the one person who most needed nudging: she wrote on the
   * 20th, was answered on the 21st, and then went silent. "Wrote within two days" read her as
   * mid-conversation when the conversation had already ended with the ball in her court.
   *
   * Computed by the caller from timestamps rather than from day counts, because floored days make
   * "wrote Monday, answered Monday" indistinguishable from "answered Monday, wrote Monday night".
   */
  awaitingOurReply: boolean;
  /** How many of the other builders have finished the story this one is next on. */
  peersDoneWithNextStory: number;
  /** How many nudges they have already had. Rotates the angle; NOT random. */
  priorNudgeCount: number;
}

export interface NudgeDecision {
  send: boolean;
  reason:
  | 'quiet_and_silent'
  | 'never_started'
  | 'awaiting_our_reply'
  | 'moved_recently'
  | 'no_recipient'
  | 'not_a_builder';
}

export interface ComposedNudge {
  variant: string;
  subject: string;
  text: string;
  html: string;
}

/** A builder who wrote in within this many days is already in a conversation. */
export const WROTE_RECENTLY_DAYS = 2;
/** Movement inside this window means the nudge has nothing to ask for. */
export const MOVED_RECENTLY_DAYS = 1;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Should the weekday run mail this person at all?
 *
 * Order matters and is the whole design. "We owe them an answer" is checked BEFORE "they moved",
 * because someone who reported a blocker and then committed a workaround is still owed a reply,
 * and nudging them would be the second time we failed to read it.
 */
export function decideNudge(state: AgentNudgeState): NudgeDecision {
  if (!state.email) return { send: false, reason: 'no_recipient' };

  // NOT "did they write recently". An answered question is a finished conversation, and the
  // silence afterwards is exactly the silence a nudge is for.
  if (state.awaitingOurReply) return { send: false, reason: 'awaiting_our_reply' };

  const moved = (state.daysSinceCommit !== null && state.daysSinceCommit <= MOVED_RECENTLY_DAYS)
    || state.recentCommitSubjects.length > 0;
  if (moved) return { send: false, reason: 'moved_recently' };

  // Never started is its own reason rather than being folded into "quiet". The words differ and
  // so does the urgency: there is no momentum to restart, only one to begin.
  if (state.verified === 0 && state.daysSinceCommit === null) {
    return { send: true, reason: 'never_started' };
  }
  return { send: true, reason: 'quiet_and_silent' };
}

/** The story line, written once so the prose and the subject cannot disagree about it. */
function nextStoryLine(s: NudgeStory): string {
  const due = s.dueOn ? `, due ${s.dueOn}` : '';
  return `${s.storyId}${due}: ${s.title}`;
}

function wrap(subject: string, variant: string, paras: string[]): ComposedNudge {
  return {
    variant,
    subject,
    text: paras.join('\n\n'),
    html: paras.map((p) => `<p>${esc(p)}</p>`).join(''),
  };
}

/**
 * The angles available for a quiet builder.
 *
 * Several, because Ali asked for a different message each weekday and the same sentence five days
 * running stops being read by Wednesday. They rotate on `priorNudgeCount` rather than at random,
 * so the same state always produces the same message and a test can pin it.
 *
 * Each one asks for something SPECIFIC. "Keep going" is not a nudge, it is a notification.
 */
function quietVariants(s: AgentNudgeState): ComposedNudge[] {
  const name = s.firstName || 'there';
  const agent = s.agent || `the ${s.domain} agent`;
  const out: ComposedNudge[] = [];

  if (s.nextStory) {
    out.push(wrap(
      `Your next story on ${agent}`,
      'next_story',
      [
        `Hi ${name},`,
        `The next thing on ${agent} is ${nextStoryLine(s.nextStory)}.`,
        s.nextStory.gradeable
          ? 'It has acceptance criteria written down, so once your commit names the story it gets '
            + 'checked automatically and you will see it turn verified without asking anyone.'
          : 'Reply before you start this one. It has no acceptance criteria yet, which means '
            + 'finishing it would not register, and that is ours to fix rather than yours.',
        'If something about it is unclear, reply with the one sentence that is unclear and I will '
          + 'sort it today.',
      ],
    ));
  }

  if (s.lastVerifiedStoryId) {
    out.push(wrap(
      `You finished ${s.lastVerifiedStoryId}, what is next`,
      'last_done_then_next',
      [
        `Hi ${name},`,
        `${s.lastVerifiedStoryId} is verified, so that one is genuinely done and counted.`,
        s.nextStory
          ? `The next is ${nextStoryLine(s.nextStory)}.`
          : 'There is nothing queued behind it that I can see, which is worth a reply on its own.',
        'What would make the next one easier to start?',
      ],
    ));
  }

  if (s.overdue > 0) {
    out.push(wrap(
      `${s.overdue} ${s.overdue === 1 ? 'story is' : 'stories are'} past their date on ${agent}`,
      'overdue_clock',
      [
        `Hi ${name},`,
        `${s.overdue} of your ${s.stories} stories are past the date set for them.`,
        'Dates set in advance are usually wrong, and a date nobody intends to meet is worse than '
          + 'no date. Tell me what is realistic and I will move them, rather than leaving them red.',
        'If the dates are fine and something else is in the way, say which and I will help.',
      ],
    ));
  }

  out.push(wrap(
    `What is in the way on ${agent}`,
    'what_is_blocking',
    [
      `Hi ${name},`,
      `Nothing has moved on ${agent} for ${s.daysSinceCommit === null ? 'a while'
        : `${s.daysSinceCommit} ${s.daysSinceCommit === 1 ? 'day' : 'days'}`}, which is usually a `
        + 'sign something is in the way rather than a sign of effort.',
      'So, plainly: what is in your way right now? One line is enough and I will unblock it today.',
    ],
  ));

  if (s.peersDoneWithNextStory > 0 && s.nextStory) {
    out.push(wrap(
      `There is a worked example for ${s.nextStory.storyId}`,
      'peer_example',
      [
        `Hi ${name},`,
        `${s.peersDoneWithNextStory} of the other builders have already finished `
          + `${s.nextStory.storyId}, so there is a worked example in each of their repositories to `
          + 'read before you start yours.',
        'Copying the shape of someone else\'s answer is not cheating here, it is the fastest way to '
          + 'see what finished looks like.',
        'Reply if you want me to point you at a specific one.',
      ],
    ));
  }

  return out;
}

/** Nothing committed, ever. One job: make starting feel like one small action. */
function neverStartedVariants(s: AgentNudgeState): ComposedNudge[] {
  const name = s.firstName || 'there';
  const agent = s.agent || `the ${s.domain} agent`;
  const first = s.nextStory;

  const variants: ComposedNudge[] = [
    wrap(
      `Getting started on ${agent}`,
      'first_step',
      [
        `Hi ${name},`,
        first
          ? `Your first story is ${nextStoryLine(first)}.`
          : `${agent} is set up and waiting for its first story.`,
        'You do not need to finish it today. Push one commit that names it, even a rough draft, and '
          + 'the system will start showing your progress instead of showing nothing.',
        'If you are not sure how to begin, reply and tell me where you get stuck and I will walk '
          + 'through the first step with you.',
      ],
    ),
    wrap(
      `Do you need help getting started on ${agent}`,
      'offer_help',
      [
        `Hi ${name},`,
        `I cannot see any commits on ${agent} yet, so I would rather ask than assume.`,
        'Do you need help getting started? Whether it is the repository, the tooling, the brief or '
          + 'simply where to put the first file, say which and I will sort it today.',
        'There is no wrong answer here and no mark against you for asking.',
      ],
    ),
  ];

  if (s.peersDoneWithNextStory > 0 && first) {
    variants.push(wrap(
      `A worked example for your first story`,
      'peer_example_start',
      [
        `Hi ${name},`,
        `${s.peersDoneWithNextStory} of the other builders have finished ${first.storyId} already, `
          + 'so you do not have to work out what finished looks like from a blank page.',
        'Reply and I will point you at one to read before you start.',
      ],
    ));
  }

  return variants;
}

/** Green. Not a nudge; an acknowledgement that names what they actually did. */
function greenVariants(s: AgentNudgeState): ComposedNudge[] {
  const name = s.firstName || 'there';
  const agent = s.agent || `the ${s.domain} agent`;
  const did = s.recentCommitSubjects.slice(0, 3);

  return [wrap(
    `${agent} is moving`,
    'congratulate',
    [
      `Hi ${name},`,
      s.verified > 0
        ? `${s.verified} of your ${s.stories} stories are verified, which means a commit of yours `
          + 'named the story and every criterion on it passed. That is the real bar, not a tick box.'
        : `You are committing steadily on ${agent}.`,
      did.length
        ? `Most recently: ${did.join('; ')}.`
        : 'Keep the commits naming their story and the verification keeps looking after itself.',
      'Nothing needed from you here. Keep going, and shout if anything gets in the way.',
    ],
  )];
}

/**
 * Nothing in their plan can be graded. Their fault, explicitly, it is not.
 *
 * This branch exists because the alternative is a message that reads as "you have done nothing"
 * to somebody who may have done plenty against stories the system cannot mark.
 */
function ungradeableVariants(s: AgentNudgeState): ComposedNudge[] {
  const name = s.firstName || 'there';
  const agent = s.agent || `the ${s.domain} agent`;
  return [wrap(
    `A gap on ${agent} that is ours, not yours`,
    'ungradeable',
    [
      `Hi ${name},`,
      `None of the ${s.stories} stories on ${agent} carry acceptance criteria yet, which means `
        + 'finishing one would not register as finished. Your progress would read as zero however '
        + 'much you did.',
      'That is our gap and we are fixing it. Do not treat the number as a measure of your work.',
      'If you have been working on something, reply and tell me what, and I will make sure it is '
        + 'counted once the criteria land.',
    ],
  )];
}

/**
 * Compose today's message. Deterministic: the same state and the same prior count always produce
 * the same words, which is what makes the whole thing testable.
 */
export function composeNudge(state: AgentNudgeState): ComposedNudge {
  const pool = state.gradeableStories === 0 && state.stories > 0
    ? ungradeableVariants(state)
    : state.band === 'green'
      ? greenVariants(state)
      : state.verified === 0 && state.daysSinceCommit === null
        ? neverStartedVariants(state)
        : quietVariants(state);

  const safe = pool.length ? pool : quietVariants(state);
  const idx = ((state.priorNudgeCount % safe.length) + safe.length) % safe.length;
  return safe[idx];
}

/**
 * Every angle available for this state, in rotation order.
 *
 * Exported so a test can assert the thing Ali actually asked for - that five weekdays running
 * produce five different messages - rather than asserting it one call at a time.
 */
export function nudgeRotation(state: AgentNudgeState, count: number): ComposedNudge[] {
  return Array.from({ length: count }, (_, i) => composeNudge({ ...state, priorNudgeCount: i }));
}
