/**
 * AF10.7's facts: every Release 0 document an intern commits, readable from their agent ticket.
 *
 * Data only, no rendering. Taken from the merged PR #3466 and its production dry run.
 *
 * TWO THINGS THIS ARTIFACT MUST NOT BLUR. The code is merged, but NOTHING HAS BEEN POSTED: the
 * runner is dry unless --send, there is no cron entry, and the first live post is Ali's to
 * authorize. And the dry run doubles as a document-progress snapshot of the cohort, taken from
 * what the interns actually committed rather than from what anyone reported -- which is a finding
 * about the interns, not about this ticket.
 */
const TICKET = 'AF10.7';
const PR = 3466;
const MERGED_ON = '2026-10-29';

const CRITERIA = [
  {
    n: 1,
    text: 'A document committed by an intern is readable on their agent ticket without leaving '
      + 'Basecamp.',
    met: true,
    evidence: 'Proven by a read-only dry run against every real agent ticket and every real '
      + 'intern repository: 7 tickets examined, exit 0, 683 lines, sent=false.',
  },
  {
    n: 2,
    text: 'A second commit to the same file posts an update rather than a duplicate.',
    met: true,
    evidence: 'A per-path fingerprint, deduped across ALL comments via Link-header pagination -- '
      + 'the hazard below is live today, not theoretical.',
  },
  {
    n: 3,
    text: 'Nothing is posted for a repository the platform cannot read, and the reason is stated.',
    met: true,
    evidence: 'Every repository was readable in the dry run, so the refusal path is asserted by '
      + 'test rather than by the run.',
  },
];

/** The dry run, which is also a snapshot of what the cohort has actually committed. */
const DRY_RUN = {
  examined: 7,
  exit: 0,
  lines: 683,
  sent: false,
  where: 'read-only inside accelerator-backend, against every real agent ticket and every real '
    + 'intern repository',
  rows: [
    ['Ellis', 'qninying/platform-reliability-agent', 53, 6],
    ['Maru', 'MihretColaberry1/ColaberryInternship', 58, 6],
    ['Ava', 'sainisarbjit83-ai/Colaberry_Marketing_Agent', 9, 6],
    ['Maya', 'Kalkidan2129/admissions', 7, 4],
    ['Dara', 'rtkumera/AI-Agent-Project', 5, 2],
    ['Pip', 'tashdiah-Data/ai-project', 6, 1],
    ['Vic', 'vessette/Simple', 5, 0],
  ],
  total: 6,
  note: 'Every repo readable, every ticket title matched the convention, nothing errored. Two '
    + 'rows deserve attention independently of this ticket: Victoria has produced NO Release 0 '
    + 'documents, and Ruth has produced two.',
};

/** NOT a decision this code may take. Posting is a Basecamp write as Ali, to seven tickets. */
const NOT_POSTED = {
  state: 'The runner is DRY unless --send, there is NO cron entry, and nothing has been posted.',
  why: 'Posting is a Basecamp write as Ali to seven interns\' tickets, and a posted comment '
    + 'CANNOT be retracted by this code -- nothing in this repo edits or deletes a comment. '
    + 'Recovery from a bad run is a human deleting comments by hand across seven tickets.',
  why2: 'Registering a schedule would have been worse than asking: it would start the posting '
    + 'automatically on the next deploy, smuggling the approval through a deploy.',
};

/** The pagination hazard is live, not theoretical, and it has already caused a real incident. */
const PAGINATION = {
  fact: 'comments.json returns the OLDEST 15. Ellis\'s ticket carries 53 comments and Maru\'s 58, '
    + 'so a dedup that read one page would be broken for both of them TODAY.',
  incident: 'That is exactly the failure that filed a duplicate on Ellis\'s ticket on 26 October '
    + 'and made the ticket sync post on every tick all afternoon. Neither job changed: the data '
    + 'grew into a bug that had been there since both were written.',
  fix: 'The injected bcGetAll follows the Link header. Tests pin that a fingerprint sitting at '
    + 'position 53 is still found, PLUS the exactly-full-page boundaries at 15 and 30 -- the case '
    + 'that ends the loop one page early.',
};

/** The fingerprint hashes status, not just content, and the reason names a known defect class. */
const FINGERPRINT = {
  trap: 'Hash content alone and a document that was present, was posted, and is then DELETED '
    + 'produces no new hash. So nothing posts, and the old excerpt stands on the thread as the '
    + 'current truth.',
  named: 'That is the AF2.7 / AF2.9 defect class by name: a surface that tells somebody something '
    + 'untrue, and the silent stale copy.',
  fix: 'Including status makes present-to-absent a fingerprint CHANGE, so it posts "this document '
    + 'is no longer in the repository". One tag PER PATH, so six documents cannot mask each other.',
};

module.exports = { TICKET, PR, MERGED_ON, CRITERIA, DRY_RUN, NOT_POSTED, PAGINATION, FINGERPRINT };
