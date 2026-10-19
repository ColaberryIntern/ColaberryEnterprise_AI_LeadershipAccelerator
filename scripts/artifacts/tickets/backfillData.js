/**
 * The six tickets worked before the artifact rule existed, with the facts each one established.
 *
 * Ali, 15 Oct: every task produces a visual artifact and at least one document. These six were
 * delivered as pull requests and session-log entries, which the rule now says are evidence rather
 * than artifacts. This module is the backfill's single source: `backfillDocument.js` and
 * `backfillVisual.js` both read it, so the PDFs for one ticket cannot disagree with each other.
 *
 * Every figure was measured against production between 11 and 15 October 2026. Where a figure was
 * stated wrongly at the time and corrected later, the CORRECTED value is here and the correction
 * is kept visible in `corrections` rather than quietly overwritten -- a backfill that silently
 * tidies away its own mistakes is worth less than no backfill.
 */

const SEV = { ok: '#2f7d32', watch: '#b26a00', bad: '#b3261e', ink: '#2d3748' };
const PR = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/';

const TICKETS = [
  {
    code: 'AF2.4',
    ticketId: 10406234000, // verified against the live list
    slug: 'AF24_OWNER_SCOPED_DOMAINS',
    title: 'Owner-scoped retrieval of the ten domain projects',
    folder: '02 - Intern Management Portal and Access',
    pr: `${PR}3100`,
    prLabel: '#3100',
    asked: 'Make the ten provisioned domain projects reachable by the person accountable for '
      + 'each one.',
    delivered: 'Two routes and a database-backed owner-scoped reader, plus the measurement that '
      + 'showed why nothing was reachable before.',
    headline: 'The ten projects were provisioned and NO PAGE SHOWED THEM.',
    takeaway: [
      ['The defect was not a missing row, it was a missing join.', '<code>/admin/projects</code> '
        + 'walks cohorts to enrollments to projects. All ten domain projects belong to one '
        + 'ai_staff enrollment whose <code>cohort_id</code> is NULL, so the page asks a question '
        + 'their rows cannot answer. Being an ordinary projects row is necessary and not '
        + 'sufficient.'],
      ['Owning nothing returns an empty list, never the full set.', 'The scoping branch returns '
        + 'early on an empty roster. Treating "no filter" as "no restriction" is how a scoping '
        + 'bug becomes a disclosure.'],
      ['Every scoping test uses a NON-ADMIN token.', 'Ali holds every section, so an '
        + 'admin-token test would pass whether or not the scoping worked.'],
    ],
    metrics: [
      { label: 'Domain projects provisioned', value: 10, color: SEV.ink },
      { label: 'With a cohort_id', value: 0, color: SEV.bad },
      { label: 'Visible at /admin/projects', value: 0, color: SEV.bad },
      { label: 'Tests added', value: 28, color: SEV.ok },
    ],
    mermaid: `graph LR
  P["/admin/projects"] --> C["cohorts"]
  C --> E["enrollments"]
  E --> PR2["projects"]
  D["the 10 domain projects"] -.->|"cohort_id IS NULL"| X["never reached"]
  PR2 --> V["rendered"]
  style X fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style V fill:#f3f9f3,stroke:#2f7d32,color:#2d3748
  style D fill:#FFF0F1,stroke:#FB2832,color:#2d3748`,
    mermaidCaption: 'The page walks a path the ten projects are not on. The rows were always '
      + 'correct; the query never asked for them.',
    corrections: [
      'I first reported these as visible at <code>/admin/projects</code>. That was false and was '
      + 'retracted with the query that disproves it.',
    ],
    notEstablished: [
      'Intern-facing scoping is NOT solved. Owner scoping is by accountable manager; '
      + '<code>intended_builder</code> is a plain name with no foreign key, and two interns have '
      + 'duplicate enrollment rows.',
      'The routes are deployed and guarded (all seven answer 401, not 404) but no intern has '
      + 'used them.',
    ],
  },

  {
    code: 'AF2.6',
    ticketId: 10406234022, // verified against the live list
    slug: 'AF26_ADMISSIONS_ACCESS',
    title: 'Admissions access: the finding, not the fix',
    folder: '02 - Intern Management Portal and Access',
    pr: `${PR}3100`,
    prLabel: '#3100',
    asked: 'Map the admissions admin prefix into the section gate and give Taiwo a scoped login.',
    delivered: 'Neither, because the premise was wrong. Taiwo is not blocked and never was, and '
      + 'mapping the prefix would have changed nothing for anybody.',
    headline: "The ticket's premise was wrong. Taiwo has held an admin login since 18 September.",
    takeaway: [
      ['An EMAIL MISMATCH produced the false blocker.', 'His <code>org_members</code> row carries '
        + 'a personal address while he signs in with the work one, so matching org_members.email '
        + 'against admin_users.email found nothing, and that read as "no login". The reliable '
        + 'link is <code>org_members.enrollment_id</code>, a real foreign key.'],
      ['The other half of the ticket was also void.', 'All nine admissions routes carry '
        + '<code>requireAdmin</code>, not <code>requireSection</code>, so mapping a prefix into '
        + 'the section gate would have changed access for nobody. There is also no admissions '
        + 'SECTION KEY to map to.'],
      ['Reachability moved from 6 of 10 to 7 of 10.', 'Corrected across the registry, the ADR, '
        + 'nine assertions, the handoff and the master index. The remaining three were re-checked '
        + 'against BOTH addresses and are real.'],
    ],
    metrics: [
      { label: 'Domains reachable by their owner', value: 7, color: SEV.ok },
      { label: 'Genuinely blocked', value: 3, color: SEV.bad },
      { label: 'Admissions routes using requireAdmin', value: 9, color: SEV.ink },
      { label: 'org_members rows with enrollment_id', value: 29, color: SEV.ok },
    ],
    mermaid: `graph TD
  Q["Is Taiwo blocked?"] --> M1["match org_members.email<br/>to admin_users.email"]
  M1 -->|"no row"| F["reported BLOCKED"]
  Q --> M2["follow org_members.enrollment_id<br/>to enrollments.email"]
  M2 -->|"taiwo@colaberry.com, role admin"| T["NOT blocked"]
  style F fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style T fill:#f3f9f3,stroke:#2f7d32,color:#2d3748`,
    mermaidCaption: 'Two ways to ask the same question. One matches on a string people change, '
      + 'the other follows a foreign key.',
    corrections: [
      'I asserted in FOUR places that Taiwo had no <code>admin_users</code> row. He has one, '
      + 'role <code>admin</code>, created 18 September.',
    ],
    notEstablished: [
      'Three owners remain genuinely unreachable: Kes, Aleem and Roselen. Each has an '
      + '<code>org_members</code> row and no admin login.',
      'Nothing was granted to anybody. This ticket produced a correction, not an access change.',
    ],
  },

  {
    code: 'AF2.1',
    ticketId: 10406234104, // verified against the live list
    slug: 'AF21_MY_DOMAIN',
    title: 'My Domain, and the entry point that already existed',
    folder: '02 - Intern Management Portal and Access',
    pr: `${PR}3110`,
    prLabel: '#3110',
    asked: 'An intern management portal entry point, and a surface showing the domain they own.',
    delivered: 'The surface, at <code>/admin/my-domain</code>. The entry point was already built '
      + 'and shipped, which the ticket did not know.',
    headline: '503 stories exist and NONE has been started, so the page must not imply progress.',
    takeaway: [
      ['The entry point was already there.', 'PortalShell renders a Management Portal link under '
        + 'an Employee nav group, gated on holding a management role, pointing at a bridge that '
        + 'mints a scoped admin token. That is what was demonstrated on the 14 October call.'],
      ['The real constraint is honesty, not layout.', '<code>stories_verified</code> and '
        + '<code>build_authorizations</code> sit beside the story count ALWAYS, and the '
        + "server's own disclosure sentence renders verbatim."],
      ['A test reads the page’s own source and fails if any figure or domain name is '
        + 'hardcoded.', 'Loading, failed and owns-nothing are three distinct states, so "not '
        + 'yours" can never look like "broken".'],
    ],
    metrics: [
      { label: 'Stories provisioned', value: 503, color: SEV.ink },
      { label: 'Stories verified', value: 0, color: SEV.bad },
      { label: 'Build authorizations', value: 0, color: SEV.bad },
      { label: 'Tests added', value: 12, color: SEV.ok },
      { label: 'Tests across admin nav and RBAC', value: 168, color: SEV.ok },
    ],
    mermaid: `graph LR
  A["Portal sign-in"] --> B["Employee nav group<br/>(already shipped)"]
  B --> C["Bridge mints a<br/>scoped admin token"]
  C --> D["/admin/my-domain<br/>(built by this ticket)"]
  D --> E["Their domain, with<br/>0 verified shown beside 503"]
  style B fill:#f7fafc,stroke:#e2e8f0,color:#718096
  style D fill:#FFF0F1,stroke:#FB2832,color:#2d3748`,
    mermaidCaption: 'Gray was already built. Only the last two steps were this ticket.',
    corrections: [],
    notEstablished: [
      'NOT DEPLOYED. There are no production screenshots, so that acceptance criterion is unmet.',
      'The page shows the domain a MANAGER owns. Intern-facing scoping is AF2.3.',
    ],
  },

  {
    code: 'AF3.2',
    ticketId: 10406234042, // verified against the live list
    slug: 'AF32_AGENT_COUNT',
    title: 'Agent count reconciliation',
    folder: '03 - The Ten Agents and Release Zero',
    pr: `${PR}3105`,
    prLabel: '#3105',
    asked: 'Reconcile the agent count before it is quoted anywhere.',
    delivered: 'The measured fleet, the finding that 217 is not reproducible, and a recommended '
      + 'replacement claim.',
    headline: '"217" is not reproducible by any filter. The fleet was exactly 217 for about '
      + 'EIGHT MILLISECONDS.',
    takeaway: [
      ['Eight single-column filters were tested and none yields 217.', 'Row 216 landed at '
        + '15:10:05.860 on 13 August, row 217 at .865 and row 218 at .873, mid bulk-seed. The '
        + 'nearest filter is <code>agent_group IS NULL</code> at 216: one off, tempting, and not '
        + 'an explanation.'],
      ['257 overstates the working fleet by about 40 per cent.', '82 agents are disabled and 105 '
        + 'have never executed once.'],
      ['Change the claim, not the number.', '"217 down to 10" becomes "152 that have ever done '
        + 'anything, down to 10".'],
    ],
    metrics: [
      { label: 'Rows in ai_agents', value: 257, color: SEV.ink },
      { label: 'Enabled', value: 175, color: SEV.watch },
      { label: 'Have EVER executed', value: 152, color: SEV.ok },
      { label: 'Above autonomy "observe"', value: 2, color: SEV.bad },
    ],
    mermaid: `graph LR
  A["257 rows<br/>in ai_agents"] --> B["175 enabled"]
  B --> C["152 have ever<br/>executed anything"]
  C --> D["2 above<br/>observe"]
  A -.->|"82 disabled"| X1["never counted"]
  B -.->|"105 never ran"| X2["never counted"]
  style C fill:#FFF0F1,stroke:#FB2832,color:#2d3748
  style X1 fill:#f7fafc,stroke:#e2e8f0,color:#718096
  style X2 fill:#f7fafc,stroke:#e2e8f0,color:#718096`,
    mermaidCaption: 'Execution was measured in ai_agent_activity_logs (4,470,103 rows), not in '
      + 'agent_runs, which holds 2 rows and is vestigial.',
    corrections: [],
    notEstablished: [
      'The interns were told 217 on the 14 October call. That has not been corrected to them.',
      'AF8.1 stays BLOCKED until the framing is chosen, and any external use needs a Claim '
      + 'Registry row.',
    ],
  },

  {
    code: 'AF6.4',
    ticketId: 10406234560, // verified against the live list
    slug: 'AF64_REPORTS_TO_HUMAN',
    title: 'Agents can no longer be given a human who does not exist',
    folder: '06 - Owner Decisions and Blockers',
    pr: `${PR}3117`,
    prLabel: '#3117',
    asked: 'setAgentReportsTo does not check that the human it is given exists.',
    delivered: 'A write-path check, a test pinning the resolver as deliberately unchanged, and '
      + 'the measurement showing this repairs nothing and prevents something.',
    headline: 'This closes a LATENT hole and repairs no existing damage. All 10 human targets '
      + 'resolve; zero dangle.',
    takeaway: [
      ['The asymmetry was the bug.', 'An <code>agent</code> target was validated with a real '
        + 'lookup and returned null when dangling. A <code>human</code> target was RETURNED AS '
        + 'GIVEN with no lookup, so the guard rejected only an empty string.'],
      ['Fixed on the write path, deliberately NOT in the resolver.', 'The resolver is also the '
        + 'read path for the live ticket-creation gate; a lookup there would start refusing '
        + 'ticket creation for any agent whose chain already ends at a missing human. A test '
        + 'asserts the resolver stays clean.'],
      ['Said plainly because the alternative would be a claim about rows that do not exist.',
        '"We fixed the dangling reports_to" would be false. Nothing was dangling.'],
    ],
    metrics: [
      { label: 'Agents with a human target', value: 10, color: SEV.ink },
      { label: 'That resolve', value: 10, color: SEV.ok },
      { label: 'Dangling', value: 0, color: SEV.ok },
      { label: 'Agents with ANY reports_to', value: 27, color: SEV.bad },
    ],
    mermaid: `graph TD
  W["setAgentReportsTo"] --> T{"target type"}
  T -->|"agent"| A["lookup, null if missing"]
  T -->|"human (before)"| H1["returned the id as given"]
  T -->|"human (now)"| H2["OrgMember.findByPk,<br/>refuse if missing"]
  style H1 fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style H2 fill:#f3f9f3,stroke:#2f7d32,color:#2d3748`,
    mermaidCaption: 'The same function validated one branch and trusted the other.',
    corrections: [],
    notEstablished: [
      'THE BIGGER FINDING IS NOT FIXED. 165 enabled agents have no reports_to at all; 126 of them '
      + 'have executed, 3,233,076 runs between them, led by visitor_tracker at 1,201,301. Only '
      + '27 of 257 agents have any reports_to. Ticketed as AF6.6.',
    ],
  },

  {
    code: 'AF7.2',
    ticketId: 10406234280, // verified against the live list
    slug: 'AF72_SIX_REGRADES',
    title: 'Six independent re-grades, and what they found',
    folder: '07 - Capability Validation and Promotion',
    pr: `${PR}3120`,
    prLabel: '#3120',
    asked: 'Re-grade the six tasks remediated after the audit.',
    delivered: 'Six independent verdicts, each gathering its own evidence rather than reading my '
      + 'account of the remediation. Four of the six failed; three are now fixed.',
    headline: 'Four of six remediations FAILED re-grading, and two scored zero on "no '
      + 'fabrication".',
    takeaway: [
      ['T07 was a live promotion bypass, now closed.', 'The recorded-human allowlist was applied '
        + 'to the approver and never to the THRESHOLD ACCEPTOR. Ten identities promoted with zero '
        + 'refusals, including <code>auto-approval</code>, one letter off the production timer, '
        + 'and <code>Mallory</code>, whom the module already refuses as an approver on exactly '
        + 'the grounds a denylist cannot establish humanity.'],
      ['T14 was a reproduced cross-tenant WRITE, now closed.', 'The reconcile UPDATE had no '
        + 'tenant predicate while the unique index is on (tenant_id, domain_key), so it reached '
        + 'every tenant holding that key and destroyed their measured blocker. Proved fixed '
        + 'against a real Postgres with a control showing the old statement does clobber.'],
      ['T09 was a false claim repeated in four places.', '"The ONLY one of 106 ensure* files '
        + 'whose post-condition throws" — there are 110 files, five throw, and mine was the only '
        + 'GUARDED one. The test proving uniqueness passed on a whitespace artifact.'],
      ['T06 is STILL OPEN.', 'The risk-tier guard has zero production callers, never reads the '
        + 'list it claims to enforce, fails open on " autonomy:R7" and "autonomy:r7", and its '
        + 'predicate refuses the legitimate stored value.'],
    ],
    metrics: [
      { label: 'T08 scenario coverage', value: 12, color: SEV.ok },
      { label: 'T11 circuit breaker', value: 12, color: SEV.ok },
      { label: 'T07 promotion identity', value: 9, color: SEV.watch },
      { label: 'T14 tenant scoping', value: 8, color: SEV.watch },
      { label: 'T09 boot guard', value: 7, color: SEV.bad },
      { label: 'T06 risk tier', value: 7, color: SEV.bad },
    ],
    metricMax: 12,
    metricUnit: ' / 12',
    mermaid: `graph LR
  R["6 remediations<br/>re-graded"] --> P["2 PASS<br/>T08, T11"]
  R --> F["4 FAIL"]
  F --> FX["3 fixed in #3120<br/>T07, T09, T14"]
  F --> FO["1 still open<br/>T06"]
  style P fill:#f3f9f3,stroke:#2f7d32,color:#2d3748
  style FX fill:#fff8e6,stroke:#b26a00,color:#2d3748
  style FO fill:#fdf3f2,stroke:#b3261e,color:#2d3748`,
    mermaidCaption: 'Each verdict is out of 12. Two scored zero on criterion 6, which is '
      + '"no fabrication".',
    corrections: [],
    notEstablished: [
      'T06 IS NOT FIXED. It needs wiring at a real write boundary, must consult '
      + '<code>RISK_TIER_BEARING_MODELS</code>, must normalize case and whitespace, and must stop '
      + 'refusing the legitimate <code>R0</code>&ndash;<code>R5</code> values.',
      'T14 still owes a committed regression test. The fix was proved with a standalone probe '
      + 'after three failed attempts to land the test against the integration fixtures.',
    ],
  },
];

const MEASURED_ON = '15 October 2026';

module.exports = { TICKETS, MEASURED_ON, SEV };
