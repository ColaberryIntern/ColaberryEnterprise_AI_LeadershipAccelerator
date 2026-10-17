/**
 * AF8.3's facts. Every one measured against PRODUCTION on 17 Oct 2026 with the interns' own
 * minted tokens, through the real hostname.
 *
 * The ticket forbids the alternative in as many words: "A runbook written from the ticket list
 * rather than from the running system... Ali is an admin and everything works for him, so his
 * own walkthrough proves nothing about what an intern sees. THIS IS THE SAME MISTAKE AS THE
 * /admin/projects CLAIM: inferring what a user can see from what the data looks like."
 *
 * Nothing below is sourced from a Basecamp ticket status.
 */

const MEASURED_ON = '17 October 2026';
const KICKOFF = 'Monday 19 October 2026';
const SEV = { ok: '#2f7d32', watch: '#b26a00', bad: '#b3261e', ink: '#2d3748' };

const V = {
  WORKS: { key: 'WORKS', label: 'Verified live', color: SEV.ok },
  EMPTY: { key: 'EMPTY', label: 'Loads, but empty', color: SEV.watch },
  MISSING: { key: 'MISSING', label: 'Not built', color: SEV.bad },
  HELD: { key: 'HELD', label: 'Held', color: SEV.bad },
};

/** Per-intern walkthrough. `own`/`foreign`/`myDomain` are HTTP statuses from production. */
const WALKTHROUGH = [
  { name: 'Sarbjit Kaur', domain: 'marketing', role: 'marketing',
    sections: 'dashboard, campaigns, brands', own: 200, foreign: '403 x3', myDomain: 200, rows: 1 },
  { name: 'Quincy Nkwain Ninying', domain: 'platform', role: 'platform',
    sections: 'dashboard, system', own: 200, foreign: '403 x3', myDomain: 200, rows: 1 },
  { name: 'Kalkidan Bezabeh', domain: 'admissions', role: 'lead_intake',
    sections: 'dashboard, lead_ingestion', own: 200, foreign: '403 x4', myDomain: 200, rows: 1 },
  { name: 'Tashima Diah', domain: 'internship', role: 'internship_review',
    sections: 'dashboard, internship', own: 200, foreign: '403 x3', myDomain: 200, rows: 1 },
  { name: 'Victoria Spencer-Auber', domain: 'sales', role: 'revenue',
    sections: 'dashboard, revenue, leads', own: 200, foreign: '403 x3', myDomain: 200, rows: 1 },
  { name: 'Mihret Netsereab', domain: 'product_experience', role: 'product_experience',
    sections: 'dashboard, brands', own: 200, foreign: '403 x4', myDomain: 200, rows: 1 },
];

const RUTH = {
  name: 'Ruth Kumera', domain: 'curriculum',
  state: 'Not granted. Held by AF6.2, which is undecided. Her row has been read in every run of '
    + 'this work and written by none of them.',
};

/** What an intern can actually do on Monday, each line traced to a measurement. */
const READINESS = [
  {
    item: 'Sign in and reach their own department surface',
    verdict: V.WORKS,
    evidence: 'All 6 return HTTP 200 on their own surface, called with their own minted token '
      + 'through enterprise.colaberry.ai.',
  },
  {
    item: 'Be refused every other intern’s surface',
    verdict: V.WORKS,
    evidence: '0 cross-intern leaks across 20 foreign probes. Every one 403.',
  },
  {
    item: 'Open the My Domain page',
    verdict: V.WORKS,
    evidence: 'Was 403 for all 6, then reachable-but-empty, now correct. Each of the six returns '
      + 'exactly ONE domain and it is their own - marketing, platform, admissions, internship, '
      + 'sales, product_experience. Read from the response body after the 17 Oct deploy.',
  },
  {
    item: 'Talk to their agent (AF2.2)',
    verdict: V.MISSING,
    evidence: 'Not built. The ticket has no work against it.',
  },
  {
    item: 'Work from their own public repo (AF4.1)',
    verdict: V.MISSING,
    evidence: 'Not built. Separately, GitHub tokens on this platform are empty strings and '
      + 'syncable repos number 0.',
  },
  {
    item: 'Ruth Kumera starts at all',
    verdict: V.HELD,
    evidence: 'AF6.2 undecided. Not routed around.',
  },
];

/**
 * The finding that decides the shape of Monday. Kept separate from READINESS because it is not
 * a missing feature, it is a working feature that shows nothing.
 */
const EMPTY_PAGE = {
  what: 'FIXED 17 Oct. My Domain was reachable and EMPTY for all six interns.',
  why: '`-mine` resolves the caller against `org_members` for the Agent Factory org - owner '
    + 'scoping by ACCOUNTABLE MANAGER. The interns are recorded as `intended_builder`, which is '
    + 'a plain text name on `agent_domain_projects` with no foreign key to anything. So the '
    + 'query asks a question their records cannot answer.',
  measured: 'Was resolved_identities=0, domains=0 for all six. Now domains=1 each, and each is '
    + 'their own. Read from the response body both times, never inferred from the 200.',
  knownSince: 'AF2.4 recorded this limit when the resolver was written: "Intern-facing scoping '
    + 'is NOT solved. Owner scoping is by accountable manager; intended_builder is a plain name '
    + 'with no foreign key." It was carried forward and is now the thing standing between an '
    + 'intern and a useful page.',
  fix: '`-mine` now answers for the accountable MANAGER and the intended BUILDER, de-duplicated. '
    + 'The builder match is guarded: the caller is resolved from their verified token, the name '
    + 'compared is the one the platform holds, and an email matching more than one member row '
    + 'returns NOTHING rather than guessing. All seven builders resolve uniquely today; the '
    + 'guard is for the eighth.',
  options: [
    ['Match `intended_builder` by name as well as by manager', 'Smallest change, and it works: '
      + 'all 7 names resolve to exactly one community_members row today. It is still name '
      + 'matching, which is what produced the AF2.6 false blocker, so it needs a uniqueness '
      + 'assertion in the query rather than a hope.'],
    ['Give `agent_domain_projects` a real builder foreign key', 'Correct and durable. A schema '
      + 'change, so it is a governance decision and not a Saturday job.'],
    ['Ship Monday without it', 'The department tabs - the actual promise from the call - work. '
      + 'My Domain would be a page that loads and says nothing, which is worse than not linking '
      + 'to it at all.'],
  ],
};

const GO_NO_GO = {
  verdict: 'PARTIAL GO',
  headline: 'The access half of Monday is finished and verified end to end. The agent half is '
    + 'not built.',
  go: 'Run the kickoff on what is verified: six interns sign in, reach their own department, see '
    + 'their own domain on My Domain, and are refused everyone else’s. Walked through '
    + 'production with their own tokens after the final deploy, not assumed.',
  noGo: 'Do not promise the agent console or the intern repos on Monday. Neither exists, and '
    + 'neither is a Saturday build.',
  tellThem: 'Say plainly that day one is department access, that the agent console and the repos '
    + 'come next, and give a date only for what is built. Seven people will otherwise spend '
    + 'Monday looking for a surface that is not there.',
  owner: 'Ali. The go / no-go is his and this document is the evidence for it.',
};

const COUNTS = {
  interns: WALKTHROUGH.length,
  ownOk: WALKTHROUGH.filter((w) => w.own === 200).length,
  leaks: 0,
  foreignProbes: 20,
  myDomainReachable: WALKTHROUGH.filter((w) => w.myDomain === 200).length,
  myDomainEmpty: WALKTHROUGH.filter((w) => w.rows === 0).length,
  ready: READINESS.filter((r) => r.verdict === V.WORKS).length,
  notReady: READINESS.filter((r) => r.verdict === V.MISSING || r.verdict === V.HELD).length,
};

const ASKED = 'A single page that says whether Monday can go ahead, what each intern will see, '
  + 'and what is not ready.';
const DELIVERED = 'Six walkthroughs performed against production with the interns’ own '
  + 'tokens, one blocker found and fixed today, one more found and not fixed, and a stated '
  + 'partial go.';
const HEADLINE = `${GO_NO_GO.verdict}. Access is COMPLETE and verified for all ${COUNTS.interns} - `
  + 'department, scoping and My Domain. The agent console and the intern repos do not exist.';

module.exports = {
  MEASURED_ON, KICKOFF, SEV, V, WALKTHROUGH, RUTH, READINESS, EMPTY_PAGE, GO_NO_GO, COUNTS,
  ASKED, DELIVERED, HEADLINE,
};
