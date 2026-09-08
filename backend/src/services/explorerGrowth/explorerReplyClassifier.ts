/**
 * Explorer Growth OS — inbound reply classification. Plan §15.5; EPIC 8.
 *
 * §15.5: "OPT_OUT → deterministic keyword match only, never LLM →
 * processOptOut() immediately."
 *
 * WHY THAT RULE IS ABSOLUTE HERE, IN BOTH DIRECTIONS.
 *
 * Missing an opt-out means continuing to email someone who told us to stop.
 * That is a CAN-SPAM problem and, more to the point, it is ignoring a person who
 * asked for something. A model that classifies "take me off this list" as
 * QUESTION on an off day produces exactly that, silently, and nobody finds out
 * until the complaint.
 *
 * Inventing one is not harmless either. `processOptOut` cascades to Lead.status,
 * every CampaignLead lifecycle, pending ScheduledEmails, a consent revoke and a
 * GHL DND tag — and plan §35 D-4 is explicit that opt-outs are never
 * retroactively reversed. A false positive silently removes a learner from
 * everything, permanently, and no one will notice a message that was not sent.
 *
 * So: deterministic patterns decide, and the model cannot override them in
 * either direction. If the model independently thinks a reply is an opt-out and
 * the patterns disagree, that is NOT discarded — it becomes a human task, so a
 * person decides rather than a probabilistic classifier triggering an
 * irreversible action on its own.
 *
 * PURE. The model call is injected, so every routing rule here is testable
 * without a network.
 */

export const EXPLORER_REPLY_CLASSES = [
  'QUESTION',
  'INTERESTED',
  'READY_TO_ENROLL',
  'NEEDS_HELP',
  'SCHEDULING',
  'PRICING',
  'INTERNSHIP',
  'COMMUNITY',
  'NOT_INTERESTED',
  'OPT_OUT',
  'NEEDS_ALI',
  'OTHER',
] as const;

export type ExplorerReplyClass = (typeof EXPLORER_REPLY_CLASSES)[number];

export function isExplorerReplyClass(v: string): v is ExplorerReplyClass {
  return (EXPLORER_REPLY_CLASSES as readonly string[]).includes(v);
}

/**
 * What happens next. Plan §15.5 routing.
 *
 * `AUTO_REPLY` is deliberately absent. §15.5 allows it only at a later stage
 * behind its own flag, and a value that exists in the type is a value someone
 * eventually returns.
 */
export type ReplyRoute =
  | 'PROCESS_OPT_OUT'
  | 'HUMAN_TASK'
  | 'DRAFT_FOR_REVIEW'
  | 'RECORD_ONLY';

/**
 * Deterministic opt-out patterns.
 *
 * ANCHORED, because the cost of a false positive is a permanent, unnoticed
 * suppression. A bare substring search for "stop" matches "I stopped by the
 * community room" and "nonstop", and "remove" matches "remove me from the
 * waitlist, I want the full cohort" — an enthusiastic reply that would silently
 * end the relationship.
 *
 * Each pattern therefore requires either the whole message to be the command
 * (the SMS convention) or an explicit directive aimed at contact itself.
 */
const OPT_OUT_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // The whole message is the command, give or take punctuation.
  { name: 'bare-command', re: /^\s*(stop|stopall|end|quit|cancel|unsubscribe|opt\s?out)[\s.!]*$/i },
  { name: 'unsubscribe', re: /\bunsubscribe\b/i },
  { name: 'opt-out', re: /\bopt(?:ing)?[\s-]?out\b/i },
  // "remove me" MUST name a contact channel. Anchoring only on "remove me
  // from" caught two real replies in the tests below — "Remove me from the
  // waitlist, I want the full cohort" and "Can you take me off mute in the
  // session?" — both of which are people asking for something ordinary, and
  // both of which would have been permanently and silently suppressed.
  //
  // `\blist\b` does not match inside "waitlist": the word boundary is what
  // separates a mailing list from a waiting list.
  {
    name: 'remove-me',
    re: /\b(remove|take)\s+me\s+(off|from)\b[^.!?\n]{0,40}?\b(lists?|mailing|email|e-mail|newsletter|distribution|subscription|contacts?)\b/i,
  },
  { name: 'stop-contacting', re: /\bstop\s+(emailing|contacting|messaging|texting|sending)\b/i },
  { name: 'no-more-email', re: /\bno\s+more\s+(emails?|messages?|texts?)\b/i },
  { name: 'do-not-contact', re: /\b(do\s?n[o']?t|please\s+do\s+not)\s+(email|contact|message|text)\s+me\b/i },
  { name: 'delete-my-data', re: /\b(delete|erase)\s+(my|this)\s+(account|data|email|information)\b/i },
];

export interface OptOutDetection {
  optOut: boolean;
  /** Which pattern fired — recorded so a suppression can always be explained. */
  pattern?: string;
}

/**
 * Deterministic opt-out detection. The only thing permitted to trigger
 * `processOptOut()`.
 */
export function detectOptOut(body: string): OptOutDetection {
  const text = (body ?? '').trim();
  if (!text) return { optOut: false };

  // Quoted history is not the sender speaking. Without this, one reply to a
  // thread whose footer says "unsubscribe" opts out everyone who ever replies
  // in it — and the footer is on every message we send.
  const withoutQuotes = text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');

  for (const { name, re } of OPT_OUT_PATTERNS) {
    if (re.test(withoutQuotes)) return { optOut: true, pattern: name };
  }
  return { optOut: false };
}

export interface Classification {
  class: ExplorerReplyClass;
  route: ReplyRoute;
  /** Which layer decided. A suppression must always be explainable. */
  source: 'deterministic' | 'model' | 'fallback';
  /** Set when the model's opinion was not acted on directly. */
  note?: string;
}

/** §15.5 routing for a class the model produced. */
function routeFor(cls: ExplorerReplyClass): ReplyRoute {
  switch (cls) {
    case 'READY_TO_ENROLL':
    case 'NEEDS_ALI':
    case 'NOT_INTERESTED':
    case 'NEEDS_HELP':
      // A person, not a generator. NEEDS_HELP joins these deliberately: someone
      // reporting a problem is the case §25.2 forbids experimenting on, and it
      // is not a case for a drafted marketing reply either.
      return 'HUMAN_TASK';
    case 'QUESTION':
    case 'PRICING':
    case 'SCHEDULING':
      return 'DRAFT_FOR_REVIEW';
    default:
      return 'RECORD_ONLY';
  }
}

/**
 * Classify one inbound reply.
 *
 * `modelClass` is whatever the LLM returned, or null when it was not called or
 * failed. The deterministic layer runs FIRST and wins.
 */
export function classifyExplorerReply(
  body: string,
  modelClass: string | null = null,
): Classification {
  const detected = detectOptOut(body);

  if (detected.optOut) {
    // Authoritative. The model is not consulted, and could not have overridden
    // this if it had been.
    return {
      class: 'OPT_OUT',
      route: 'PROCESS_OPT_OUT',
      source: 'deterministic',
      note: `matched ${detected.pattern}`,
    };
  }

  if (modelClass && isExplorerReplyClass(modelClass)) {
    if (modelClass === 'OPT_OUT') {
      // The model thinks this is an opt-out and no pattern agrees. Neither
      // outcome is acceptable on the model's word alone: acting means a
      // probabilistic classifier triggering an irreversible suppression;
      // discarding means throwing away a possible request to stop. A person
      // decides.
      return {
        class: 'NEEDS_ALI',
        route: 'HUMAN_TASK',
        source: 'model',
        note: 'model suggested OPT_OUT with no deterministic match — routed to a human rather than suppressing automatically',
      };
    }
    return { class: modelClass, route: routeFor(modelClass), source: 'model' };
  }

  // No usable model answer. OTHER + RECORD_ONLY is the quiet outcome: the reply
  // is captured, the learner enters IN_CONVERSATION like any other reply, and
  // nothing is sent on a guess.
  return {
    class: 'OTHER',
    route: 'RECORD_ONLY',
    source: 'fallback',
    note: modelClass ? `unrecognised model class "${modelClass}"` : 'no model classification',
  };
}

/**
 * Every reply, whatever its class, suppresses scheduled nurture for 7 days
 * (§15.5). Someone who wrote to us should not receive an unrelated scheduled
 * message the next morning.
 */
export const IN_CONVERSATION_SUPPRESSION_DAYS = 7;
