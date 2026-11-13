/**
 * escalationGate - PURE. May this message be this hard on this person?
 *
 * ## The message this exists for
 *
 * Sent 2026-11-12 19:57 UTC to an intern, in Ali's name:
 *
 *     "Over the last three weeks I have written to you five times and heard back once...
 *      Tell me which one of these is closest to true: ...
 *      4. You have decided you are done with the internship and have not wanted to say so.
 *      What I cannot do is keep writing into silence and call that a program."
 *
 * Every sentence in it was true about the mail. It was still the wrong message, because the
 * recipient had **no project assigned**: `enrollments.active_project_id` was null, and the only
 * `projects` row on her name was a nameless shell created the day before. She was being asked to
 * account for screenshots of an app nobody had given her, and offered an exit from a program she
 * had never been let into. Ali, 2026-11-13: *"the message to Harpreet was pretty harsh - she's
 * not even assigned a project."*
 *
 * ## Why none of the existing gates caught it
 *
 * There were already two gates on this path and both were looking elsewhere:
 *
 *   `briefProblems`   can the SENDER transmit this? Dashes, angle brackets, a double sign-off.
 *   `validateMiddle`  is every FACT in it real? Invented numbers, dates, quotes, links.
 *
 * Nothing asked the third question: is this message's SEVERITY supported by the evidence. A
 * factually accurate, mechanically sendable ultimatum sails through both. So this is a third gate
 * in the same family, written the same way - a list of refusals, pure, deterministic, cheap to
 * test - and it answers only that question.
 *
 * ## The rule, in one sentence
 *
 * You may not hold somebody to account for work you never assigned them.
 *
 * Everything below is that sentence with the edges nailed down. An unassigned project caps the
 * message at `none`; owing them an answer caps it at `none`, because a manager who has not replied
 * has no standing to complain about silence; and the two harder levels additionally require that
 * the silence is real and repeated rather than a single unanswered note.
 *
 * ## Fails closed, and the cost of that is small
 *
 * An unknown warrant is treated as `none`. The cost of refusing an escalation that was in fact
 * warranted is that today's message is gentler than it could have been. The cost of sending one
 * that was not is what happened on 12 November. Those are not comparable, so the refusal is the
 * default and the warrant has to be earned.
 */
import type { SidecarIntern } from '../portfolioReport/sidecar/types';

const DAY = 86400000;

/**
 * How hard a message is allowed to be.
 *
 *   none       ordinary manager mail. Asks, reminders, plans, answers, deadlines.
 *   pressure   names a pattern of silence and puts the relationship itself on the table.
 *   ultimatum  offers an exit, or states a limit on what we will keep doing.
 */
export type EscalationLevel = 'none' | 'pressure' | 'ultimatum';

const RANK: Record<EscalationLevel, number> = { none: 0, pressure: 1, ultimatum: 2 };

/** Ali, 2026-11-13: a week of silence before the wording may name it as a pattern. */
export const PRESSURE_SILENT_DAYS = 7;
/** And a fortnight before it may offer them the door. */
export const ULTIMATUM_SILENT_DAYS = 14;
/** One unanswered note is not a pattern. Two is the floor for naming one. */
export const PRESSURE_UNANSWERED = 2;
/** Three is the floor for an exit offer. */
export const ULTIMATUM_UNANSWERED = 3;

/**
 * What the evidence about ONE intern supports, and why.
 *
 * Every field is drawn from the sidecar the brief was already composed from, so the warrant and
 * the message can never disagree about the same person. Nothing here is fetched.
 */
export interface EscalationWarrant {
  /** A project with a real name on their enrollment. A nameless shell row is not one. */
  readonly hasAssignedProject: boolean;
  /** Days since THEY last wrote. Null means we have never heard from them at all. */
  readonly daysSinceTheirLastWord: number | null;
  /**
   * Messages we sent after their last word, as a LOWER bound.
   *
   * `communications` holds at most ten entries ranked by interest rather than by time, so this
   * undercounts a long thread. Undercounting is the safe direction here: it can only ever refuse
   * an escalation, never permit one.
   */
  readonly unansweredOutbound: number;
  /** Their mail is waiting on a reply from us. While this is true we have no standing. */
  readonly weOweThemAnAnswer: boolean;
  /** The hardest level the evidence supports. */
  readonly level: EscalationLevel;
  /** One sentence naming the fact that set the level, for a log line and for a person. */
  readonly reason: string;
}

/**
 * The phrases that make a message an escalation, and the reason each one is on the list.
 *
 * Drawn from the message that went out on 12 November and from the `never_started` shape in
 * `shapes.ts`, which is the deterministic composer's own version of the same move. Written as data
 * rather than one alternation so that each pattern carries its justification and a new one cannot
 * be slipped in without saying what it is for.
 */
const PATTERNS: ReadonlyArray<{
  readonly level: EscalationLevel;
  readonly re: RegExp;
  readonly why: string;
}> = [
  // ── ultimatum: an exit is offered, or a limit is declared.
  { level: 'ultimatum', re: /\bdone with (?:the|this|your) internship\b/i, why: 'offers them the exit' },
  { level: 'ultimatum', re: /\bends? your internship\b/i, why: 'raises ending the internship' },
  { level: 'ultimatum', re: /\b(?:leave|leaving|quit|quitting) the (?:program|internship)\b/i, why: 'raises them leaving' },
  { level: 'ultimatum', re: /\bwriting into silence\b/i, why: 'declares a limit on what we will keep doing' },
  { level: 'ultimatum', re: /\bcannot work with is silence\b/i, why: 'declares a limit on what we will keep doing' },
  { level: 'ultimatum', re: /\bwhat I cannot do is\b/i, why: 'declares a limit on what we will keep doing' },
  { level: 'ultimatum', re: /\b(?:is |are )?wrong for you\b/i, why: 'questions whether they belong here' },
  { level: 'ultimatum', re: /\bwhether (?:this|it|any of this) is (?:still )?working\b/i, why: 'questions whether they belong here' },
  { level: 'ultimatum', re: /\blast (?:message|time) I (?:will )?(?:write|ask|send)\b/i, why: 'threatens to stop writing' },

  // ── pressure: the silence itself becomes the subject.
  { level: 'pressure', re: /\bstraight with you\b/i, why: 'announces a hard conversation' },
  { level: 'pressure', re: /\babout a pattern\b/i, why: 'names their behaviour as a pattern' },
  { level: 'pressure', re: /\b(?:written|messaged|emailed|reached out) (?:to )?you \w+ times?\b/i, why: 'counts our unanswered messages back at them' },
  { level: 'pressure', re: /\bheard (?:back )?(?:from you )?(?:once|nothing|not(?:hing)? back)\b/i, why: 'counts their silence back at them' },
  { level: 'pressure', re: /\b\w+ unanswered (?:messages?|emails?|notes?)\b/i, why: 'counts our unanswered messages back at them' },
  { level: 'pressure', re: /\bto tell you off\b/i, why: 'denying a reprimand is how a reprimand reads' },
  { level: 'pressure', re: /\bhours are not there\b/i, why: 'puts their commitment on the table' },
  { level: 'pressure', re: /\bkeep (?:writing|chasing|asking) (?:you )?(?:and|with|into)\b/i, why: 'makes our effort the subject' },
];

/**
 * The hardest level any phrase in this body reaches, and the phrase that got there.
 *
 * Pure text classification: it knows nothing about the person. Pairing it with a warrant is what
 * `checkEscalation` does.
 */
export function escalationLevel(body: string): { level: EscalationLevel; phrase: string | null; why: string | null } {
  let best: { level: EscalationLevel; phrase: string; why: string } | null = null;
  for (const p of PATTERNS) {
    const m = p.re.exec(body);
    if (!m) continue;
    if (best && RANK[best.level] >= RANK[p.level]) continue;
    best = { level: p.level, phrase: m[0], why: p.why };
  }
  return best ? best : { level: 'none', phrase: null, why: null };
}

/** Their most recent message to us, by time. */
function lastWordMs(i: SidecarIntern): number | null {
  let newest: number | null = null;
  for (const c of i.communications ?? []) {
    if (c.direction !== 'from_intern') continue;
    const at = Date.parse(c.received_at);
    if (Number.isNaN(at)) continue;
    if (newest === null || at > newest) newest = at;
  }
  return newest;
}

/**
 * What we may say to this person today, and why.
 *
 * The order of the refusals is the order of the argument: who the gap belongs to first, then
 * whether we are the ones holding things up, then whether the silence is real.
 */
export function escalationWarrant(i: SidecarIntern, now: Date = new Date()): EscalationWarrant {
  // A project row with no name is a shell, not an assignment. This is the exact shape of the row
  // that existed on 12 November for an intern we then held accountable for her build.
  const hasAssignedProject = Boolean(i.project && String(i.project.name ?? '').trim().length > 0);

  const theirs = lastWordMs(i);
  const daysSinceTheirLastWord = theirs === null ? null : Math.floor((now.getTime() - theirs) / DAY);

  let unansweredOutbound = 0;
  for (const c of i.communications ?? []) {
    if (c.direction !== 'from_ali') continue;
    const at = Date.parse(c.received_at);
    if (Number.isNaN(at)) continue;
    if (theirs === null || at > theirs) unansweredOutbound += 1;
  }

  const weOweThemAnAnswer = i.triage.tier === 'blocked_waiting_on_ali' || (i.open_questions ?? []).length > 0;

  const base = { hasAssignedProject, daysSinceTheirLastWord, unansweredOutbound, weOweThemAnAnswer };

  if (!hasAssignedProject) {
    return {
      ...base,
      level: 'none',
      reason: 'No project has been assigned to them, so the gap belongs to us and nothing may be asked of them as if it did not.',
    };
  }
  if (weOweThemAnAnswer) {
    return {
      ...base,
      level: 'none',
      reason: 'Their mail is waiting on a reply from us, and we have no standing to raise their silence until it is answered.',
    };
  }

  // Never having heard from them at all is the strongest case for a hard conversation, not an
  // excuse to skip one, so null is treated as maximally silent rather than as unknown.
  const silent = daysSinceTheirLastWord ?? Number.MAX_SAFE_INTEGER;

  if (unansweredOutbound >= ULTIMATUM_UNANSWERED && silent >= ULTIMATUM_SILENT_DAYS) {
    return {
      ...base,
      level: 'ultimatum',
      reason: `${unansweredOutbound} messages from us with nothing back, and ${daysSinceTheirLastWord === null ? 'no message from them on record at all' : `${daysSinceTheirLastWord} days since they last wrote`}.`,
    };
  }
  if (unansweredOutbound >= PRESSURE_UNANSWERED && silent >= PRESSURE_SILENT_DAYS) {
    return {
      ...base,
      level: 'pressure',
      reason: `${unansweredOutbound} messages from us with nothing back, and ${daysSinceTheirLastWord === null ? 'no message from them on record at all' : `${daysSinceTheirLastWord} days since they last wrote`}.`,
    };
  }
  return {
    ...base,
    level: 'none',
    reason: daysSinceTheirLastWord === null
      ? 'We have not written to them enough times yet for silence to be a pattern.'
      : `They wrote ${daysSinceTheirLastWord} days ago, which is not yet a pattern of silence.`,
  };
}

export type EscalationCheck =
  | { readonly ok: true; readonly level: EscalationLevel }
  | {
      readonly ok: false;
      readonly found: EscalationLevel;
      readonly allowed: EscalationLevel;
      readonly phrase: string;
      readonly reason: string;
    };

/**
 * May this body go to this person.
 *
 * Takes a full warrant, or just the ceiling when the caller has nothing richer to offer, and
 * `null` is deliberately allowed because that is the honest state of a brief composed before this
 * gate existed. All three collapse to the same rule: a caller that cannot say what the evidence
 * supports has not earned the right to be hard on somebody, so the missing case means `none`.
 */
export function checkEscalation(
  body: string,
  warrant: EscalationWarrant | EscalationLevel | null | undefined,
): EscalationCheck {
  const given = typeof warrant === 'string' ? { level: warrant, reason: 'the ceiling set for this message' } : warrant;
  const allowed = given?.level ?? 'none';
  const found = escalationLevel(body);
  if (RANK[found.level] <= RANK[allowed]) return { ok: true, level: found.level };
  return {
    ok: false,
    found: found.level,
    allowed,
    phrase: found.phrase ?? '',
    reason: `${found.why ?? 'escalates'} ("${found.phrase}") but the evidence only supports ${allowed}: ${given?.reason ?? 'no warrant was computed for this message'}`,
  };
}
