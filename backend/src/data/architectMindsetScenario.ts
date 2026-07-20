/**
 * architectMindsetScenario — the structured scenario contract for the Architect
 * Mindset curriculum type ("The Architect Time Machine"), plus the hand-authored
 * Week 0 scenario.
 *
 * The renderer (ArchitectTimeMachine.tsx) consumes an AmScenario. Week 0 is
 * hand-authored here (it is the null-blueprint free-preview tier); Weeks 1-12 are
 * generated against WEEK CONTEXT and cached on card.metadata.architect_scenario
 * (a later phase). Keep this file pure DATA + TYPES — no I/O, no model imports.
 */

export interface AmOption {
  id: string;
  label: string;
  /** the "I see it differently / write my own" option — requires free text */
  custom?: boolean;
}

export interface AmInterviewQuestion {
  id: string;
  text: string;
  mode: 'single' | 'multiple';
  options: AmOption[];
  /** which Architect Mindset dimension this question probes (for evaluation) */
  dimension?: string;
}

export interface AmScenario {
  version: string;
  week: number;
  /** Week 0 is a baseline demonstration, not scored as the first lesson. */
  baseline: boolean;
  title: string;
  series: string;
  experience: string;
  principle: string;
  tagline: string;
  request: { from: string; text: string };
  initial_system: string[];
  first_decision: { prompt: string; options: AmOption[] };
  zoom_out: { people: string[]; information: string[]; decisions: string[]; operations: string[] };
  signature_reveals: string[];
  interview_part_1: AmInterviewQuestion[];
  interview_part_2: AmInterviewQuestion[];
  consequence: {
    horizon: Array<{ point: string; risk: number; note?: string }>;
    reveal: string;
    lesson: string;
  };
  rearchitecture: { prompt: string };
  receipt: {
    counts: Array<{ label: string; value: string }>;
    represented_hours: number;
    minutes: number;
    qualification: string;
  };
  adr: { fields: string[] };
  project_transfer: { prompt: string; questions: string[] };
  commitment_prompt: string;
}

/** The mandatory, reusable experience-compression qualification (canonical section 8). */
export const AM_QUALIFICATION =
  'Illustrative and scenario-based. This represents patterns studied, not employment experience earned, and is not a guarantee of competence or job readiness.';

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 0 — "You Don't Become an Architect by Learning More Tools"
// Series intro + Time Machine format demo. Baseline only (unscored).
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK0_SCENARIO: AmScenario = {
  version: 'wk0.v1',
  week: 0,
  baseline: true,
  title: 'You Don\'t Become an Architect by Learning More Tools',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'An architect sees the entire system surrounding the requested feature.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the sponsor',
    text: 'Build an AI assistant that answers employee questions using company documents. We need a demonstration in two weeks.',
  },
  initial_system: ['An employee', 'An AI assistant', 'Company documents'],
  first_decision: {
    prompt: 'What would you do first? There is no penalty here. We capture your instinct before teaching anything, so you can compare it later.',
    options: [
      { id: 'model', label: 'Choose the AI model' },
      { id: 'interface', label: 'Build the chat interface' },
      { id: 'upload', label: 'Upload the company documents' },
      { id: 'ask', label: 'Ask more questions about the system' },
      { id: 'plan', label: 'Create a project plan' },
      { id: 'poc', label: 'Start a proof of concept' },
      { id: 'custom', label: 'I would do something else', custom: true },
    ],
  },
  zoom_out: {
    people: ['Full-time employees', 'Contractors', 'Managers', 'Executives', 'Human Resources', 'Legal', 'IT support', 'Administrators'],
    information: ['Employee handbook', 'Benefits', 'Compensation policies', 'Performance information', 'Legal policies', 'Security procedures', 'Customer information', 'Internal strategy', 'Outdated versions', 'Draft and conflicting documents'],
    decisions: ['Low-risk factual answer', 'Personal information retrieval', 'Policy interpretation', 'Legal or employee-relations escalation', 'Unauthorized request', 'Insufficient evidence and abstention'],
    operations: ['Document ownership', 'Content updates', 'Access changes', 'Logging', 'Monitoring', 'Incident response', 'Cost', 'Model changes', 'Human escalation', 'Long-term maintenance'],
  },
  signature_reveals: [
    'The request contained one user. The real system contained at least eight roles.',
    'The request contained one source called "company documents." The real system contained multiple information classes, owners, permissions, and conflicting versions.',
    'The assignment was described as question answering. It was actually an identity, access, policy, evidence, governance, and operational system.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'What did you focus on when you first received the request?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'speed', label: 'How quickly I could build the requested feature.' },
        { id: 'tools', label: 'Which model, framework, and tools I would use.' },
        { id: 'system', label: 'Understanding the users, data, decisions, risks, and owners around the feature.' },
        { id: 'outcome', label: 'Clarifying the business outcome and how success would be measured.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'Which newly revealed part of the system changed your thinking the most?', mode: 'single', dimension: 'stakeholder_awareness',
      options: [
        { id: 'roles', label: 'The eight different roles, each with different needs and permissions.' },
        { id: 'classes', label: 'The many information classes, owners, and conflicting versions.' },
        { id: 'decisions', label: 'The decisions the assistant might be asked to make, including ones it should refuse.' },
        { id: 'ops', label: 'The ongoing operations: ownership, updates, monitoring, cost, escalation.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'What assumption in the original request created the greatest risk?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'one_user', label: 'That there was one kind of user with one kind of need.' },
        { id: 'one_source', label: 'That "company documents" was a single, trusted, current source.' },
        { id: 'just_qa', label: 'That the job was question answering rather than governed decision-making.' },
        { id: 'two_weeks', label: 'That a responsible version of this could be demonstrated in two weeks.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'Which decision should the AI be prohibited from making alone?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'legal', label: 'Interpreting legal or employee-relations policy.' },
        { id: 'personal', label: 'Returning someone\'s personal or compensation information.' },
        { id: 'authority', label: 'Acting on a request from someone without the authority to make it.' },
        { id: 'low_evidence', label: 'Answering confidently when the evidence is weak or conflicting.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q5', text: 'What would you need to observe after launch?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'source', label: 'Which document version each answer came from, and who owns it.' },
        { id: 'wrong', label: 'How often it answered confidently and incorrectly.' },
        { id: 'escalation', label: 'When it escalated to a human, and whether the handoff completed.' },
        { id: 'cost', label: 'Cost, usage, and how behavior changed after a model update.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q6', text: 'Who should own the system after the demonstration?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'named', label: 'A named owner for content, access, and escalation, not "the AI team, later".' },
        { id: 'it', label: 'IT support, as another application to maintain.' },
        { id: 'hr_legal', label: 'HR and Legal, since most of the risk lives in their domains.' },
        { id: 'shared', label: 'A shared owner group with a clear decision-maker for each concern.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q7', text: 'What is the difference between building the assistant and architecting the assistant?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'feature_vs_system', label: 'Building makes the feature work once; architecting decides how the whole system behaves over time.' },
        { id: 'speed_vs_care', label: 'Building optimizes for the demo; architecting optimizes for what happens after it.' },
        { id: 'code_vs_decisions', label: 'Building is code; architecting is the decisions, boundaries, and owners around the code.' },
        { id: 'same', label: 'They are mostly the same with different words.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q8', text: 'What will you begin doing before you build?', mode: 'single', dimension: 'decision_communication',
      options: [
        { id: 'map', label: 'Map the whole system: users, data, decisions, risks, and owners.' },
        { id: 'outcome', label: 'Name the business outcome and how success will be measured.' },
        { id: 'failure', label: 'Design the failure path and the decisions the AI must not make alone.' },
        { id: 'stakeholders', label: 'Talk to the stakeholders the request did not mention.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'When the system failed, what was the most important thing you originally missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'users', label: 'I treated all users as though they had the same needs and permissions.' },
        { id: 'authority', label: 'I trusted the available information without verifying ownership or authority.' },
        { id: 'failure_path', label: 'I planned for the successful path but did not design the failure path.' },
        { id: 'business', label: 'I focused on technical delivery without defining business success.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'What changed most in your thinking between your first decision and now?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'scope', label: 'I now see how far the system extends beyond the feature that was requested.' },
        { id: 'owners', label: 'I now start from owners, risks, and evidence rather than tools.' },
        { id: 'refuse', label: 'I now design what the system should refuse to do, not only what it can do.' },
        { id: 'measure', label: 'I now define success as a measurable outcome, not a working demo.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    horizon: [
      { point: 'First build', risk: 10, note: 'The demo works on the happy path.' },
      { point: 'First user', risk: 14 },
      { point: '1,000 users', risk: 30, note: 'Different roles ask for things the demo never considered.' },
      { point: 'First failure', risk: 64, note: 'A confident, wrong answer on a sensitive question.' },
      { point: 'First audit', risk: 86, note: 'No one can say which document version an answer came from, or who approved it.' },
      { point: 'Ownership handoff', risk: 74 },
      { point: 'Vendor swap', risk: 58 },
      { point: 'Long-term operation', risk: 44 },
    ],
    reveal: 'At the first audit, no one could say which document version an answer came from, or who approved it. The demonstration had no owner.',
    lesson: 'The system that looked finished at the demonstration became the organization\'s problem at the audit. That gap, between building the assistant and architecting it, is the whole subject of this series.',
  },
  rearchitecture: {
    prompt: 'You have seen where this decision led. Change at least one decision, or defend one you would keep, and explain the single most important thing you originally missed.',
  },
  receipt: {
    counts: [
      { label: 'feature request', value: '1' },
      { label: 'user roles', value: '8' },
      { label: 'information classes', value: '10' },
      { label: 'decision categories', value: '6' },
      { label: 'architectural concerns', value: '7' },
      { label: 'implementation strategies', value: '4' },
      { label: 'hidden assumptions', value: '12' },
      { label: 'professional perspectives', value: '5' },
      { label: 'project phases', value: '2' },
    ],
    represented_hours: 450,
    minutes: 13,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    fields: ['context', 'decision', 'assumption', 'consequence', 'tradeoff', 'owner'],
  },
  project_transfer: {
    prompt: 'Before you leave, apply the lesson to your own project.',
    questions: [
      'What solution have you already assumed for your own project?',
      'What outcome should it actually create, without naming a technology?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

/** Scenario registry by week. Week 0 is authored; later weeks are generated. */
export const AM_SCENARIOS: Record<number, AmScenario> = {
  0: WEEK0_SCENARIO,
};

export function scenarioForWeek(week: number | null | undefined): AmScenario | null {
  if (week == null) return null;
  return AM_SCENARIOS[week] || null;
}
