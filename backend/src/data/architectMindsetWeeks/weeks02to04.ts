/**
 * architectMindsetWeeks/weeks02to04 — hand-authored scenarios for the Architect
 * Mindset curriculum type ("The Architect Time Machine"), Weeks 2 through 4.
 *
 * Each export is a pure AmScenario data object built on the same framework proven
 * by Week 0 and Week 1: only DATA changes. Keep this file pure DATA + TYPES —
 * no I/O, no model imports. Titles and principles are LOCKED (canonical §3) and
 * quoted verbatim.
 */

import type { AmScenario } from '../architectMindsetScenario';
import { AM_QUALIFICATION } from '../architectMindsetQualification';

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 2 — "Boundaries Create the Architecture"
// Second scored lesson. Stresses System scope, Tradeoff quality, Failure
// anticipation, and Governance & ownership.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK2_SCENARIO: AmScenario = {
  version: 'wk2.v1',
  week: 2,
  baseline: false,
  title: 'Boundaries Create the Architecture',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Responsibilities must be divided according to ownership, change, risk, data, authority, scaling, and failure containment.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the product sponsor',
    text: 'Just add a feature so the assistant can also submit IT tickets, update employee records, and send company-wide announcements. It\'s all the same assistant, so keep it in one place.',
  },
  initial_system: ['One assistant', 'One chat box', 'Three handy new capabilities'],
  first_decision: {
    prompt: 'It looks like one small addition to something that already works. What would you do first?',
    options: [
      { id: 'extend', label: 'Add the three capabilities to the existing assistant module.' },
      { id: 'wire', label: 'Wire the assistant directly into the IT, HR, and messaging systems.' },
      { id: 'guard', label: 'Put one permission check in front of the new write actions.' },
      { id: 'map', label: 'Map who owns each capability, how fast it changes, and how it fails.' },
      { id: 'poc', label: 'Prototype ticket creation first and see what breaks.' },
      { id: 'readonly', label: 'Keep answering read-only for now and defer the write actions.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: {
      people: 'Owners the one assistant now spans',
      information: 'Risk and change profiles hiding in one module',
      decisions: 'Boundary decisions the merge forces',
      operations: 'What one shared module couples together',
    },
    people: ['HR systems owner', 'IT service-desk lead', 'Internal communications', 'Security', 'Platform team', 'Employees'],
    information: [
      'Read-only question answering (low risk, changes rarely)',
      'Employee-record mutation (high risk, HR-owned, audited)',
      'Company-wide broadcast (irreversible reach, communications-owned)',
      'IT ticket creation (medium risk, workflow-owned)',
      'Three different change cadences in one deploy',
      'Three different blast radii behind one chat box',
    ],
    decisions: [
      'What authority each action requires',
      'Which actions must pause for human approval',
      'What one permission model must cover, and cannot',
      'Where a failure in one capability may spread',
      'Which capabilities may deploy independently',
    ],
    operations: [
      'One bug can take down all three capabilities',
      'One deployment blocks all three owners',
      'One outage stops record updates and announcements',
      'One permission model fits none of them correctly',
      'One on-call rotation owns three unrelated domains',
    ],
  },
  signature_reveals: [
    'One assistant was requested. The responsibilities inside it belonged to three different owners, changed at three different rates, and failed with three different blast radii.',
    'A single bug in the record-update path could silence every answer and every announcement in the company.',
    'One permission model was asked to fit reading a handbook and firing a company-wide message. It could fit neither.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'The request called this "all the same assistant." What is it actually?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'front', label: 'One interface in front of three different systems, owners, and risk levels.' },
        { id: 'rw', label: 'A read capability and two write capabilities that fail very differently.' },
        { id: 'feature', label: 'A single feature, just with a few more buttons.' },
        { id: 'shared', label: 'Three responsibilities that happen to share a chat box.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What assumption in "keep it in one place" created the greatest risk?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'perms', label: 'That one permission model could safely cover reading and mutating records.' },
        { id: 'release', label: 'That three capabilities owned by three teams could share one release.' },
        { id: 'simpler', label: 'That combining them was simpler than separating them.' },
        { id: 'guardrails', label: 'That a low-risk answer and an irreversible broadcast deserved the same guardrails.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'Once the responsibilities are separated, who should own each one?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'by_domain', label: 'HR owns record mutation, IT owns ticketing, Comms owns broadcast; the platform operates the shared surface.' },
        { id: 'platform', label: 'The team that built the assistant owns all three end to end.' },
        { id: 'shared', label: 'A shared platform owner with a named decision-maker per capability.' },
        { id: 'by_risk', label: 'Follow the risk: the highest-risk capability gets a dedicated owner, the rest stay shared.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'Which owner\'s perspective most changes how you would draw the boundaries?', mode: 'single', dimension: 'stakeholder_awareness',
      options: [
        { id: 'security', label: 'Security: the write actions cross a trust boundary the read path never did.' },
        { id: 'comms', label: 'Internal communications: a company-wide message cannot be un-sent.' },
        { id: 'hr', label: 'The HR systems owner: employee records carry audit and compliance duties.' },
        { id: 'itsd', label: 'The IT service-desk lead: ticket volume and routing change week to week.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Knowing the three responsibilities have different owners, risks, and change rates, which architecture do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'monolith', label: 'Keep one assistant module that does all three.' },
        { id: 'bounded', label: 'Split into bounded services by owner and risk.' },
        { id: 'gateway', label: 'One assistant front end, separate capability services behind an authorization gateway.' },
        { id: 'phased', label: 'Phase it: isolate the high-risk record-mutation path first.' },
        { id: 'custom', label: 'I propose my own boundary map, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When the merged assistant failed, what was the most important thing the original request missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'blast', label: 'That one bug would take down all three capabilities at once.' },
        { id: 'authority', label: 'That reading and mutating records needed different authority, not one login.' },
        { id: 'cadence', label: 'That three owners changing on three schedules could not share one deploy.' },
        { id: 'irreversible', label: 'That an irreversible broadcast needed containment a read path never did.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Capabilities down from one bug', value: '3 of 3', trend: 'up' },
      { label: 'Question answering during the incident', value: 'unavailable', trend: 'down' },
      { label: 'Independent deploys possible', value: '0', trend: 'flat' },
      { label: 'Owners blocked by one release', value: '3', trend: 'up' },
      { label: 'Permission model fit', value: 'none of three', trend: 'down' },
      { label: 'Mean time to isolate the fault', value: '6.5 hrs', trend: 'up' },
    ],
    horizon: [
      { point: 'One assistant ships', risk: 12, note: 'All three capabilities work in the demo.' },
      { point: 'First week live', risk: 26, note: 'Three owners each want a change on a different schedule.' },
      { point: 'First record-path bug', risk: 66, note: 'A bug in record updates takes question answering down with it.' },
      { point: 'First bad broadcast', risk: 84, note: 'A wrong company-wide message cannot be recalled; the shared deploy is frozen.' },
      { point: 'Employee-record audit', risk: 78, note: 'One permission model cannot show who was allowed to change what.' },
      { point: 'Scaling the read path', risk: 58, note: 'Scaling answers means scaling the risky write actions too.' },
      { point: 'Long-term operation', risk: 46 },
    ],
    reveal: 'A single bug in the record-update path took down question answering for the whole company, because all three capabilities shared one module, one deploy, and one failure domain.',
    lesson: 'The three capabilities had different owners, change rates, risks, and blast radii. Collapsing them into one place did not simplify the system; it coupled three failure domains into one. Boundaries drawn by ownership, change, and risk are what let each part fail, change, and scale on its own.',
  },
  rearchitecture: {
    prompt: 'You have seen a records bug silence the whole assistant. Draw the boundaries you would recommend, defend where each one goes, and name the single most important thing the one-place request missed.',
  },
  receipt: {
    counts: [
      { label: 'responsibility domains fused', value: '3' },
      { label: 'distinct owners', value: '3' },
      { label: 'failure blast radii', value: '3' },
      { label: 'change cadences', value: '3' },
      { label: 'role perspectives', value: '6' },
      { label: 'boundary tradeoffs weighed', value: '5' },
      { label: 'containment incidents simulated', value: '4' },
      { label: 'redesign', value: '1' },
    ],
    represented_hours: 3400,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-002 — Draw the System Boundaries by Ownership and Change',
    fields: ['context', 'responsibility_domains', 'boundary_criteria', 'ownership_map', 'authority_model', 'failure_containment', 'change_cadence', 'coupling_accepted', 'alternatives', 'tradeoffs', 'evidence_that_would_change_the_decision', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'Where in your own project have you collapsed different owners, risks, or change rates into one module?',
      'Draw one boundary you now need: what goes on each side, who owns it, and what failure it would contain?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 3 — "Design for Failure Before Success"
// Third scored lesson. Failure anticipation is primary; also System scope,
// Tradeoff quality, and Governance & ownership.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK3_SCENARIO: AmScenario = {
  version: 'wk3.v1',
  week: 3,
  baseline: false,
  title: 'Design for Failure Before Success',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'A successful demonstration proves the happy path once; architecture determines what happens during partial failure, retries, duplication, timeout, and recovery.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the executive sponsor',
    text: 'The assistant worked perfectly in the demo. Just turn it on for all 4,000 employees on Monday.',
  },
  initial_system: ['A demo that worked perfectly', 'Four thousand employees', 'A Monday go-live'],
  first_decision: {
    prompt: 'The demo proved one request on a good day. What would you do first before Monday?',
    options: [
      { id: 'ship', label: 'Turn it on for everyone Monday and fix issues as they appear.' },
      { id: 'harden', label: 'Add timeouts, capped retries, and idempotency keys first.' },
      { id: 'pilot', label: 'Launch to a small pilot cohort behind a circuit breaker.' },
      { id: 'runbook', label: 'Write the recovery runbook and dead-letter capture before launch.' },
      { id: 'loadtest', label: 'Load-test Monday-morning traffic before committing to the date.' },
      { id: 'enumerate', label: 'List every way one request can fail and design each behavior.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: {
      people: 'Who feels the failure',
      information: 'Failure modes production adds',
      decisions: 'Behaviors each failure demands',
      operations: 'What the demo never built',
    },
    people: ['SRE and ops', 'The service desk', 'Employees waiting on an answer', 'The model vendor', 'The platform team', 'The executive sponsor who chose Monday'],
    information: [
      'The model times out',
      'The document store is briefly unreachable',
      'Duplicate submissions from double-clicks',
      'A partial write: ticket created, never recorded',
      'Rate limits under Monday-morning load',
      'An evaluation service returns success with the wrong shape',
      'A retry re-runs a side effect',
    ],
    decisions: [
      'How long to wait before timing out',
      'How many times to retry, and with what backoff',
      'How to make a repeated submit safe (idempotency)',
      'When to stop calling a failing dependency (circuit breaker)',
      'Where un-processable work goes (dead-letter)',
      'Who is paged, and what the runbook says',
    ],
    operations: [
      'No timeout',
      'No capped retry',
      'No idempotency key',
      'No dead-letter capture',
      'No recovery runbook',
      'No fallback when the model is down',
    ],
  },
  signature_reveals: [
    'The demo succeeded once. Production would run the same operation forty thousand times a week, and every rare failure would become a daily event.',
    'A one-in-ten-thousand failure is invisible in a demo and happens four times a day at four thousand employees.',
    'The demo had no timeout, no capped retry, no idempotency key, and no way to recover. It proved the happy path and nothing else.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'What did the demo actually prove?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'once', label: 'That one request succeeds once, on a good day, with every dependency healthy.' },
        { id: 'ready', label: 'That the system is ready for four thousand employees on Monday.' },
        { id: 'happy', label: 'That the happy path works, and nothing about partial failure.' },
        { id: 'answer', label: 'That the model can answer, not that the system can recover.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What assumption in "just turn it on Monday" carried the most risk?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'scales', label: 'That a demo that worked once would keep working at scale.' },
        { id: 'rare', label: 'That rare failures were rare enough to ignore.' },
        { id: 'retry_safe', label: 'That a retry was always safe to run.' },
        { id: 'reachable', label: 'That the vendor and document store would always be reachable.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'When a request fails halfway on Monday, who owns the recovery?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'oncall', label: 'A named on-call owner with a written recovery runbook.' },
        { id: 'platform', label: 'The platform team during business hours, best-effort after.' },
        { id: 'servicedesk', label: 'The service desk triages and escalates to engineering.' },
        { id: 'shared', label: 'Shared ownership: ops runs recovery, the platform team owns the fix.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'What must you be able to see to know a failure even happened?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'dup', label: 'Whether a retry duplicated a side effect, traced by an idempotency key.' },
        { id: 'timeout', label: 'Which requests timed out, and whether they completed on retry.' },
        { id: 'deadletter', label: 'What landed in the dead-letter store, with enough context to replay it.' },
        { id: 'rate', label: 'The rolling failure rate, before a human complains.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Knowing production will run this forty thousand times a week, which reliability architecture do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'asis', label: 'Launch as-is Monday and fix issues as they appear.' },
        { id: 'hardened', label: 'Add timeouts, capped retries, and idempotency keys before launch.' },
        { id: 'breaker', label: 'Launch to a pilot cohort behind a circuit breaker with a manual fallback.' },
        { id: 'phased', label: 'Phase the rollout with dead-letter capture and a written recovery runbook.' },
        { id: 'custom', label: 'I propose my own reliability design, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When Monday morning went wrong, what was the most important thing the "just turn it on" request missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'idempotency', label: 'That duplicate submissions would create duplicate tickets without an idempotency key.' },
        { id: 'timeout', label: 'That a model timeout with no cap would stall the whole queue.' },
        { id: 'partial', label: 'That a partial write could create a ticket the system never recorded.' },
        { id: 'recovery', label: 'That there was no defined recovery path once retries were exhausted.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Duplicate tickets created', value: '1,240', trend: 'up' },
      { label: 'Requests stuck in the queue', value: '3,100', trend: 'up' },
      { label: 'Silent partial failures', value: '17%', trend: 'up' },
      { label: 'Model timeouts (no cap)', value: '8%', trend: 'up' },
      { label: 'Failures with a recovery path', value: '0%', trend: 'down' },
      { label: 'Mean time to recover', value: 'unknown', trend: 'flat' },
    ],
    horizon: [
      { point: 'Demo', risk: 8, note: 'One request succeeds perfectly.' },
      { point: 'Monday, 9:00 AM', risk: 34, note: 'Four thousand employees arrive at once; rate limits appear.' },
      { point: 'First duplicate storm', risk: 70, note: 'Double-clicks create duplicate tickets with no idempotency key.' },
      { point: 'Model timeout', risk: 86, note: 'Uncapped retries stall the queue; requests pile up silently.' },
      { point: 'Partial-write incident', risk: 80, note: 'A ticket is created but never recorded; no dead-letter capture.' },
      { point: 'Recovery attempt', risk: 62, note: 'No runbook exists; recovery is improvised.' },
      { point: 'Steady state after hardening', risk: 40 },
    ],
    reveal: 'By 9:15 Monday, double-clicks had created 1,240 duplicate tickets, an uncapped retry had stalled the queue, and a partial write had created tickets the system never recorded. Every one of those failures was rare in the demo and constant at four thousand employees.',
    lesson: 'The demo proved the happy path once. Production is defined by what happens during timeout, retry, duplication, partial failure, and recovery. Architecture is the set of behaviors you design for those moments, before success, not after the incident.',
  },
  rearchitecture: {
    prompt: 'You have seen Monday morning fail. Choose the reliability architecture you would ship, define the timeout, retry, idempotency, and recovery behavior for one operation, and name the single most important failure the original request ignored.',
  },
  receipt: {
    counts: [
      { label: 'happy-path demo', value: '1' },
      { label: 'failure modes production adds', value: '7' },
      { label: 'operations per week at scale', value: '~40,000' },
      { label: 'role perspectives', value: '6' },
      { label: 'reliability tradeoffs weighed', value: '4' },
      { label: 'major incidents simulated', value: '3' },
      { label: 'recovery behaviors defined', value: '6' },
    ],
    represented_hours: 3600,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-003 — Design the Failure Path Before the Happy Path',
    fields: ['context', 'operation', 'failure_modes', 'timeout_policy', 'retry_strategy', 'idempotency_key', 'circuit_breaker', 'dead_letter_handling', 'recovery_runbook', 'unhandled_failure_modes', 'alternatives', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to one operation in your own project.',
    questions: [
      'For one operation in your project: what happens if it fails, will it retry, and with what strategy?',
      'What is the recovery path when retries are exhausted, and which failure modes are you explicitly choosing not to handle?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 4 — "Every Convenience Creates Coupling"
// Fourth scored lesson. Tradeoff quality is primary; also System scope,
// Failure anticipation, and Governance & ownership.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK4_SCENARIO: AmScenario = {
  version: 'wk4.v1',
  week: 4,
  baseline: false,
  title: 'Every Convenience Creates Coupling',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Shortcuts and direct integrations create dependencies whose costs appear during change, scaling, migration, or failure.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the engineering lead',
    text: 'Just have the assistant read directly from the HR database so we don\'t have to build anything extra.',
  },
  initial_system: ['A direct database connection', 'The assistant', 'No extra work to build'],
  first_decision: {
    prompt: 'The direct connection is the fastest path today, and it saves two weeks. What would you do first?',
    options: [
      { id: 'connect', label: 'Point the assistant straight at the HR database and ship.' },
      { id: 'interface', label: 'Ask HR to publish a stable interface the assistant reads through.' },
      { id: 'replicate', label: 'Build a read model the assistant owns, fed from HR.' },
      { id: 'export', label: 'Take a scheduled, contracted export and cache it.' },
      { id: 'map', label: 'Map what the direct read couples you to before choosing.' },
      { id: 'copy', label: 'Start read-only against a copy, never the production HR database.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: {
      people: 'Owners the shortcut ties together',
      information: 'What the direct read couples you to',
      decisions: 'Coupling decisions hidden in the shortcut',
      operations: 'When the coupling cost arrives',
    },
    people: ['The HR database owner', 'The DBA', 'Security', 'The assistant team', 'Compliance', 'The future maintainer who will attempt a migration'],
    information: [
      'HR\'s table and column names',
      'HR\'s release and migration cadence',
      'HR\'s uptime and load limits',
      'HR\'s security and access boundary',
      'HR\'s data-classification rules',
      'Whatever HR changes without telling you',
    ],
    decisions: [
      'Whether a schema change may break the assistant',
      'Who may migrate, and who they must coordinate with',
      'Whether a read path is also a trust-and-access path',
      'How reads scale without hitting production HR',
      'Who owns the dependency at all',
    ],
    operations: [
      'At the first column rename',
      'At HR\'s next migration',
      'At the first load spike on the read path',
      'At the first security review of cross-team access',
      'At the first outage that now spans two systems',
    ],
  },
  signature_reveals: [
    'The direct connection saved two weeks of work and created a dependency that would cost six months at the first schema change.',
    'A convenient read path quietly became a trust-and-access path, and no one owned it.',
    'The coupling cost nothing today and arrived all at once at the first change, scale event, migration, or outage.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'What does the "direct read" actually connect the assistant to?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'everything', label: 'HR\'s schema, release cadence, uptime, and security boundary, all at once.' },
        { id: 'just_data', label: 'Just the data it needs, nothing more.' },
        { id: 'prod', label: 'Another team\'s production system, with no contract between them.' },
        { id: 'unowned', label: 'A dependency that spans two teams and is owned by neither.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What assumption in "so we don\'t have to build anything extra" carried the most risk?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'no_dep', label: 'That reading directly created no dependency worth designing.' },
        { id: 'stable', label: 'That HR\'s schema would stay stable.' },
        { id: 'read_only', label: 'That a read path was not also an access-and-trust path.' },
        { id: 'free', label: 'That the time saved now had no cost later.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'Who owns the dependency the direct connection creates?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'contract', label: 'A named owner governing a contract between the two teams.' },
        { id: 'split', label: 'HR owns the data; the assistant team owns the read path against a published interface.' },
        { id: 'changer', label: 'Whoever changes the schema owns notifying every reader.' },
        { id: 'shared', label: 'Shared ownership, with a documented interface as the boundary.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'What would tell you the coupling has become a liability?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'break', label: 'A routine HR migration silently breaks the assistant.' },
        { id: 'slow', label: 'HR reports its database slows whenever the assistant scales reads.' },
        { id: 'flag', label: 'A security review flags undocumented cross-team access.' },
        { id: 'blocked', label: 'HR cannot migrate without coordinating with a team it forgot depends on it.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Knowing the direct read couples you to HR\'s schema, uptime, and security, which integration architecture do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'direct', label: 'Read directly from the HR database (fastest now).' },
        { id: 'interface', label: 'Read through a stable, published interface owned by HR.' },
        { id: 'readmodel', label: 'Build an event-driven or replicated read model the assistant owns.' },
        { id: 'export', label: 'Consume a cached, contracted export refreshed on a schedule.' },
        { id: 'custom', label: 'I propose my own integration boundary, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When the coupling cost finally arrived, what was the most important thing the "just read it directly" request missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'schema', label: 'That a column rename in HR would break the assistant with no warning.' },
        { id: 'migration', label: 'That HR could no longer migrate without coordinating with the assistant.' },
        { id: 'trust', label: 'That a convenient read path had quietly become a trust-and-access path.' },
        { id: 'scale', label: 'That scaling the assistant\'s reads would hit HR\'s production database.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    horizon: [
      { point: 'Direct read ships', risk: 10, note: 'It works immediately and saved two weeks.' },
      { point: 'First weeks live', risk: 22, note: 'No visible cost; the dependency is invisible.' },
      { point: 'HR renames a column', risk: 68, note: 'The assistant breaks with no warning; no contract existed.' },
      { point: 'HR plans a migration', risk: 82, note: 'HR cannot migrate without coordinating with a reader it forgot about.' },
      { point: 'Read traffic scales', risk: 76, note: 'Assistant load degrades HR\'s production database.' },
      { point: 'Security review', risk: 64, note: 'An undocumented cross-team access path is flagged.' },
      { point: 'Long-term operation', risk: 48 },
    ],
    reveal: 'The direct connection cost nothing for months, then a routine HR column rename broke the assistant on a Tuesday, and HR discovered it could no longer migrate without coordinating with a team it never knew depended on it. The two weeks saved became six months of untangling.',
    lesson: 'The convenience was real, and so was the coupling it created. A shortcut integration borrows against the future: its cost is zero until the first change, scale event, migration, or outage, when it comes due all at once. Coupling is a decision to make deliberately, through a contract, not by convenience.',
  },
  rearchitecture: {
    prompt: 'You have seen the coupling cost come due. Choose the integration boundary you would recommend and defend it, and name the single most important cost the "just read it directly" request hid.',
  },
  receipt: {
    counts: [
      { label: 'convenient shortcut', value: '1' },
      { label: 'systems coupled', value: '2' },
      { label: 'teams entangled', value: '2' },
      { label: 'coupling surfaces (schema, uptime, security, scale)', value: '4' },
      { label: 'role perspectives', value: '6' },
      { label: 'integration options weighed', value: '4' },
      { label: 'change and migration events', value: '3' },
      { label: 'weeks saved vs. months spent', value: '2 vs. 6' },
    ],
    represented_hours: 3800,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-004 — Choose Coupling Deliberately, Not by Convenience',
    fields: ['context', 'convenience_chosen', 'coupling_created', 'integration_boundary', 'contract', 'ownership', 'change_impact', 'scaling_impact', 'migration_path', 'failure_isolation', 'alternatives', 'tradeoffs', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'Where has a shortcut or direct integration created a dependency in your own project?',
      'What will that dependency cost at the first change, scale event, or migration, and who owns it today?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};
