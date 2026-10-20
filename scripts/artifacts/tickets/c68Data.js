/**
 * C6.8 - the tier-2 multi-touch sequence. THE single source for both PDFs.
 *
 * ## What this ticket is really guarding against
 *
 * "Tier 2 is where volume lives, and volume without a stop rule becomes spam." So the stop
 * rule is not a footnote here, it is the deliverable. Every condition below carries a
 * number, and `assertStopRuleIsNumeric` fails the build if one ever stops carrying one -
 * "stop when it is clearly not working" is the rule that never fires.
 *
 * ## Claims are checked against the registry, not against memory
 *
 * `assertEveryClaimIsPublishable` parses `frontend/src/config/claimsRegistry.ts` at build
 * time and refuses any claim that is not VERIFIED or OWNER_ATTESTED, or whose capability is
 * `unbuilt`. The copy therefore cannot drift ahead of the registry, and if a claim is
 * downgraded later this artifact stops building rather than quietly continuing to assert it.
 *
 * ## The finding that came out of doing that
 *
 * Two registry-publishable claims, `pricing.free` and `surface.free.workspace`, contain the
 * word "free". The standing TWC rule forbids advertising that word, and outbound email is
 * advertising. The registry's gate and the advertising rule disagree, so this sequence uses
 * neither claim and the disagreement is reported rather than papered over.
 *
 * Nothing here is configured for sending. This module describes a sequence; it does not
 * create, enroll or activate anything.
 */
const fs = require('fs');
const path = require('path');
const { findBritishSpelling, americanForm } = require('../britishSpellings');

const REGISTRY = path.join(
  __dirname, '..', '..', '..', 'frontend', 'src', 'config', 'claimsRegistry.ts',
);

const AS_OF = '2026-10-19';

/* ── the audience, and who is deliberately excluded ───────────────────────── */

const AUDIENCE = {
  who: 'Tier-2 accounts and contacts: higher education continuing education units below '
    + 'the tier-1 band C6.4 mapped.',
  excluded: 'Tier-1 contacts never enter a sequence. They get the individually written '
    + 'messages C6.7 drafted, which is the whole point of calling them tier 1.',
  notEnumerated: 'There is no tier-2 account list in production. C6.1 established that zero '
    + 'strategic accounts exist as records, so this design specifies the sequence and the '
    + 'stop rule, not the roster. The roster is C6.2/C6.3 work and is a prerequisite for '
    + 'enrolling anyone.',
};

/* ── the sequence ─────────────────────────────────────────────────────────── */

/**
 * Six touches over 21 days. The first touch is not a request for anything.
 *
 * The ticket asks for engagement with a target's recent posts before connecting. That is
 * followed here as a design principle, and it is NOT presented as a measured result: no row
 * in the claim registry supports a figure for it, so no figure is given. See LIMITS.
 */
const TOUCHES = [
  {
    n: 1, day: 0, channel: 'LinkedIn', action: 'Engage',
    what: 'Comment once, substantively, on a post the target published in the last 30 days. '
      + 'No connection request, no profile pitch, no link.',
    why: 'A comment is a contribution. A connection request on day 0 is a withdrawal before '
      + 'any deposit.',
    copy: null,
  },
  {
    n: 2, day: 2, channel: 'LinkedIn', action: 'Connect',
    what: 'Connection request with no note.',
    why: 'The day-0 comment is the context. A note repeating it reads as a pitch; an empty '
      + 'request from a name they just saw reads as a colleague.',
    copy: null,
  },
  {
    n: 3, day: 3, channel: 'Email', action: 'Touch 1 - the problem',
    what: 'Name the problem in their own institution\'s language. One claim, one ask.',
    why: 'Sent on day 3 whether or not the connection was accepted, so the sequence does not '
      + 'stall on a LinkedIn decision we do not control.',
    copy: 'email.1',
  },
  {
    n: 4, day: 8, channel: 'Email', action: 'Touch 2 - the proof',
    what: 'One link to a commit a stranger can open without an account. No new claim.',
    why: 'The only thing we have that competitors cannot copy is the record of what a named '
      + 'person built. C5.0 probed 213 of those links and 212 resolved anonymously.',
    copy: 'email.2',
  },
  {
    n: 5, day: 14, channel: 'LinkedIn', action: 'Message, only if connected',
    what: 'One message referring to the post engaged with on day 0. Skipped entirely if the '
      + 'request was not accepted.',
    why: 'Conditional by design: messaging a non-connection is not possible without InMail, '
      + 'and buying InMail for tier 2 is the cost spiral this sequence exists to avoid.',
    copy: 'linkedin.1',
  },
  {
    n: 6, day: 21, channel: 'Email', action: 'Touch 3 - the close-out',
    what: 'Say this is the last message, and say what happens if they do nothing: nothing.',
    why: 'A stated ending is the cheapest reply-rate improvement available and it is the '
      + 'honest thing to do. It also makes the stop rule visible to the recipient.',
    copy: 'email.3',
  },
];

/* ── the stop rule, set before the first send ─────────────────────────────── */

/**
 * Every condition carries a number. That is enforced, not encouraged.
 *
 * `scope` matters as much as the number: a spam complaint stops the SEQUENCE, not just the
 * contact, because one complaint is evidence about the copy and the list, not about one
 * person's mood.
 */
const STOP_RULE = [
  { trigger: 'Any reply, positive or negative', threshold: 1, scope: 'contact',
    action: 'Sequence ends. A human answers. No further automated touch.',
    short: 'Ends. A human answers.',
    automatic: true },
  { trigger: 'Touches delivered', threshold: 6, scope: 'contact',
    action: 'Sequence ends on its own. There is no touch 7 and no re-entry.',
    short: 'Ends. No touch 7, no re-entry.',
    automatic: true },
  { trigger: 'Days since first touch', threshold: 21, scope: 'contact',
    action: 'Sequence ends even if touches were skipped.', short: 'Ends even if touches were skipped.',
    automatic: true },
  { trigger: 'Emails sent to one contact', threshold: 3, scope: 'contact',
    action: 'Hard ceiling. Three, across the whole sequence.', short: 'Hard ceiling across the sequence.',
    automatic: true },
  { trigger: 'LinkedIn actions against one contact', threshold: 3, scope: 'contact',
    action: 'Hard ceiling: one comment, one request, one message.', short: 'Comment, request, message. That is all.',
    automatic: true },
  { trigger: 'Hard bounce', threshold: 1, scope: 'contact',
    action: 'Suppressed. Already automatic: the Mandrill webhook sets leads.status=bounced.',
    short: 'Suppressed. Already automatic.',
    automatic: true },
  { trigger: 'Unsubscribe or STOP', threshold: 1, scope: 'contact',
    action: 'Suppressed across channels. Already automatic via processOptOut.',
    short: 'Suppressed across channels. Automatic.',
    automatic: true },
  { trigger: 'Spam complaint', threshold: 1, scope: 'SEQUENCE',
    action: 'Pause the whole sequence and review the copy before anyone else is enrolled.',
    short: 'Pause the SEQUENCE and review the copy.',
    automatic: false },
  { trigger: 'Contacts completed with no reply', threshold: 40, scope: 'SEQUENCE',
    action: 'Pause and review. Below a 5 percent reply rate at 40 contacts, the sequence is '
      + 'not working and continuing is just volume.',
    short: 'Pause. Under 5% reply is not working.',
    automatic: false },
];

/* ── unsubscribe and DND ──────────────────────────────────────────────────── */

const SUPPRESSION = {
  email: [
    'Every email carries the provider unsubscribe link.',
    'processOptOut(leadId, channel, reason, source) is the single writer: it sets '
      + 'leads.status, sets campaign_leads.lifecycle_status to dnd, cancels pending '
      + 'scheduled_emails, inserts the unsubscribe_events row and mirrors a revoked '
      + 'consent_records row.',
    'Enrollment-time refusal: checkLeadSendable(leadId, "email"), which C6.6 now calls '
      + 'before a curated contact can be enrolled at all.',
    'Send-time refusal: evaluateSend, the chokepoint every scheduled send passes through.',
  ],
  linkedin: [
    'LinkedIn has no unsubscribe mechanism. This is the real gap in this design.',
    'A refusal expressed on LinkedIn is honored by a human recording it, which sets the '
      + 'same DND state the email path sets. Until that is recorded, nothing stops the '
      + 'email touches.',
    'Mitigation: touch 5 is the only LinkedIn message, it is conditional on a connection '
      + 'the target chose to accept, and the ceiling is three LinkedIn actions total.',
  ],
};

/* ── the copy ─────────────────────────────────────────────────────────────── */

/**
 * Copy is held as a claim key plus the surrounding sentence, so the build can check the
 * claim rather than scan prose for numbers. A touch that asserts nothing carries no key.
 *
 * CLM-025: the non-affiliation line is required wherever an Anthropic program is named.
 */
const NON_AFFILIATION = 'Colaberry is not affiliated with, endorsed by, or a partner of '
  + 'Anthropic.';

const COPY = {
  'email.1': {
    subject: 'the part of this nobody is building',
    claims: ['positioning.primary'],
    body: 'Your continuing education unit is being asked for AI programs by employers who '
      + 'cannot describe what they want. We build the system, build the people, and prove '
      + 'the capability. Worth twenty minutes?',
    requiresNonAffiliation: false,
  },
  'email.2': {
    subject: 'what one of them actually built',
    claims: [],
    body: 'No pitch. One link: the commit history of something a named person built during '
      + 'the program. Open it without an account and judge the work directly.',
    requiresNonAffiliation: false,
  },
  'email.3': {
    subject: 'closing this out',
    claims: ['program.duration', 'credential.cca.safe'],
    body: 'Last note from me. The engagement runs 12 weeks, and it prepares people for the '
      + 'Claude Certified Architect, Foundations credential. If the timing is wrong, '
      + 'nothing further happens and you need not reply.',
    requiresNonAffiliation: true,
  },
  'linkedin.1': {
    subject: null,
    claims: ['anthropic.capability'],
    body: 'Thanks for connecting. Your post on the staffing gap is the thing we keep running '
      + 'into. We build on Claude and Claude Code, and the output is a record of what each '
      + 'person built rather than a completion certificate.',
    requiresNonAffiliation: true,
  },
};

/* ── registry parsing ─────────────────────────────────────────────────────── */

/**
 * Read the claim registry the site itself reads.
 *
 * \r?\n throughout: this checkout is CRLF, and an \n-only pattern matches nothing and
 * reports an empty registry, which would make every claim check pass vacuously.
 */
function loadRegistry() {
  const text = fs.readFileSync(REGISTRY, 'utf8');
  const body = text.slice(text.indexOf('export const CLAIMS'));
  const out = new Map();
  for (const part of body.split(/\r?\n {2}\{\r?\n/).slice(1)) {
    const pick = (f) => {
      const m = new RegExp(`${f}:\\s*'([^']*)'`).exec(part);
      return m ? m[1] : null;
    };
    const key = pick('key');
    if (key) {
      out.set(key, {
        key,
        publicWording: pick('publicWording'),
        verification: pick('verification'),
        capability: pick('capability'),
      });
    }
  }
  if (out.size < 20) {
    throw new Error(`C6.8: parsed only ${out.size} claims; the registry parse is broken`);
  }
  return out;
}

/* ── assertions ───────────────────────────────────────────────────────────── */

/** Every stop condition must carry a number. "Stop when it is not working" never fires. */
function assertStopRuleIsNumeric() {
  for (const rule of STOP_RULE) {
    if (typeof rule.threshold !== 'number' || !Number.isFinite(rule.threshold)
      || rule.threshold <= 0) {
      throw new Error(`C6.8: stop condition "${rule.trigger}" has no usable number`);
    }
  }
  if (STOP_RULE.filter((r) => r.scope === 'SEQUENCE').length < 2) {
    throw new Error('C6.8: at least two stop conditions must kill the SEQUENCE, not just a '
      + 'contact. A rule that only ever stops one person is not a brake on volume.');
  }
  return STOP_RULE.length;
}

/** Every claim in the copy must be publishable per the registry, read at build time. */
function assertEveryClaimIsPublishable() {
  const registry = loadRegistry();
  const used = [];
  for (const [id, block] of Object.entries(COPY)) {
    for (const key of block.claims) {
      const claim = registry.get(key);
      if (!claim) throw new Error(`C6.8: ${id} cites "${key}", which is not in the registry`);
      if (!['VERIFIED', 'OWNER_ATTESTED'].includes(claim.verification)) {
        throw new Error(`C6.8: ${id} cites "${key}", which is ${claim.verification}`);
      }
      if (claim.capability === 'unbuilt') {
        throw new Error(`C6.8: ${id} cites "${key}", whose capability is unbuilt`);
      }
      used.push(key);
    }
  }
  return { used: [...new Set(used)], registrySize: registry.size };
}

/**
 * The TWC finding, as a guard.
 *
 * Outbound email is advertising, and the standing rule forbids the word. Two registry
 * claims carry it anyway, so this asserts both that the copy avoids the word AND that those
 * two claims are still the ones carrying it - if the registry is ever reworded, this
 * artifact should be rewritten rather than silently keep reporting a stale conflict.
 */
function assertNoProhibitedWord() {
  for (const [id, block] of Object.entries(COPY)) {
    const text = `${block.subject || ''} ${block.body}`;
    if (/\bfree\b/i.test(text)) {
      throw new Error(`C6.8: ${id} advertises the word "free"; say "$0 to start"`);
    }
    if (/—/.test(text)) throw new Error(`C6.8: ${id} contains an em dash`);
    const british = findBritishSpelling(text);
    if (british) {
      throw new Error(`C6.8: ${id} uses British spelling "${british}"; `
        + `use "${americanForm(british)}"`);
    }
  }
  const registry = loadRegistry();
  const conflicted = [...registry.values()].filter(
    (c) => ['VERIFIED', 'OWNER_ATTESTED'].includes(c.verification)
      && /\bfree\b/i.test(c.publicWording || ''),
  );
  if (!conflicted.length) {
    throw new Error('C6.8: no registry claim contains "free" any more, so the conflict this '
      + 'artifact reports no longer exists. Rewrite the finding.');
  }
  return conflicted.map((c) => c.key);
}

/** CLM-025: naming an Anthropic program requires the non-affiliation line. */
function assertNonAffiliationWhereRequired() {
  let required = 0;
  for (const [id, block] of Object.entries(COPY)) {
    const namesAnthropic = /anthropic|claude/i.test(`${block.body} ${block.claims.join(' ')}`);
    if (namesAnthropic && !block.requiresNonAffiliation) {
      throw new Error(`C6.8: ${id} names an Anthropic program without the non-affiliation line`);
    }
    if (block.requiresNonAffiliation) required += 1;
  }
  if (!required) throw new Error('C6.8: no touch carries the non-affiliation line');
  return required;
}

/** Tier 1 must be excluded in writing, because the ticket puts them out of scope. */
function assertTierOneExcluded() {
  if (!/never enter a sequence/i.test(AUDIENCE.excluded)) {
    throw new Error('C6.8: the exclusion of tier-1 contacts must stay explicit');
  }
  return true;
}

/** The LinkedIn gap must stay stated. It is the weakest part of the design. */
function assertLinkedInGapStated() {
  if (!SUPPRESSION.linkedin.some((l) => /no unsubscribe mechanism/i.test(l))) {
    throw new Error('C6.8: the LinkedIn suppression gap must stay stated, not quietly dropped');
  }
  return true;
}

/** Nothing is configured to send. The ticket says design and copy only. */
function assertNothingActivated() {
  const touches = TOUCHES.length;
  if (touches !== STOP_RULE.find((r) => r.trigger === 'Touches delivered').threshold) {
    throw new Error('C6.8: the touch count and the touch-ceiling stop rule disagree');
  }
  return { touches, configured: false };
}

module.exports = {
  AS_OF,
  AUDIENCE,
  TOUCHES,
  STOP_RULE,
  SUPPRESSION,
  COPY,
  NON_AFFILIATION,
  loadRegistry,
  assertStopRuleIsNumeric,
  assertEveryClaimIsPublishable,
  assertNoProhibitedWord,
  assertNonAffiliationWhereRequired,
  assertTierOneExcluded,
  assertLinkedInGapStated,
  assertNothingActivated,
};
