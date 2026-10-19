/**
 * C9.8 - weekly market feedback synthesis. Brief 1, and the format for every brief after.
 *
 * ## The honest problem this brief has to solve
 *
 * Most of the ten questions C9.8 asks are about buyer conversations: what resonated, what
 * confused them, what blocked purchase, what they asked for, what they ignored, pricing
 * objections. THERE HAVE BEEN NO BUYER CONVERSATIONS. Measured on 19 October 2026: the most
 * recent activity against any lead at a .edu address is 13 August, none of those accounts
 * are on the tier-1 list, and interaction_outcomes has recorded nothing since the week of
 * 7 September.
 *
 * So six questions are answered NO EVIDENCE with the reason, and four are answered from
 * PREPARATORY evidence, which is our own work rather than anything a buyer said. Those
 * counts are derived from the sections and asserted, because the first draft of this file
 * said eight and four, which did not add up to ten and was not what the data held.
 *
 * The ticket's named failure is "writing a brief nobody acts on"; a brief that dressed
 * preparation up as buyer feedback would be worse than that, because somebody might act on
 * it.
 *
 * ## Observed and preparatory are kept apart by construction
 *
 * Every finding carries a `basis`: OBSERVED means it came from a buyer, PREPARATORY means
 * it came from our own evidence work this week. `assertNothingObservedWithoutAConversation`
 * fails the build if anything is marked OBSERVED while the conversation count is zero.
 */

const AS_OF = '19 October 2026';

/**
 * Buyer conversations in the period, measured rather than assumed. If this is ever
 * non-zero, the OBSERVED basis unlocks and the brief changes shape.
 */
const CONVERSATIONS = {
  count: 0,
  evidence: 'Measured on the production database 19 October 2026. Most recent activity '
    + 'against any lead at a .edu address: 13 August 2026, and none of those accounts '
    + '(Seton Hill, George Fox, Sylvester) are on the C6.3 tier-1 list. '
    + 'interaction_outcomes has recorded nothing since the week of 7 September 2026. '
    + 'The C6.7 drafts are unsent and blocked on approval.',
};

const BASIS = {
  OBSERVED: { k: 'OBSERVED', color: '#2f7d32', note: 'came from a buyer' },
  PREPARATORY: { k: 'PREPARATORY', color: '#1f6feb', note: 'came from our own evidence work' },
  NONE: { k: 'NO EVIDENCE', color: '#b26a00', note: 'nothing to report, and why' },
};

/* ------------------------------------------------------------------ *
 * THE TEN QUESTIONS C9.8 ASKS EVERY WEEK
 * ------------------------------------------------------------------ */

const SECTIONS = [
  {
    q: 'What resonated', basis: BASIS.NONE,
    finding: 'Nothing to report. No buyer has seen the positioning outside our own files.',
    why: 'No conversations have happened. The tier-1 outreach drafts exist and are blocked '
      + 'on your approval, so nothing has reached a buyer to resonate or fail.',
  },
  {
    q: 'What confused buyers', basis: BASIS.NONE,
    finding: 'Nothing to report.',
    why: 'Same reason. Worth noting for the first brief that does have evidence: the thing '
      + 'most likely to confuse is the distinction between preparing people for a '
      + 'credential and issuing one, which our own registry has had to correct twice.',
  },
  {
    q: 'What created meetings', basis: BASIS.PREPARATORY,
    finding: 'One meeting was created in the period, and it is not a buyer meeting: MIT '
      + 'Solve, Tuesday 27 October at 1:00 PM Central, booked 18 October after an inbound '
      + 'reply. It is a network and partnership conversation, not a pipeline one.',
    why: 'Recorded here because the question asks what created meetings and the honest '
      + 'answer is an existing relationship rather than any outbound we ran.',
  },
  {
    q: 'What blocked purchase', basis: BASIS.NONE,
    finding: 'Nothing observed, because nothing has reached the point of purchase.',
    why: 'What WILL block it is now documented rather than guessed. C7.7 found no database '
      + 'backup of any kind, no customer SSO, and admin access that is cross-tenant in '
      + 'production today. Those are anticipated blockers, not observed ones, and the '
      + 'distinction matters: a buyer has not yet told us any of it matters to them.',
  },
  {
    q: 'What feature was requested', basis: BASIS.NONE,
    finding: 'Nothing to report.',
    why: 'No conversations. The first brief with real evidence here will be the one worth '
      + 'reading.',
  },
  {
    q: 'What nobody cared about', basis: BASIS.NONE,
    finding: 'Nothing to report.',
    why: 'This question cannot be answered without conversations, and inventing an answer '
      + 'would be the most damaging kind of false signal because it stops work.',
  },
  {
    q: 'Which ICP is strongest', basis: BASIS.PREPARATORY,
    finding: 'Higher education continuing education remains the strongest, and the week '
      + 'produced reachability evidence for it rather than demand evidence. The buyer is '
      + 'now named at 35 of 38 tier-1 accounts, 24 with a verified email address. Against '
      + 'that, zero of the 41 contacts we already held at those accounts was in the right '
      + 'buying center: 31 accounts held only IT contacts.',
    why: 'Reachability is not demand. This supports C2.5 rather than confirming it, and the '
      + 'confirmation can only come from replies.',
  },
  {
    q: 'Pricing objections', basis: BASIS.NONE,
    finding: 'None, and we are not currently able to invite any.',
    why: 'The strongest price fact available to the public buyer, C2.3’s entry block of '
      + '60 learners at $9,000, sits inside what many public buyers can spend without '
      + 'competition or a board vote. It has no row in the C0.6 registry, so it cannot be '
      + 'stated externally. We cannot collect objections to a price we are unable to quote.',
  },
  {
    q: 'Competitor mentions', basis: BASIS.PREPARATORY,
    finding: 'No buyer mentioned a competitor. A market scan during the C6.7 research found '
      + 'that three of the 24 researched targets already sell their own AI certificate: '
      + 'Pratt runs an AI Design certificate, Elon ran the inaugural cohort of an AI '
      + 'Certificate for Professionals in January, and Columbus State is 30 weeks and '
      + '$2,600 into one with a cohort starting 4 November.',
    why: 'These are prospects, not competitors, which is the more interesting reading: the '
      + 'buyers most able to buy are the ones already building the thing. It changes the '
      + 'pitch from whether AI matters to what a completer can show afterwards.',
  },
  {
    q: 'What should stop being built', basis: BASIS.PREPARATORY,
    finding: 'C8.2, the commercialization command center, should not be built in its '
      + 'current sequence. C8.1 established that 8 of its 10 required metrics have no data '
      + 'source at all, so building the route now ships eight tiles reading "not measured".',
    why: 'Not a cancellation. Four small schema additions turn seven of the eight blanks '
      + 'into real numbers, and a commercial opportunity record alone unlocks three. The '
      + 'recommendation is to resequence, not to stop.',
  },
];

/* ------------------------------------------------------------------ *
 * DECISIONS, IN THE SHAPE SECTION 5 OF THE MASTER INDEX USES
 * ------------------------------------------------------------------ */

const DECISIONS = [
  {
    decision: 'The word "Free" on advertising surfaces: add the route, or stop rendering the '
      + 'claim', raisedBy: 'C9.8 / C6.7', neededBy: '2026-10-24', status: 'Open',
    note: 'pricing.free renders through a component that declares a route it is not served '
      + 'at, so registry route scoping does not constrain it. The standing TWC rule is never '
      + 'to advertise that word. Two fixes mean different things and the choice is yours.',
  },
  {
    decision: 'A registry row for the $9,000 entry block, or drop the price from public copy',
    raisedBy: 'C9.8 / C5.6 / C2.3', neededBy: '2026-10-24', status: 'Open',
    note: 'It is the strongest single fact available to the workforce and public buyer and '
      + 'it cannot be used until it has a row. Blocking three artifacts so far.',
  },
  {
    decision: 'Correct the SOC 2 wording on the two utility landing pages',
    raisedBy: 'C9.8 / C7.7', neededBy: '2026-10-22', status: 'Open',
    note: 'Two routed pages say "SOC 2 aligned audit trails" and one says "auditor-ready '
      + 'from day one". We hold no SOC 2 report and none is in progress. This is a claim '
      + 'rather than a gap and it is live now.',
  },
  {
    decision: 'Fix or disclose: the four cheap security gaps before the next enterprise '
      + 'conversation', raisedBy: 'C9.8 / C7.7', neededBy: '2026-10-26', status: 'Open',
    note: 'Backups, a rate limit and lockout on the staff login, dependency scanning with a '
      + 'backend lockfile, and a subprocessor list. Days of work between them, and they '
      + 'change the answer to a questionnaire materially.',
  },
  {
    decision: 'C8.2 sequencing: schema additions first, or build the shell with eight honest '
      + 'blanks', raisedBy: 'C9.8 / C8.1', neededBy: '2026-10-20', status: 'Open',
    note: 'C8.2 is due 20 October. Both options are defensible; the prototype attached to '
      + 'C8.1 is exactly what the second one looks like.',
  },
  {
    decision: 'Tier-1 outreach: approve, edit or hold, and in what order',
    raisedBy: 'C9.8 / C6.7', neededBy: '2026-10-21', status: 'Open',
    note: '21 drafts are ready and 3 targets are held. C9.2, which starts approved tier-1 '
      + 'outreach, is due 21 October and is blocked on this. Suggested first three: Clayton '
      + 'State, Columbus State, Pasadena.',
  },
  {
    decision: 'Ninety days or twelve weeks for the accelerator',
    raisedBy: 'C9.8 / C5.4', neededBy: '2026-10-24', status: 'Open',
    note: 'The ticket and the C2.2 blueprint say ninety days; the only verified duration in '
      + 'the registry is 12 weeks, which is 84. The page currently states the registry’s.',
  },
];

/** The ticket requires a decision OR an explicit no-change. Both are recorded. */
const NO_CHANGES = [
  {
    subject: 'Beachhead ICP',
    statement: 'No change. Higher education continuing education remains the beachhead. The '
      + 'week produced reachability evidence that supports C2.5 and nothing that challenges '
      + 'it. Revisit when the first replies arrive, not before.',
  },
  {
    subject: 'Positioning and category noun',
    statement: 'No change. Nothing was learned this period that bears on C2.1, because '
      + 'nothing reached a buyer. Changing positioning on the strength of our own '
      + 'preparation would be the exact error this brief exists to prevent.',
  },
];

/* ------------------------------------------------------------------ *
 * THE CADENCE PROBLEM, WHICH IS ALSO A FINDING
 * ------------------------------------------------------------------ */

const CADENCE = {
  due: 'Every Friday from 16 October 2026',
  thisBrief: 'Brief 1, covering 6 to 19 October 2026, produced 19 October and therefore '
    + 'three days late against its first Friday.',
  gap: 'Section 10 of the Commercialization Master Index, "What changed this week", still '
    + 'reads "Week of 6 Oct 2026". It has not been updated in two weeks, which is the exact '
    + 'decay this ticket exists to prevent, and it is why this brief covers thirteen days '
    + 'rather than seven.',
  automation: 'NOT automatic. The acceptance criterion says "produced weekly without '
    + 'prompting" and today it is produced because somebody asked. Making it genuinely '
    + 'recurring needs the interaction record C8.1 identified: there is nowhere to write '
    + 'down a buyer conversation, so there is nothing for a scheduled job to read.',
};

const LIMITS = [
  'This brief contains no buyer feedback because there has been none. Six of the ten '
    + 'questions are answered NO EVIDENCE with the reason, and a build assertion fails if '
    + 'any finding is marked as observed while the conversation count is zero.',
  'The two inputs the ticket names, C8.4 funnel data and C9.5 meeting notes, do not exist. '
    + 'C8.4 is unbuilt and there is no table anywhere in production that records a sales '
    + 'meeting or a demo, which C8.1 established by searching all 562 tables.',
  'Decisions below are raised, not landed. Section 5 of the Master Index is another '
    + 'ticket’s artifact and appending to it from here would mean rewriting a file '
    + 'somebody else owns, so the rows are given in its exact column shape instead.',
  'Preparatory findings are our own work, not market evidence. They are worth acting on and '
    + 'they are not a substitute for somebody replying.',
];

const DECISION = 'Seven decisions are open below and three of them have a date inside the '
  + 'next five days: C8.2 sequencing tomorrow, the outreach approval on 21 October, and the '
  + 'SOC 2 wording which is live copy. The fastest useful thing you can do with this brief '
  + 'is answer the outreach one, because it is the only decision that converts preparation '
  + 'into the buyer evidence every other section is waiting for.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** All ten questions the ticket names are answered. */
const REQUIRED_QUESTIONS = ['what resonated', 'what confused', 'created meetings',
  'blocked purchase', 'feature was requested', 'nobody cared', 'icp is strongest',
  'pricing objections', 'competitor mentions', 'stop being built'];

function assertEveryQuestionAnswered() {
  if (SECTIONS.length !== REQUIRED_QUESTIONS.length) {
    throw new Error(`${SECTIONS.length} sections for ${REQUIRED_QUESTIONS.length} questions`);
  }
  const asked = SECTIONS.map((s) => s.q.toLowerCase());
  for (const r of REQUIRED_QUESTIONS) {
    if (!asked.some((a) => a.includes(r.split(' ').slice(-2).join(' ')) || a.includes(r))) {
      throw new Error(`the weekly question "${r}" is not answered`);
    }
  }
  for (const s of SECTIONS) {
    if (!s.finding || s.finding.length < 15) throw new Error(`${s.q}: no finding`);
    if (!s.why || s.why.length < 25) throw new Error(`${s.q}: no reason given`);
    if (!Object.values(BASIS).includes(s.basis)) throw new Error(`${s.q}: invalid basis`);
  }
  return SECTIONS.length;
}

/**
 * THE SIGNATURE GUARD. Nothing may be presented as buyer feedback until a buyer has
 * actually said something. This is what stops a brief from laundering our own preparation
 * into market evidence.
 */
function assertNothingObservedWithoutAConversation() {
  const observed = SECTIONS.filter((s) => s.basis === BASIS.OBSERVED);
  if (CONVERSATIONS.count === 0 && observed.length) {
    throw new Error(`${observed.length} section(s) are marked OBSERVED while the measured `
      + 'buyer-conversation count is zero. Preparation is not market evidence.');
  }
  if (!CONVERSATIONS.evidence || CONVERSATIONS.evidence.length < 40) {
    throw new Error('the conversation count carries no measurement behind it');
  }
  return observed.length;
}

/** The brief ends in decisions or explicit no-changes, and never in neither. */
function assertEndsInADecision() {
  if (!DECISIONS.length && !NO_CHANGES.length) {
    throw new Error('the brief ends in neither a decision nor an explicit no-change, which '
      + 'is the failure this ticket names');
  }
  for (const d of DECISIONS) {
    for (const k of ['decision', 'raisedBy', 'neededBy', 'status']) {
      if (!d[k]) throw new Error(`a decision row is missing ${k}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.neededBy)) {
      throw new Error(`"${d.decision}" has no dated needed-by`);
    }
    if (!d.note || d.note.length < 30) throw new Error(`"${d.decision}" has no context`);
  }
  for (const n of NO_CHANGES) {
    if (!/^No change/i.test(n.statement)) {
      throw new Error(`the no-change on ${n.subject} does not say so explicitly`);
    }
  }
  return `${DECISIONS.length} decisions, ${NO_CHANGES.length} explicit no-changes`;
}

/** The counts used in the prose, derived from the sections rather than written. */
function tally() {
  const n = (b) => SECTIONS.filter((s) => s.basis === b).length;
  return {
    none: n(BASIS.NONE), prep: n(BASIS.PREPARATORY), observed: n(BASIS.OBSERVED),
    total: SECTIONS.length,
  };
}

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten'];

/**
 * Any count stated in the prose matches the sections.
 *
 * This guard exists because the first draft said "eight of the ten questions are answered
 * NO EVIDENCE" when six were, and eight plus the four preparatory ones did not even add to
 * ten. The build output caught it; nothing else would have.
 */
function assertCountsMatchSections(prose) {
  const t = tally();
  if (t.none + t.prep + t.observed !== t.total) {
    throw new Error('the section tally does not cover every question');
  }
  const wrong = new RegExp(
    `\\b(?!${WORDS[t.none]}\\b)(two|three|four|five|six|seven|eight|nine)\\b `
    + 'of the ten (questions|weekly questions)', 'i');
  if (wrong.test(prose)) {
    throw new Error(`the prose states a count of the ten questions that is not ${t.none}, `
      + `which is how many are answered NO EVIDENCE`);
  }
  return `${t.none} no-evidence, ${t.prep} preparatory, ${t.observed} observed`;
}

/** A NO EVIDENCE section must not smuggle a finding in through the reason field. */
function assertNoEvidenceSectionsStayEmpty() {
  for (const s of SECTIONS.filter((x) => x.basis === BASIS.NONE)) {
    if (/buyers? (said|told|asked|wanted|liked|objected)/i.test(`${s.finding} ${s.why}`)) {
      throw new Error(`${s.q}: marked NO EVIDENCE but describes what buyers said`);
    }
  }
  return SECTIONS.filter((x) => x.basis === BASIS.NONE).length;
}

module.exports = {
  AS_OF, CONVERSATIONS, BASIS, SECTIONS, DECISIONS, NO_CHANGES, CADENCE, LIMITS, DECISION,
  assertEveryQuestionAnswered, assertNothingObservedWithoutAConversation,
  assertEndsInADecision, assertNoEvidenceSectionsStayEmpty, assertCountsMatchSections,
  tally,
};
