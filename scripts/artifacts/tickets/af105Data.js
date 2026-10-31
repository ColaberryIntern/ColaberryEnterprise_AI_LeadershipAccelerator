/**
 * AF10.5's facts: one roster, keyed on the sign-in email, read by all three scripts.
 *
 * Data only, no rendering. Taken from the merged PR #3320 and the ticket's own wording.
 *
 * The interesting part of this ticket is not the roster. It is that running the resolver against
 * production BEFORE wiring anything to it overturned two assumptions, one of which was a bug
 * about to ship.
 */
const TICKET = 'AF10.5';
const PR = 3320;
const MERGED_ON = '2026-10-23';

const ASKED = 'Ali, 20 Oct: "as more interns join, they will also have more interns / agents join '
  + 'this process so people will be added removed, etc..." One place that says who is building '
  + 'what, which everything else reads. Acceptance: adding one intern is one change in one place, '
  + 'and the email sweep, the sync and the report all pick them up without being edited.';

const DELIVERED = 'lib/agentRoster.js. The mail sweep, the Basecamp sync and the daily report all '
  + 'read it, so adding an intern is one repoint of one column and no script changes.';

/** No schema change was needed, and that is the finding rather than a convenience. */
const KEY = {
  chain: 'agent_domain_projects.student_project_id -> projects.enrollment_id -> enrollments.email',
  why: 'agent_domain_projects.student_project_id is already NOT NULL, so this was ALREADY the de '
    + 'facto key -- every script was using it by accident, through the join. Making it explicit '
    + 'is the whole change.',
  notTheName: 'intended_builder is a TEXT NAME, and in production "Sarbjit Kaur" matches TWO '
    + 'active enrollments: sarbjitsaini83@yahoo.com, which holds the marketing agent, and '
    + 'sarbjitsaini716@gmail.com, which holds nothing. A name-keyed lookup is a coin flip for '
    + 'her. The stored name is now DERIVED from the enrollment and reported when it disagrees, '
    + 'rather than trusted.',
};

/** Both assumptions in the first draft were wrong, and production said so before anything shipped. */
const OVERTURNED = [
  {
    title: 'The three "unstaffed" domains are not unowned',
    found: 'Executive, learner success and website all have projects belonging to '
      + 'reese@colaberry.com -- Colaberry staff -- with no intended_builder. So "has an '
      + 'enrollment behind it" and "has an intern on it" are different questions, and they are '
      + 'now answered separately as backed and assigned.',
    consequence: 'Routing mail on backed would have begun filing Reese\'s email onto three agent '
      + 'tickets. The old WHERE intended_builder IS NOT NULL prevented that by accident.',
  },
  {
    title: 'One address can hold several domains',
    found: 'Reese holds three. byEmail was a Map of email to ONE entry, which keeps whichever was '
      + 'iterated last and drops the rest without a word -- the exact silent collapse this module '
      + 'exists to stop.',
    consequence: 'It returns an ARRAY per address now, and ownerCollisions names anyone holding '
      + 'more than one.',
  },
];

/** Two scripts matched tickets by title regex and, on no match, printed a line and carried on. */
const QUIET_FAILURE = {
  was: 'On no match they printed one line into a cron log and carried on. An agent that stops '
    + 'being reported on looks exactly like an agent with nothing to report.',
  now: 'matchTickets returns the failures as DATA.',
  kinds: [
    ['ticket_for_unknown_domain', 'a ticket whose title names a domain the roster has never heard of'],
    ['assigned_domain_without_ticket', 'an intern whose agent has no ticket at all'],
    ['ticket_builder_disagrees', 'a reassignment finished in one place and not the other'],
  ],
  result: 'Against production it returns ZERO problems -- which is only worth anything because '
    + 'the tests prove it can say otherwise.',
};

const PROOF = 'All three scripts dry-run against production: the sweep found 7 routable '
  + 'addresses, matched 7 tickets, and reported 0 problems.';

module.exports = { TICKET, PR, MERGED_ON, ASKED, DELIVERED, KEY, OVERTURNED, QUIET_FAILURE, PROOF };
