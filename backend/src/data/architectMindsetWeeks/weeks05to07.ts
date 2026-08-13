/**
 * architectMindsetWeeks/weeks05to07 — hand-authored scenario objects for the
 * Architect Mindset curriculum type ("The Architect Time Machine"), Weeks 5-7.
 *
 * Each export is a pure AmScenario on the same framework proven by WEEK0/WEEK1
 * in ../architectMindsetScenario. DATA + TYPES only — no I/O, no model imports.
 *
 *   Week 5 — "Data Has a Lifecycle, Not Just a Schema"  (ADR-005)
 *   Week 6 — "Security Is a System Property"             (ADR-006)
 *   Week 7 — "Observability Is Part of the Product"      (ADR-007)
 *
 * Titles and principles are LOCKED (canonical section 3) and quoted verbatim.
 */

import type { AmScenario } from '../architectMindsetScenario';
import { AM_QUALIFICATION } from '../architectMindsetQualification';

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 5 — "Data Has a Lifecycle, Not Just a Schema"
// The word "store" hid nine other verbs. Every one was an architectural decision.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK5_SCENARIO: AmScenario = {
  version: 'wk5.v1',
  week: 5,
  baseline: false,
  title: 'Data Has a Lifecycle, Not Just a Schema',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Architects design how data is created, validated, classified, used, shared, changed, retained, audited, archived, and deleted.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the product lead',
    text: 'Just store the questions and answers so we can improve the assistant later.',
  },
  initial_system: ['A question', 'An answer', 'A log to store them in'],
  first_decision: {
    prompt: 'Capture your instinct before the investigation. What would you do first when asked to "just store" the questions and answers?',
    options: [
      { id: 'table', label: 'Create a table and log every question and answer.' },
      { id: 'schema', label: 'Design the database schema and indexes first.' },
      { id: 'pipeline', label: 'Pipe the logs straight into a training and improvement dataset.' },
      { id: 'classify', label: 'Classify what is being captured before storing anything.' },
      { id: 'lifecycle', label: 'Map the full lifecycle from creation to deletion first.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: { people: 'Owners you must involve', information: 'Lifecycle stages behind "store"', decisions: 'What the data is used for', operations: 'Obligations after the data exists' },
    people: ['Data-protection / compliance officer', 'Legal', 'Security', 'Data engineering', 'Human Resources', 'The employees whose data is captured'],
    information: ['Creation', 'Validation', 'Classification', 'Use', 'Sharing', 'Change', 'Retention', 'Audit', 'Archival', 'Deletion'],
    decisions: ['Answering a live question', 'Training or improving the model', 'Analytics and reporting', 'Legal or subject-access retrieval', 'Excluding sensitive content entirely'],
    operations: ['Per-class access control', 'Defensible retention windows', 'Subject-access and right-to-be-forgotten', 'Legal holds', 'Staleness and re-validation', 'Audit of who accessed what'],
  },
  signature_reveals: [
    'The request named one action, "store." The data it stored had ten lifecycle stages and at least three regulated classes.',
    'A schema captures the shape of data for a day. A lifecycle governs its obligations for years.',
    'By the time the deletion request arrived, no one had ever designed a way to delete.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'What does the single word "store" actually pull into scope?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'stages', label: 'A full lifecycle: creation, classification, retention, audit, and deletion.' },
        { id: 'classes', label: 'Regulated data classes like PII, compensation, and health information.' },
        { id: 'owners', label: 'Owners in compliance, legal, security, and HR, not just engineering.' },
        { id: 'obligations', label: 'Legal obligations that outlive the feature that created the data.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What did "store it for later" quietly assume?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'harmless', label: 'That logging question-and-answer text is harmless by default.' },
        { id: 'forever', label: 'That keeping everything indefinitely is safe and free.' },
        { id: 'one_use', label: 'That data collected to answer could be freely reused to train.' },
        { id: 'deletable', label: 'That the data could always be found and deleted later if needed.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'Who must govern this data once it exists?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'dpo', label: 'A named data-protection owner accountable for classification and retention.' },
        { id: 'legal', label: 'Legal, for retention windows, holds, and subject-access obligations.' },
        { id: 'eng', label: 'Data engineering alone, as the team that built the pipeline.' },
        { id: 'shared', label: 'A shared owner group with one decision-maker per lifecycle stage.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'To defend this data later, what must you be able to show?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'access', label: 'Who accessed each record, when, and whether it was appropriate.' },
        { id: 'class', label: 'What class each record is and which retention rule applies to it.' },
        { id: 'lineage', label: 'Where each stored answer came from and which version it used.' },
        { id: 'deletion', label: 'Proof that deletion actually happened when it was required.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Given everything the word "store" was hiding, which data architecture do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'log_all', label: 'Log everything in one table, indefinitely.' },
        { id: 'classify', label: 'Classify on ingest and apply per-class retention and access.' },
        { id: 'evidence_only', label: 'Store structured decision evidence only, excluding sensitive content.' },
        { id: 'tiered', label: 'A tiered lifecycle with audit, retention, and deletion workflows.' },
        { id: 'custom', label: 'I propose my own data-governance design, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When the subject-access request and the stale-answer incident hit, what was the most important thing you originally missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'no_delete', label: 'I stored the data without ever designing a way to delete it.' },
        { id: 'no_class', label: 'I never classified what was sensitive, so I could not protect it.' },
        { id: 'stale', label: 'I treated stored answers as permanent, so they went silently stale.' },
        { id: 'reuse', label: 'I reused data for training that was only ever cleared for answering.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Records stored', value: '2.4M', trend: 'up' },
      { label: 'Records classified', value: '0%', trend: 'flat' },
      { label: 'Records with a retention rule', value: '0%', trend: 'flat' },
      { label: 'Deletion requests fulfilled', value: '0 of 14', trend: 'down' },
      { label: 'Sensitive records in plain logs', value: 'unknown', trend: 'down' },
      { label: 'Stale answers still served', value: 'rising', trend: 'up' },
    ],
    horizon: [
      { point: 'First store', risk: 12, note: 'Logging works; everything is captured.' },
      { point: 'First month', risk: 26, note: 'Millions of rows, none classified.' },
      { point: 'First subject-access request', risk: 70, note: 'An employee asks for all their data; no one can find or delete it.' },
      { point: 'First stale-answer incident', risk: 66, note: 'The bot cites a policy that changed six months ago.' },
      { point: 'First audit', risk: 88, note: 'No retention rule, no access log, no deletion path.' },
      { point: 'Legal hold', risk: 78, note: 'Some records must be preserved and others purged; the system cannot tell them apart.' },
      { point: 'Long-term operation', risk: 54 },
    ],
    reveal: 'The subject-access request arrived, and the system that was so good at storing had no way to find, classify, or delete. "Store it for later" had quietly become "keep everything forever, ungoverned."',
    lesson: 'A schema decides how data is shaped; a lifecycle decides how it is created, validated, classified, used, shared, changed, retained, audited, archived, and deleted. The word "store" hid nine other verbs, and every one of them was an architectural decision.',
  },
  rearchitecture: {
    prompt: 'You have seen the subject-access request and the stale-answer incident. Choose the data architecture you would recommend and defend it, then name the single lifecycle stage you originally left undesigned.',
  },
  receipt: {
    counts: [
      { label: 'data lifecycle design hours', value: '1000' },
      { label: 'classification & compliance hours', value: '900' },
      { label: 'subject-access & deletion incident hours', value: '720' },
      { label: 'retention & audit design hours', value: '780' },
      { label: 'data-governance redesign hours', value: '600' },
      { label: 'lifecycle stages behind "store"', value: '10' },
      { label: 'regulated data classes', value: '3' },
      { label: 'data owners across teams', value: '6' },
    ],
    represented_hours: 4000,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-005 — Govern the Data Lifecycle End to End',
    fields: ['context', 'decision', 'data_classes', 'lifecycle_stages', 'classification_rules', 'retention_policy', 'access_control', 'audit_trail', 'deletion_and_holds', 'assumptions', 'accepted_tradeoffs', 'evidence_that_would_change_the_decision', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'Pick one data element your project stores and trace its full lifecycle from creation to deletion; which stage have you not yet designed?',
      'Which data class carries the heaviest obligation, and who owns its retention, access, and deletion?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 6 — "Security Is a System Property"
// "Access to everything" handed one model the combined keys of every employee.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK6_SCENARIO: AmScenario = {
  version: 'wk6.v1',
  week: 6,
  baseline: false,
  title: 'Security Is a System Property',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Security emerges from identity, authorization, trust boundaries, tool permissions, data movement, secrets, defaults, logs, and operations.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the sponsor',
    text: 'Give the assistant access to everything so it can answer any question employees have.',
  },
  initial_system: ['An assistant', 'Access to everything', 'An employee question'],
  first_decision: {
    prompt: 'Capture your instinct before the investigation. What would you do first with a request to give the assistant "access to everything"?',
    options: [
      { id: 'grant', label: 'Grant the assistant broad access so it can answer anything.' },
      { id: 'filter', label: 'Add a content filter on top to block sensitive answers.' },
      { id: 'per_user', label: 'Scope every answer to what the person asking may see.' },
      { id: 'least_priv', label: 'Give the tools the least privilege each task truly needs.' },
      { id: 'map', label: 'Map identity, authorization, and trust boundaries before granting anything.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: { people: 'Owners of the security surface', information: 'Surfaces security emerges from', decisions: 'Actions the assistant might take', operations: 'Security operations after launch' },
    people: ['CISO / security team', 'Identity / IAM owner', 'Legal / privacy', 'The model vendor', 'IT', 'Employees'],
    information: ['Identity', 'Authorization', 'Trust boundaries', 'Tool permissions', 'Data movement', 'Secrets', 'Defaults', 'Logging', 'Operations'],
    decisions: ['Read a public policy', 'Read another employee\'s compensation', 'Send an email on someone\'s behalf', 'Write to an employee record', 'Trigger a payment'],
    operations: ['Key rotation', 'Incident response', 'Egress monitoring', 'Log redaction', 'Default-deny review', 'Access recertification'],
  },
  signature_reveals: [
    '"Access to everything" was one sentence. It silently granted the model the combined permissions of eight thousand employees.',
    'Security was never a feature to add on top. It emerged from nine surfaces at once, and a gap in any one opened all of them.',
    'A secret that reaches a prompt reaches a log, and a log reaches everyone who can read logs.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: '"Access to everything" quietly expands into how many decisions?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'surfaces', label: 'Nine security surfaces, from identity to operations, each its own decision.' },
        { id: 'combined', label: 'The combined permissions of every employee, held by one model.' },
        { id: 'tools', label: 'Every tool the model can call: read, write, email, and pay.' },
        { id: 'egress', label: 'Every place a prompt or answer leaves the trust boundary.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What did "give it access to everything" assume?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'trusted', label: 'That the model is a trusted employee rather than an untrusted tool.' },
        { id: 'same_view', label: 'That every employee should see the same answer to the same question.' },
        { id: 'filter_enough', label: 'That a content filter on top is the same thing as real authorization.' },
        { id: 'no_leak', label: 'That prompts and logs would never carry secrets or sensitive data.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'Whose identity should each assistant action run as?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'asker', label: 'The person asking, so the assistant only ever sees what they may see.' },
        { id: 'service', label: 'A single service account with broad rights, for simplicity.' },
        { id: 'least', label: 'A least-privilege identity scoped to the specific task and tool.' },
        { id: 'admin', label: 'An administrator identity, so nothing is ever blocked.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'Which owner must be involved before this ships?', mode: 'single', dimension: 'stakeholder_awareness',
      options: [
        { id: 'ciso', label: 'The security team, to set authorization and egress controls.' },
        { id: 'iam', label: 'The identity owner, to bind each action to the real asker.' },
        { id: 'privacy', label: 'Legal and privacy, for data movement to the vendor.' },
        { id: 'later', label: 'None yet; a security review can happen after the demo.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Given every surface security emerges from, which security architecture do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'broad_filter', label: 'Broad access with a content filter on top.' },
        { id: 'per_user', label: 'Per-user authorization, so the assistant sees only what the asker may see.' },
        { id: 'least_priv', label: 'Least-privilege tools with an allow-list and human approval for writes.' },
        { id: 'layered', label: 'Layered: per-user authorization plus tool permissioning plus egress and secret controls.' },
        { id: 'custom', label: 'I propose my own security architecture, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When one employee retrieved another\'s compensation and a key leaked into the logs, what was the most important thing you originally missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'identity', label: 'I never bound the assistant\'s access to the identity of the person asking.' },
        { id: 'tools', label: 'I gave the tools far more privilege than any single task needed.' },
        { id: 'egress', label: 'I never controlled what data left to the vendor or landed in logs.' },
        { id: 'defaults', label: 'I left the defaults open, so everything was allowed unless explicitly blocked.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Cross-user data exposures', value: '3', trend: 'up' },
      { label: 'Secrets found in logs', value: '2 keys', trend: 'up' },
      { label: 'Actions bound to the real asker', value: '0%', trend: 'down' },
      { label: 'Tools running least-privilege', value: '0 of 6', trend: 'down' },
      { label: 'Prompts leaving to the vendor', value: 'unbounded', trend: 'up' },
      { label: 'Default access posture', value: 'open', trend: 'flat' },
    ],
    horizon: [
      { point: 'Launch', risk: 16, note: 'The assistant can answer anything, for anyone.' },
      { point: 'First week', risk: 34, note: 'Employees notice it will answer questions about other people.' },
      { point: 'First cross-user exposure', risk: 74, note: 'One employee retrieves another\'s compensation.' },
      { point: 'First secret leak', risk: 82, note: 'An API key surfaces in a prompt log readable by support.' },
      { point: 'First audit', risk: 90, note: 'No action can be tied to the identity that requested it.' },
      { point: 'Vendor review', risk: 70, note: 'Prompts containing sensitive data have been leaving unbounded.' },
      { point: 'Long-term operation', risk: 56 },
    ],
    reveal: 'One employee asked the all-knowing assistant about a colleague, and it answered. The model was never a person to be trusted; it was a tool that had been handed everyone\'s keys at once.',
    lesson: 'Security did not live in a filter bolted on at the end. It emerged from identity, authorization, trust boundaries, tool permissions, data movement, secrets, defaults, logs, and operations, together. A single open surface among them exposed all the rest.',
  },
  rearchitecture: {
    prompt: 'You have seen the cross-user exposure and the leaked key. Choose the security architecture you would recommend and defend it, then name the single surface you originally left open.',
  },
  receipt: {
    counts: [
      { label: 'identity & authorization design hours', value: '900' },
      { label: 'tool-permission & egress control hours', value: '820' },
      { label: 'secret-management incident hours', value: '700' },
      { label: 'security-incident exposure hours', value: '1080' },
      { label: 'access-control redesign hours', value: '800' },
      { label: 'security surfaces in scope', value: '9' },
      { label: 'permissions effectively granted', value: '8,000 employees' },
      { label: 'trust boundaries crossed', value: '4' },
    ],
    represented_hours: 4300,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-006 — Treat Security as a System Property',
    fields: ['context', 'decision', 'identity_model', 'authorization_model', 'trust_boundaries', 'tool_permissions', 'data_movement_and_egress', 'secrets_management', 'default_posture', 'logging_and_redaction', 'assumptions', 'accepted_tradeoffs', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'In your project, whose identity does each action run as, and what is the least privilege it truly needs?',
      'Where does data cross a trust boundary, and which security surface have you not yet designed?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 7 — "Observability Is Part of the Product"
// "Let us know if something breaks" assumes the system can already prove itself.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK7_SCENARIO: AmScenario = {
  version: 'wk7.v1',
  week: 7,
  baseline: false,
  title: 'Observability Is Part of the Product',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'If the organization cannot determine what the system did, why it did it, what evidence it used, what it cost, and whether it worked, the system is incomplete.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the sponsor',
    text: 'It\'s live and people are using it. We\'re good, just let us know if something breaks.',
  },
  initial_system: ['A live system', 'People using it', 'A promise to flag breakage'],
  first_decision: {
    prompt: 'Capture your instinct before the investigation. It is live; what would you do first about knowing whether it works?',
    options: [
      { id: 'uptime', label: 'Add uptime monitoring and wait for something to break.' },
      { id: 'logs', label: 'Turn on structured logs with correlation IDs.' },
      { id: 'metrics', label: 'Instrument success, failure, latency, and cost from day one.' },
      { id: 'evidence', label: 'Record the evidence behind every answer so it can be explained.' },
      { id: 'define', label: 'Define what "working" means before instrumenting anything.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: { people: 'Who needs to see inside the system', information: 'Signals the product must emit', decisions: 'Questions the organization will ask', operations: 'What observability makes possible' },
    people: ['Ops / SRE', 'Support', 'The executive who asks "is it working?"', 'Compliance (audit trail)', 'The data analyst', 'Employees'],
    information: ['Structured event logs', 'Correlation IDs', 'Per-answer evidence', 'Cost per answer', 'Latency (p50 / p95 / p99)', 'Escalation tracking', 'Rolling success and failure rates', 'Abandonment'],
    decisions: ['What did it answer, and why?', 'What evidence did it use?', 'How often was it confidently wrong?', 'What did it cost?', 'Did the escalation complete?'],
    operations: ['Trace a symptom to its root cause', 'Prove an answer was correct', 'Detect a silent regression', 'Attribute cost per decision', 'Defend the system in an audit'],
  },
  signature_reveals: [
    'The system answered ten thousand questions in its first month. Without observability, the organization could prove exactly none of them were correct.',
    'A confidently wrong answer looks identical to a correct one until a human complains, unless the system can show its evidence.',
    'You cannot operate, improve, or defend what you cannot observe.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: '"Let us know if something breaks" assumes the system can already do what?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'tell', label: 'Tell what it did, why, on what evidence, at what cost, and whether it worked.' },
        { id: 'trace', label: 'Trace any answer from a symptom back to its root cause.' },
        { id: 'detect', label: 'Detect a wrong answer before a human happens to complain.' },
        { id: 'prove', label: 'Prove, after the fact, that a given answer was correct.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What did "we\'re good, just flag breakage" quietly assume?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'visible', label: 'That failures are visible, when confidently wrong answers are silent.' },
        { id: 'binary', label: 'That the system is either up or down, with nothing in between.' },
        { id: 'free', label: 'That cost and answer quality would take care of themselves.' },
        { id: 'later', label: 'That instrumentation can be added later without redesign.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'To prove an answer was correct, what must the system have captured?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'evidence', label: 'The evidence and document version each answer was built from.' },
        { id: 'correlation', label: 'A correlation ID linking the question, retrieval, answer, and outcome.' },
        { id: 'rates', label: 'Rolling success, failure, and confidently-wrong rates over time.' },
        { id: 'cost', label: 'Cost and latency per answer, not just aggregate uptime.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'The executive asks "is it working?" What lets you answer with evidence?', mode: 'single', dimension: 'decision_communication',
      options: [
        { id: 'dashboard', label: 'Success, failure, escalation, and cost trends anyone can read.' },
        { id: 'trace', label: 'A single correlation ID that reconstructs any decision on demand.' },
        { id: 'audit', label: 'An audit trail tying each answer to its evidence and its owner.' },
        { id: 'vibes', label: 'The absence of complaints so far.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Given how much the system cannot currently show, which observability architecture do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'uptime', label: 'Basic uptime monitoring only.' },
        { id: 'logs', label: 'Structured event logging with correlation IDs and per-answer evidence.' },
        { id: 'metrics', label: 'Full metrics (success, failure, retry, latency, cost) plus escalation and abandonment tracking.' },
        { id: 'decision_linked', label: 'Observability tied to the decision record, so every answer is explainable and auditable.' },
        { id: 'custom', label: 'I propose my own observability design, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'After a month of confidently wrong answers no one could trace, what was the most important thing you originally missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'no_trace', label: 'I had no correlation IDs, so I could not trace a symptom to its cause.' },
        { id: 'no_evidence', label: 'I never recorded the evidence behind an answer, so none were provable.' },
        { id: 'no_rates', label: 'I tracked uptime, not correctness, so silent regressions stayed invisible.' },
        { id: 'no_cost', label: 'I never measured cost per answer, so the spend surprised everyone.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Questions answered', value: '10,000', trend: 'up' },
      { label: 'Answers with recorded evidence', value: '0%', trend: 'flat' },
      { label: 'Traceable to root cause', value: '0%', trend: 'flat' },
      { label: 'Confidently wrong answers', value: 'unknown', trend: 'down' },
      { label: 'Cost per answer', value: 'untracked', trend: 'flat' },
      { label: 'Silent regression detected on', value: 'day 31 (by a complaint)', trend: 'down' },
    ],
    horizon: [
      { point: 'Go-live', risk: 14, note: 'It is up, and everyone assumes it is working.' },
      { point: 'First week', risk: 28, note: 'No complaints yet, so no signal at all.' },
      { point: 'Silent regression', risk: 66, note: 'A model update degrades answers; nothing surfaces it.' },
      { point: 'First complaint', risk: 74, note: 'A human notices on day 31 what instrumentation would have caught on day 2.' },
      { point: 'First audit', risk: 88, note: 'The organization cannot prove a single answer was correct.' },
      { point: 'Cost review', risk: 70, note: 'The spend is real; the value is unprovable.' },
      { point: 'Long-term operation', risk: 54 },
    ],
    reveal: 'For a month it answered ten thousand questions and looked healthy, because the only thing being watched was whether it was up. The regression had started on day two; a human finally noticed on day thirty-one.',
    lesson: 'Observability was not a dashboard added after launch; it was part of the product. If the organization cannot say what the system did, why, on what evidence, at what cost, and whether it worked, the system is not finished, however well the demo went.',
  },
  rearchitecture: {
    prompt: 'You have seen a month of unprovable answers. Choose the observability architecture you would recommend and defend it, then name the single signal whose absence hid the regression the longest.',
  },
  receipt: {
    counts: [
      { label: 'observability design hours', value: '900' },
      { label: 'instrumentation & correlation-ID hours', value: '820' },
      { label: 'confidently-wrong-answer incident hours', value: '900' },
      { label: 'metrics & cost-tracking hours', value: '780' },
      { label: 'audit & evidence-trail redesign hours', value: '1100' },
      { label: 'questions answered unverifiably', value: '10,000' },
      { label: 'signals left uninstrumented', value: '8' },
      { label: 'days a regression stayed invisible', value: '29' },
    ],
    represented_hours: 4500,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-007 — Make the System Observable by Design',
    fields: ['context', 'decision', 'structured_logging', 'correlation_ids', 'per_answer_evidence', 'metrics_and_slos', 'cost_and_latency_tracking', 'escalation_and_abandonment', 'audit_trail', 'assumptions', 'accepted_tradeoffs', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'For one action in your project, can you trace a symptom to its root cause with a single correlation ID?',
      'Can you prove that action worked and show what it cost, or would you be relying on the absence of complaints?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};
