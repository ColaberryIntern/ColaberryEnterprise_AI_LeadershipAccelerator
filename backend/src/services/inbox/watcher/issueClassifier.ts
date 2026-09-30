import { normalizeEmailAddress } from '../coraAgentService';

/**
 * What kind of problem is this, and is the watcher allowed to answer it?
 *
 * ── DETERMINISTIC, NOT A MODEL ──────────────────────────────────────────────
 *
 * Classification is pattern matching, on purpose. An LLM deciding at 3am with
 * nobody awake whether a message is "about money" is the improvisation this
 * task exists to prevent, and its mistakes are not reproducible in a test. The
 * cost of determinism is that unusual phrasing falls through — and falling
 * through means Ali gets a notification, which is the outcome we want anyway.
 *
 * ── ESCALATION WINS ─────────────────────────────────────────────────────────
 *
 * Escalation triggers are evaluated BEFORE any auto-reply class and cannot be
 * overridden by one. "My link expired and I would like a refund" is a refund
 * message that happens to mention a link. Answering the easy half of it and
 * silently dropping the half about money would be the worst possible reading.
 *
 * ── AMBIGUITY IS AN ESCALATION, NOT A GUESS ─────────────────────────────────
 *
 * Two classes matching is not two problems to solve, it is one message the
 * watcher does not understand well enough. No match is the same. Both go to
 * Ali. The bar for answering autonomously is a single unambiguous class, not
 * the best available guess.
 */

export type IssueClass =
  | 'login_link'
  | 'repo_connect'
  | 'webhook_not_firing'
  | 'project_state';

export type EscalationReason =
  | 'money_or_billing'
  | 'refund_withdraw_cancel'
  | 'destructive_to_student_work'
  | 'ikenna'
  | 'marione_account_merge'
  | 'protected_student_work'
  | 'multiple_issue_classes'
  | 'unclassifiable';

export type Classification =
  | { action: 'auto_reply'; issueClass: IssueClass; matched: string }
  | { action: 'escalate'; reason: EscalationReason; matched?: string; detail: string };

/** Do-not-email, withdrawn enrollment, open refund question. Never auto-answered. */
export const IKENNA_ADDRESSES = ['nzeribeikenna@gmail.com'];

/** Both halves of the duplicate pair. The merge is Ali's decision, not the watcher's. */
export const MARIONE_ADDRESSES = ['rogation2000.mn@gmail.com', 'rogation2000@yahoo.fr'];

/**
 * The four students holding 24 hand-ticked completions in legacy lists outside
 * the published plan. Any message from them that touches removing, resetting or
 * regenerating anything goes to Ali: those ticks are their only visible
 * progress and nothing automated should be near them.
 */
export const PROTECTED_WORK_ADDRESSES = [
  'qninying@gmail.com',
  'shabana.zeeshan001@gmail.com',
  'bfglz@yahoo.com',
  'farhat@colaberry.com',
];

const MONEY_PATTERNS: Array<[RegExp, EscalationReason]> = [
  [/\brefund(?:ed|ing|s)?\b/i, 'refund_withdraw_cancel'],
  [/\bcancel(?:led|ling|lation|s)?\b/i, 'refund_withdraw_cancel'],
  [/\bwithdraw(?:al|ing|n)?\b/i, 'refund_withdraw_cancel'],
  [/\bdrop out\b/i, 'refund_withdraw_cancel'],
  [/\bmoney back\b/i, 'refund_withdraw_cancel'],
  [/\bcharge(?:d|s|back)?\b/i, 'money_or_billing'],
  [/\bbill(?:ed|ing|s)?\b/i, 'money_or_billing'],
  [/\binvoice(?:d|s)?\b/i, 'money_or_billing'],
  [/\bpayment(?:s)?\b/i, 'money_or_billing'],
  [/\bsubscription(?:s)?\b/i, 'money_or_billing'],
  [/\bcredit card\b/i, 'money_or_billing'],
  [/\bpaysimple\b/i, 'money_or_billing'],
  [/\binstal(?:l)?ment(?:s)?\b/i, 'money_or_billing'],
  [/\bdouble[- ]charged\b/i, 'money_or_billing'],
  [/\$\s?\d/, 'money_or_billing'],
];

/**
 * Anything that would remove or rewrite work. Deliberately broad: the cost of a
 * false positive is an email to Ali, the cost of a false negative is a
 * student's completed tasks disappearing overnight.
 */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bwipe\b/i,
  /\berase\b/i,
  /\bclear (?:out |my |the )?(?:tasks|list|lists|progress|plan)\b/i,
  /\bregenerate\b/i,
  /\bre-?generate\b/i,
  /\bstart (?:over|again|from scratch)\b/i,
  /\breset\b/i,
  /\brebuild (?:my |the )?(?:plan|project|tasks)\b/i,
  /\boverwrite\b/i,
  /\bduplicate (?:list|lists|tasks)\b/i,
];

const CLASS_PATTERNS: Array<{ cls: IssueClass; patterns: RegExp[] }> = [
  {
    cls: 'login_link',
    patterns: [
      /\bmagic link\b/i,
      /\bsign[- ]?in link\b/i,
      /\blog[- ]?in link\b/i,
      /\blink (?:has )?expired\b/i,
      /\bexpired link\b/i,
      /\blink (?:does|doesn'?t|did not|didn'?t) work\b/i,
      /\bcan(?:'|no)?t (?:sign|log) ?in\b/i,
      /\bunable to (?:sign|log) ?in\b/i,
      /\bnot able to (?:sign|log) ?in\b/i,
      /\blocked out\b/i,
      /\binvalid (?:or expired )?(?:token|link)\b/i,
    ],
  },
  {
    cls: 'repo_connect',
    patterns: [
      /\bconnect(?:ing)? (?:my |the )?(?:github|repo|repository)\b/i,
      /\bgithub (?:connect|connection|username|account|auth)\b/i,
      /\brepo(?:sitory)? (?:not )?(?:connect|connected|linked|linking)\b/i,
      /\bcan(?:'|no)?t connect (?:my |the )?(?:github|repo)\b/i,
      /\bno workspace repo\b/i,
      /\bnoworkspacerepo\b/i,
    ],
  },
  {
    cls: 'webhook_not_firing',
    patterns: [
      /\bwebhook\b/i,
      /\bpush(?:ed|es)? (?:but|and) nothing (?:happen|happens|happened|updates?)\b/i,
      /\bcommit(?:ted|s)? but (?:nothing|no) (?:update|change|progress)\b/i,
      /\bverification (?:never|not) (?:run|running|ran|firing)\b/i,
    ],
  },
  {
    cls: 'project_state',
    patterns: [
      /\bstory[- ]?000\b/i,
      /\bstory 0+\b/i,
      /\bno (?:tasks|plan|project|stories)\b/i,
      /\b(?:tasks|plan|project) (?:is |are )?(?:missing|empty|blank)\b/i,
      /\bacceptance criteri(?:on|a)\b/i,
      /\bwrong (?:prompt|criteria|count)\b/i,
      /\bstale prompt\b/i,
      /\bfirst (?:story|task) (?:is )?missing\b/i,
    ],
  },
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}

export interface ClassifierInput {
  fromAddress: string | null | undefined;
  subject?: string | null;
  bodyText?: string | null;
}

/** Quote markers below which the text is OUR email, echoed back inside theirs. */
const QUOTE_MARKERS: RegExp[] = [
  /^On .*\bwrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{10,}\s*$/m,
  /^From:\s.+$\n^Sent:\s/m,
];

/**
 * Reduce a message to the words the STUDENT actually wrote.
 *
 * This is not tidiness, it is a correctness fix that a cycle test caught before
 * anything shipped. Twelve of the twenty five campaign subjects end in the
 * words "and a fresh sign in link", and every reply carries that subject back
 * with `Re:` in front. Classifying on the raw subject therefore
 * reads OUR words as the student's problem statement, and labels a reply that
 * says nothing but "thanks" as a login-link issue.
 *
 * The quoted body is the same trap one level down: a reply usually carries our
 * entire email underneath it. So the subject is used only when the student
 * chose it, and the body is cut at the first quote marker with `>` lines
 * dropped.
 */
export function extractStudentText(
  subject: string | null | undefined,
  bodyText: string | null | undefined,
): string {
  const subj = (subject ?? '').trim();
  const echoedBack = /^\s*(re|fwd?|fw)\s*:/i.test(subj);

  const body = bodyText ?? '';
  let cut = body.length;
  for (const marker of QUOTE_MARKERS) {
    const hit = marker.exec(body);
    if (hit && hit.index < cut) cut = hit.index;
  }
  const ownBody = body
    .slice(0, cut)
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');

  return `${echoedBack ? '' : subj}\n${ownBody}`;
}

export function classifyInbound(input: ClassifierInput): Classification {
  const from = normalizeEmailAddress(input.fromAddress || '');
  const text = extractStudentText(input.subject, input.bodyText);

  // ── Sender-scoped escalations, before anything is read out of the text ──
  if (IKENNA_ADDRESSES.includes(from)) {
    return {
      action: 'escalate',
      reason: 'ikenna',
      detail:
        'Ikenna is flagged do-not-email, his enrollment is withdrawn, and his last contact was ' +
        'a refund request. Nothing automated replies to him.',
    };
  }
  if (MARIONE_ADDRESSES.includes(from)) {
    return {
      action: 'escalate',
      reason: 'marione_account_merge',
      detail:
        'Marione holds two active accounts with byte-identical ideas. Which one survives is ' +
        "Ali's decision, and every reply to either address touches it.",
    };
  }

  // ── Content escalations. These outrank every auto-reply class. ──
  for (const [pattern, reason] of MONEY_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      return {
        action: 'escalate',
        reason,
        matched: m[0],
        detail: `Message touches money or enrollment status (matched "${m[0]}"). Ali decides, not the watcher.`,
      };
    }
  }

  const destructive = firstMatch(text, DESTRUCTIVE_PATTERNS);
  if (destructive) {
    const protectedSender = PROTECTED_WORK_ADDRESSES.includes(from);
    return {
      action: 'escalate',
      reason: protectedSender ? 'protected_student_work' : 'destructive_to_student_work',
      matched: destructive,
      detail: protectedSender
        ? `Matched "${destructive}" from a student holding hand-ticked completions in legacy ` +
          'lists. Those ticks are their only visible progress and are not automatically touchable.'
        : `Matched "${destructive}": the request would remove or rewrite student work.`,
    };
  }

  // ── Auto-reply classes. Exactly one match, or it goes to Ali. ──
  const hits: Array<{ cls: IssueClass; matched: string }> = [];
  for (const { cls, patterns } of CLASS_PATTERNS) {
    const m = firstMatch(text, patterns);
    if (m) hits.push({ cls, matched: m });
  }

  if (hits.length === 1) {
    return { action: 'auto_reply', issueClass: hits[0].cls, matched: hits[0].matched };
  }
  if (hits.length > 1) {
    return {
      action: 'escalate',
      reason: 'multiple_issue_classes',
      detail:
        `Matched ${hits.length} issue classes (${hits.map((h) => h.cls).join(', ')}). ` +
        'That is one message the watcher does not understand, not several it can answer.',
    };
  }
  return {
    action: 'escalate',
    reason: 'unclassifiable',
    detail:
      'No bounded issue class matched. The watcher answers four specific problems and sends ' +
      'everything else to a human rather than composing a general answer.',
  };
}
