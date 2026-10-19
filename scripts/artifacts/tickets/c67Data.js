/**
 * C6.7 - personal outreach drafts for the tier-1 buyers named in C6.4.
 *
 * ## THIS FILE HOLDS NO PERSONAL DATA, AND THAT IS THE SECOND ATTEMPT
 *
 * The drafts name real people at real institutions and carry their email addresses, and
 * this repository is PUBLIC. The first version of this module had all twenty-four written
 * into it as literals. That was caught before it was ever committed, and the structure
 * now matches the C6.4 generator: the people live in `tmp/c67_messages.json`, which
 * `.gitignore` covers by pattern, and this module reads them. `assertSourceNotCommitted()`
 * refuses to build if that file ever becomes tracked.
 *
 * ## The standard this ticket sets, and why it is checked rather than trusted
 *
 * "Templated personalisation. If the opening could be sent to anyone, it is not tier 1."
 * That judgement gets made badly at draft nineteen, so `c67Guards.js` enforces it: every
 * opening must contain a word appearing in no other opening, and no two openings may share
 * more than a third of their vocabulary.
 *
 * ## Every opening rests on a fact somebody read on a page
 *
 * Each hook carries the fact, the URL it was read on, and the date shown there. A
 * fabricated detail in a note to a named dean is far worse than a generic one, so where no
 * specific fact could be found the target is held WITH NO OPENING AT ALL rather than given
 * a plausible one. A guard fails the build if a held target ever acquires an opening.
 *
 * ## Nothing here sends anything
 *
 * The ticket puts any automated sequence for this tier explicitly out of scope and says
 * this tier is sent by hand. This module imports no mail client, carries no campaign id and
 * no schedule, and a guard greps the source to keep it that way. The required end state is
 * BLOCKED - ALI DECISION REQUIRED.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const SOURCE_REL = 'tmp/c67_messages.json';
const SOURCE = path.join(ROOT, SOURCE_REL);

/** Refuse to read the drafts if git is tracking them. Checked before the parse. */
function assertSourceNotCommitted() {
  let tracked = '';
  try {
    tracked = execFileSync('git', ['ls-files', '--error-unmatch', SOURCE_REL],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { tracked = ''; }
  if (tracked) {
    throw new Error(`${SOURCE_REL} is TRACKED BY GIT. It names real people at real `
      + 'institutions and carries their email addresses, and this repository is public. '
      + 'Remove it from the index before building.');
  }
  return SOURCE_REL;
}

assertSourceNotCommitted();
if (!fs.existsSync(SOURCE)) {
  throw new Error(`missing ${SOURCE_REL}. It holds personal data and is never committed, `
    + 'so a fresh checkout has to regenerate it from the C6.4 contact map and the research.');
}

const RAW = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const AS_OF = '19 October 2026';
const MESSAGES = RAW.messages;
const SENDABLE = MESSAGES.filter((m) => m.sendable);
const HELD = MESSAGES.filter((m) => !m.sendable);

/**
 * Registry wordings that may appear verbatim in a draft. Anything in a draft that looks
 * like a claim is checked against this list, so a figure that is not one of these fails.
 */
const PUBLISHABLE = [
  'Colaberry Enterprise AI',
  'Build the system. Build the people. Prove the capability.',
  'We build on Claude and Claude Code.',
  '12 weeks',
  'Teaching this since 2012',
  '1,000+ hires',
  'Claude Certified Architect, Foundations - certification preparation, aligned to the '
  + 'official Claude architect domains. The credential is issued by the certifying body.',
];

const REVIEW_STATE = 'BLOCKED - ALI DECISION REQUIRED';

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

function headline() {
  return `${SENDABLE.length} of ${MESSAGES.length} tier-1 buyers have a draft opening on `
    + `something specific that was read on a dated page; ${HELD.length} are held with no `
    + 'draft at all, because their units publish nothing specific enough to open on and a '
    + 'generic opening is the exact failure this ticket names.';
}

const SO_WHAT = [
  'THE RESEARCH IS THE DELIVERABLE, NOT THE PROSE. Each opening rests on a fact read on a '
    + 'named page with the date it showed, and every hook records that source so you can '
    + 'check any of them in about fifteen seconds. Four facts that search engines still '
    + 'surface were found to be stale and were deliberately not used: a four million dollar '
    + 'apprenticeship page that now returns 404, a 2024 certificate that never appeared on '
    + 'the live list, an employer partnership whose only descriptions are from 2020, and '
    + 'trade coverage from 2013 to 2015. Each is recorded in the hook as a do-not-use.',
  'THREE OF YOUR TOP TARGETS ALREADY SELL AN AI CERTIFICATE. Pratt runs an AI Design '
    + 'certificate, Elon ran the inaugural cohort of an AI Certificate for Professionals in '
    + 'January, and Columbus State is thirty weeks and $2,600 into one with a cohort '
    + 'starting in November. That changes the pitch: the opening cannot be that AI matters, '
    + 'because they already know. It has to be what a completer can show afterwards, which '
    + 'is the one thing none of those three currently answers.',
  'ONE TARGET’S HOOK IS HIS OWN WORDS. The Clayton State buyer C6.4 identified is the '
    + 'same person who signs the welcome message in their current catalog, where he draws a '
    + 'line between teaching the technology and helping somebody apply it. That draft quotes '
    + 'him back to himself, which is as far from interchangeable as this exercise gets.',
];

const LIMITS = [
  'Nothing here has been sent and nothing is configured to send. The ticket puts any '
    + 'automated sequence for this tier explicitly out of scope and says it is sent by hand, '
    + 'so these are drafts for your approval and the review state is the blocked one.',
  'Every draft needs your edit before it goes. The voice is mine, the relationship is '
    + 'yours, and the opening is the only part I would defend as finished.',
  'Three targets are held with no draft: their continuing education units publish no named '
    + 'course, partner or date at all. Writing them a generic note would satisfy the count '
    + 'and fail the ticket.',
  'Eleven of the thirty-five buyers C6.4 named have no verified email address, so they are '
    + 'not in this set at all. A personal note needs somewhere to go.',
  'Confidence varies and is recorded per draft. Two rest on a reputable third party rather '
    + 'than the institution’s own site, and several sit on pages that carry no date, '
    + 'which the drafts handle by never implying recency.',
];

const DECISION = 'Whether these go out, and in what order. My suggestion is to send the '
  + 'three whose hooks are freshest and most specific first, which are Clayton State, '
  + 'Columbus State and Pasadena, because a reply there tells you whether the evidence '
  + 'argument lands before you spend the other eighteen.';

module.exports = {
  AS_OF, MESSAGES, SENDABLE, HELD, PUBLISHABLE, REVIEW_STATE, SOURCE_REL,
  headline, SO_WHAT, LIMITS, DECISION,
  assertSourceNotCommitted,
};
