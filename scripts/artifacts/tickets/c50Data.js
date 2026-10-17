/**
 * C5.0 - make commit verification externally checkable. THE single source for both PDFs.
 *
 * ## Every number here was measured on 17 October 2026, and the assertions say how
 *
 * The ticket's standard is that a stranger can check the claim without taking our word for
 * it. A document about that standard which itself carries an unverifiable number would be
 * self-refuting, so each figure below declares HOW it was obtained, and `assertSourced()`
 * fails the build if one does not.
 *
 * Three sources appear, and they are not equally strong:
 *
 *   PROBED    an HTTP request was made and the status code recorded, with controls at both
 *             ends of the run proving the channel could tell 200 from 404
 *   QUERIED   a SELECT against the production database, read-only
 *   FETCHED   the live public endpoint, with no login, exactly as a reader would
 *
 * Nothing here is ESTIMATED, and there is deliberately no tag for it.
 */

const AS_OF = '17 October 2026';

const SRC = {
  PROBED: { k: 'PROBED', color: '#2f7d32' },
  QUERIED: { k: 'QUERIED', color: '#1f6feb' },
  FETCHED: { k: 'FETCHED', color: '#7a4fb6' },
};

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

const HEADLINE = 'A stranger can now open a link and check a named person’s commit. '
  + 'Proving that was true, rather than asserting it, is what found the three defects below.';

const SO_WHAT = [
  'The capability was already real and the page could not show it. C0.5 proved the '
    + 'verification exists and C1.6 still scored dimension 4 PARTIAL, because a row in our '
    + 'own table saying "verified" is not something a buyer can check. The deep link closes '
    + 'that: 213 commit URLs, 212 of them confirmed open to anyone with no login.',
  'Two of the three defects were already live, and one was actively misleading. The '
    + 'published page for a named learner reported four private repositories and no public '
    + 'ones, for four public repositories that had synced that morning. A hiring manager '
    + 'read that as someone who has shipped nothing.',
  'The privacy question answered itself once reachability was measured rather than assumed. '
    + 'Nothing is named that a logged-out stranger cannot already open, because that is the '
    + 'literal test now applied, so the disclosure delta is zero by construction.',
];

/* ------------------------------------------------------------------ *
 * WHAT A READER GETS, which is the deliverable
 * ------------------------------------------------------------------ */

const PUBLISHED_FIELDS = [
  { f: 'story_id', why: 'Which story the award belongs to' },
  { f: 'title', why: 'What the story asked for, in the learner’s own task title' },
  { f: 'commit_sha_short', why: 'The identifier, shown beside the link' },
  { f: 'committed_at', why: 'When the work was committed' },
  { f: 'criteria_passed / criteria_total', why: 'Our assessment, stated as ours' },
  { f: 'commit_url', why: 'The deep link. Always an https://github.com commit URL' },
];

const NEVER_PUBLISHED = [
  { f: 'reasons', why: 'Why the pipeline hesitated. The learner’s shortfall' },
  { f: 'outstanding', why: 'Criteria not yet met. The learner’s shortfall' },
  { f: 'rejected_claims', why: 'Claims the pipeline refused. The most damaging of the three' },
];

/* ------------------------------------------------------------------ *
 * THE MEASUREMENTS
 * ------------------------------------------------------------------ */

const NUMBERS = [
  { k: 'Commit links the feature publishes', v: '214', src: SRC.QUERIED,
    how: 'Verified rows joined to a connected repository, deduplicated on story and commit' },
  { k: 'Distinct commit URLs among them', v: '213', src: SRC.QUERIED,
    how: 'One commit satisfied two stories, so it appears twice as two awards' },
  { k: 'Returned 200 to an anonymous request', v: '212', src: SRC.PROBED,
    how: 'Every URL requested, controls re-run at the end in case of throttling' },
  { k: 'Returned 404, and are dropped', v: '1', src: SRC.PROBED,
    how: 'baidhani/HomeHub, 404 at the commit and at the repository root' },
  { k: 'Dead links that would reach a reader', v: '0', src: SRC.PROBED,
    how: 'The reachability gate removes the one before it is rendered' },
  { k: 'Portfolio pages carrying linkable work', v: '10', src: SRC.QUERIED,
    how: '2 published, 8 draft' },
  { k: 'Awards on the published pages', v: '46', src: SRC.QUERIED,
    how: '45 on one page and 1 on the other' },
];

/* ------------------------------------------------------------------ *
 * THE THREE DEFECTS
 * ------------------------------------------------------------------ */

const DEFECTS = [
  {
    n: 1,
    title: 'A stored URL does not mean a reachable repository',
    live: false,
    found: 'Probing the 213 links the feature would publish.',
    detail: 'github_connections carries 18 columns and not one records whether a repository '
      + 'is public. The sync reads with the learner’s own token, so a private repository '
      + 'syncs exactly as happily as a public one. One repository in the set, '
      + 'baidhani/HomeHub, returns 404 at the commit and at the repository root; its only '
      + 'tell in our data is a last_sync_at five weeks behind every sibling.',
    fix: 'Reachability is measured with a HEAD request rather than guessed: cached six hours '
      + 'per repository, four at a time, 2.5s timeout, no retry. A transport blip reuses the '
      + 'last known answer rather than deleting a page’s evidence; a real 404 drops the '
      + 'link. Confirmed from the production container first that node gets honest status '
      + 'codes from github.com there, because on openai.com Cloudflare blocks it outright.',
  },
  {
    n: 2,
    title: 'The live page reported the opposite of the truth about a named person',
    live: true,
    found: 'Fetching the public endpoint with no login, as a reader would.',
    detail: 'getCareerProfile emits each repository as {repo_url, repo_name}; the projection '
      + 'read html_url and name. Both undefined, so every repository fell through to the '
      + 'private counter. The published payload read repositories: [] with '
      + 'private_repository_count: 4, for four public repositories synced that morning, 45 '
      + 'of whose commits answer 200 to anyone. A hiring manager read that as a person who '
      + 'has shipped nothing.',
    fix: 'Both key shapes are read. Correcting the names alone would have swung the error the '
      + 'other way and published private repository NAMES, which is itself a disclosure, so '
      + 'the same measured reachability set now governs which repositories are named and '
      + 'which commits are linked. One answer, so the page cannot link into a repository it '
      + 'is simultaneously calling private.',
  },
  {
    n: 3,
    title: 'story_id is scoped per project, so most of the evidence was being discarded',
    live: true,
    found: 'Noticing 45 database rows collapse to 14 published awards.',
    detail: 'Every project numbers its own stories from STORY-001, so one id names four '
      + 'entirely different pieces of work in four repositories, with four different commits '
      + 'and four different titles. Deduplicated on the id alone the page published 14 of 45 '
      + 'and three of that learner’s four projects showed nothing at all.',
    fix: 'The key is the story AND its commit. Not the commit alone either: one commit in '
      + 'that same set satisfied two separate stories, which is two awards rather than one.',
  },
];

/** The four stories that share one id, which is the clearest illustration of defect 3. */
const COLLISION = [
  { id: 'STORY-001', sha: '066d9b2', repo: 'HosPulse', title: 'Import CMS HCRIS Data' },
  { id: 'STORY-001', sha: '8c371ac', repo: 'relay', title: 'Process a job with idempotency' },
  { id: 'STORY-001', sha: 'b55c117', repo: 'ai-operations-center', title: 'Implement human approval workflow' },
  { id: 'STORY-001', sha: '25c54db', repo: 'ambit', title: 'Issue and enforce a token' },
];

/** Before and after for the one published page, which is the whole argument in four numbers. */
const BEFORE_AFTER = [
  { k: 'Repositories named', before: '0', after: '4' },
  { k: 'Counted as private', before: '4', after: '0' },
  { k: 'Commit links', before: '0', after: '45' },
  { k: 'Of those, confirmed open', before: 'n/a', after: '45' },
];

/* ------------------------------------------------------------------ *
 * WHAT IS STILL NOT TRUE, stated rather than omitted
 * ------------------------------------------------------------------ */

const LIMITS = [
  'This is merged, not deployed. Until it is on production and checked there, the ticket’s '
    + 'two close actions do not fire: C1.6 dimension 4 stays PARTIAL, and the claim registry '
    + 'row that blocks the external claim word this ticket exists to unlock stays as it is. '
    + 'This document does not write that word, for the same reason: a line quoted out of '
    + 'this page should not be able to make the claim before the claim is true.',
  'A repository that goes private inside the six-hour cache window still yields a link that '
    + '404s. The permanent fix is to record reachability on the sync, which needs a column '
    + 'and is therefore a separate decision rather than something to slip in here.',
  'The criteria counts are OUR assessment and are labeled as such. What a stranger can '
    + 'verify independently is that the commit exists, in that person’s repository, on '
    + 'that date, containing what it contains. That is the part that was missing.',
  'Eight of the ten pages carrying linkable work are drafts, so 168 of the 214 awards are '
    + 'not reachable by anyone yet. Publishing those pages is a learner decision, not a '
    + 'build task.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS - the build fails rather than shipping an unsourced figure
 * ------------------------------------------------------------------ */

function assertSourced() {
  const bad = NUMBERS.filter((n) => !n.src || !n.how || !String(n.how).trim());
  if (bad.length) {
    throw new Error('C5.0: unsourced figure(s): ' + bad.map((b) => b.k).join('; '));
  }
  return NUMBERS.length;
}

/** The arithmetic has to hold, or the document contradicts itself in public. */
function assertProbeArithmetic() {
  const n = (k) => Number(NUMBERS.find((x) => x.k === k).v);
  const distinct = n('Distinct commit URLs among them');
  const ok = n('Returned 200 to an anonymous request');
  const dead = n('Returned 404, and are dropped');
  if (ok + dead !== distinct) {
    throw new Error(`C5.0: ${ok} + ${dead} does not equal ${distinct} probed URLs`);
  }
  if (n('Dead links that would reach a reader') !== 0) {
    throw new Error('C5.0: the gate is the whole point; this figure must be 0');
  }
  return { distinct, ok, dead };
}

/**
 * The claim registry governs every external figure and CLM-027 blocks the word "verifiable"
 * until this ships. The document is internal, but it is the document that will be quoted
 * when the registry row is changed, so it must not pre-empt the change it is arguing for.
 */
function assertDoesNotClaimVerifiableYet() {
  const prose = [HEADLINE, ...SO_WHAT, ...LIMITS, ...DEFECTS.map((d) => d.detail + d.fix)]
    .join(' ').toLowerCase();
  const m = prose.match(/\bverifiable\b/g);
  if (m) {
    throw new Error('C5.0: the prose uses "verifiable" ' + m.length + ' time(s); the claim '
      + 'registry still blocks it until this is deployed and checked on production');
  }
  return true;
}

/** Nothing the learner failed at may appear anywhere in the published list. */
function assertNoLearnerFailuresPublished() {
  const published = PUBLISHED_FIELDS.map((f) => f.f).join(' ');
  for (const { f } of NEVER_PUBLISHED) {
    if (published.includes(f)) {
      throw new Error('C5.0: "' + f + '" appears in the PUBLISHED list and must not');
    }
  }
  return NEVER_PUBLISHED.length;
}

module.exports = {
  AS_OF, SRC, HEADLINE, SO_WHAT, PUBLISHED_FIELDS, NEVER_PUBLISHED, NUMBERS,
  DEFECTS, COLLISION, BEFORE_AFTER, LIMITS,
  assertSourced, assertProbeArithmetic, assertDoesNotClaimVerifiableYet,
  assertNoLearnerFailuresPublished,
};
