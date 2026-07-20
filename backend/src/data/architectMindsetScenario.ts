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
  zoom_out: {
    people: string[]; information: string[]; decisions: string[]; operations: string[];
    /** optional display titles per layer (Week 1 uses Stakeholders / Root causes / …); defaults to People/Information/Decisions/Operations */
    titles?: { people?: string; information?: string; decisions?: string; operations?: string };
  };
  signature_reveals: string[];
  interview_part_1: AmInterviewQuestion[];
  interview_part_2: AmInterviewQuestion[];
  consequence: {
    horizon: Array<{ point: string; risk: number; note?: string }>;
    /** optional outcome dashboard (Week 1: the 30-day metrics) shown before the horizon */
    dashboard?: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'flat' }>;
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
  adr: { fields: string[]; title?: string };
  project_transfer: { prompt: string; questions: string[] };
  commitment_prompt: string;
}

/**
 * The mandatory, reusable experience-compression qualification (canonical section 8).
 * Defined in a leaf module and re-exported here so existing importers are unaffected,
 * while the per-week scenario files can import it without a circular dependency.
 */
export { AM_QUALIFICATION } from './architectMindsetQualification';
import { AM_QUALIFICATION } from './architectMindsetQualification';

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

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 1 — "The Request Is Not the Requirement"
// The first SCORED lesson (baseline: false). A new scenario instance on the same
// framework as Week 0 — the reusability proof: only DATA changes here.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK1_SCENARIO: AmScenario = {
  version: 'wk1.v1',
  week: 1,
  baseline: false,
  title: 'The Request Is Not the Requirement',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Stakeholders request an imagined solution; the architect discovers the underlying outcome, root causes, constraints, and evidence.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the program client',
    text: 'Our students ask the same questions repeatedly. Build us an AI chatbot so they stop contacting the staff.',
  },
  initial_system: ['A student', 'An AI chatbot', 'The repeated questions'],
  first_decision: {
    prompt: 'Capture your instinct before the investigation. What would you do first, and what would you measure as success?',
    options: [
      { id: 'build', label: 'Build the chatbot on the existing FAQ and documents.' },
      { id: 'stack', label: 'Choose the model, vector database, and chat interface.' },
      { id: 'collect', label: 'Collect the most common questions and train on them.' },
      { id: 'outcome', label: 'Ask what outcome the staff and students actually need.' },
      { id: 'measure', label: 'Measure why students contact staff today, before building anything.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: { people: 'Stakeholders you interview', information: 'Root causes the interviews reveal', decisions: 'What a chatbot alone can address', operations: 'What a chatbot cannot fix' },
    people: ['Program director', 'Admissions representative', 'Instructor', 'Student support specialist', 'Current student', 'Former student', 'Data analyst', 'Compliance representative', 'Technology administrator'],
    information: ['Efficiency', 'Confidence and qualification', 'Conflicting information', 'Trust and reassurance', 'Navigation', 'Missing next-step guidance', 'Broken workflow', 'Governance', 'Source-of-truth ownership'],
    decisions: ['Answer a low-risk factual question', 'Deflect a simple repeated question'],
    operations: ['Trust and reassurance', 'A broken enrollment workflow', 'Conflicting sources of truth', 'Missing next-step guidance', 'Who owns the answer'],
  },
  signature_reveals: [
    'The client requested one solution. Investigation revealed seven different problems. A chatbot directly addressed only two.',
    'The chatbot answered 82% of questions, yet staff workload fell only 9%.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'The chatbot answered 82% of questions, yet staff workload fell only 9%. Why?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'hard', label: 'The students who contact staff have the hard questions the bot cannot answer.' },
        { id: 'trust', label: 'Students did not trust the bot and re-asked staff anyway.' },
        { id: 'unasked', label: 'The bot answered questions no one was actually bringing to staff.' },
        { id: 'human', label: 'Staff time went to problems a chatbot was never going to solve.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What did the request assume that the evidence did not support?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'repeats', label: 'That repeated questions were the actual problem.' },
        { id: 'shape', label: 'That a chatbot was the right shape of solution.' },
        { id: 'single_answer', label: 'That each question had a single, correct, current answer.' },
        { id: 'deflect', label: 'That deflecting contact would improve the student experience.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'Which stakeholder perspective changed your understanding the most?', mode: 'single', dimension: 'stakeholder_awareness',
      options: [
        { id: 'support', label: 'The student support specialist: why students really reach out.' },
        { id: 'compliance', label: 'The compliance representative: what must never be auto-answered.' },
        { id: 'analyst', label: 'The data analyst: what the numbers actually show.' },
        { id: 'former', label: 'The former student: what they needed and did not get.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'What outcome should this system actually create, named without any technology?', mode: 'single', dimension: 'decision_communication',
      options: [
        { id: 'trust', label: 'Students get trustworthy answers and know their next step.' },
        { id: 'staff', label: 'Staff spend their time on the problems only humans can solve.' },
        { id: 'truth', label: 'The organization has one source of truth it can stand behind.' },
        { id: 'complete', label: 'Students complete enrollment with less friction and more confidence.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Given the seven problems behind the one request, which architecture do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'improve', label: 'Improve the chatbot.' },
        { id: 'redesign', label: 'Redesign the knowledge and workflow foundation.' },
        { id: 'triage', label: 'Use AI triage with human support.' },
        { id: 'phased', label: 'Use a phased, combined architecture.' },
        { id: 'custom', label: 'I propose my own architecture, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'The client asked for a chatbot in six weeks. Your recommendation changes processes, ownership, and technology. What can you responsibly deliver in six weeks without creating a system the organization will regret?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'kb', label: 'A source-of-truth knowledge base plus a narrow, well-governed assistant.' },
        { id: 'route', label: 'AI triage that routes each student to the right human with context.' },
        { id: 'pilot', label: 'A measured pilot on only the two problems a bot can actually solve.' },
        { id: 'agree', label: 'Nothing to build until the outcome and the owners are agreed.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Questions answered', value: '82%' },
      { label: 'Staff contacts reduced', value: '9%', trend: 'flat' },
      { label: 'Repeated questions reduced', value: '4%', trend: 'flat' },
      { label: 'Student satisfaction', value: '-11%', trend: 'down' },
      { label: 'Enrollment completion', value: 'no change', trend: 'flat' },
      { label: 'Confident wrong answers', value: '7%', trend: 'down' },
      { label: 'Human escalations completed', value: '38%', trend: 'down' },
      { label: 'Students abandoning chat', value: '31%', trend: 'down' },
    ],
    horizon: [
      { point: 'Launch', risk: 12, note: 'The demo answers the easy questions.' },
      { point: 'First 1,000 students', risk: 30, note: 'The hard 18% still reach staff, now less trusting.' },
      { point: 'First failure', risk: 68, note: 'A confident, wrong answer on a compliance question.' },
      { point: 'First audit', risk: 84, note: 'No one owns the source of truth the bot answered from.' },
      { point: 'Satisfaction review', risk: 72, note: 'Satisfaction is down 11%; abandonment is up.' },
      { point: 'Long-term operation', risk: 50 },
    ],
    reveal: 'The bot answered the easy 82%. The students who contacted staff were the ones with the hard 18% the bot could not touch, and now they trusted the whole system less.',
    lesson: 'The request named a solution (a chatbot). The requirement was an outcome: trustworthy answers, a clear next step, and staff freed for the problems only humans can solve. Architecting begins by discovering the requirement behind the request.',
  },
  rearchitecture: {
    prompt: 'You have seen the 30-day outcome. Choose the architecture you would recommend and defend it, answer the client\'s six-week challenge, and name the single most important thing the original request missed.',
  },
  receipt: {
    counts: [
      { label: 'discovery & requirements hours', value: '700' },
      { label: 'stakeholder collaboration hours', value: '480' },
      { label: 'failed-solution exposure hours', value: '900' },
      { label: 'workflow redesign hours', value: '600' },
      { label: 'operational measurement hours', value: '520' },
      { label: 'problems behind one request', value: '7' },
      { label: 'stakeholders interviewed', value: '9' },
      { label: 'root causes surfaced', value: '9' },
    ],
    represented_hours: 3200,
    minutes: 25,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-001 — Define the Outcome Before Selecting the Solution',
    fields: ['requested_feature', 'observable_outcome', 'user_outcomes', 'root_causes', 'system_response', 'non_goals', 'success_measures', 'assumptions', 'constraints', 'alternatives', 'accepted_tradeoffs', 'evidence_that_would_change_the_decision', 'ownership'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'What solution have you already assumed for your own project, and who owns the problem it addresses?',
      'What outcome should it actually create (named without any technology), and what evidence would support a different solution?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// Weeks 2-12 are authored as data in architectMindsetWeeks/* (same AmScenario
// contract as Weeks 0-1). They import AmScenario type-only + AM_QUALIFICATION from
// the leaf module, so importing them here creates no circular dependency.
import { WEEK2_SCENARIO, WEEK3_SCENARIO, WEEK4_SCENARIO } from './architectMindsetWeeks/weeks02to04';
import { WEEK5_SCENARIO, WEEK6_SCENARIO, WEEK7_SCENARIO } from './architectMindsetWeeks/weeks05to07';
import { WEEK8_SCENARIO, WEEK9_SCENARIO, WEEK10_SCENARIO } from './architectMindsetWeeks/weeks08to10';
import { WEEK11_SCENARIO, WEEK12_SCENARIO } from './architectMindsetWeeks/weeks11to12';

/** Scenario registry by week. Week 0 = baseline; Weeks 1-12 = scored lessons. */
export const AM_SCENARIOS: Record<number, AmScenario> = {
  0: WEEK0_SCENARIO,
  1: WEEK1_SCENARIO,
  2: WEEK2_SCENARIO,
  3: WEEK3_SCENARIO,
  4: WEEK4_SCENARIO,
  5: WEEK5_SCENARIO,
  6: WEEK6_SCENARIO,
  7: WEEK7_SCENARIO,
  8: WEEK8_SCENARIO,
  9: WEEK9_SCENARIO,
  10: WEEK10_SCENARIO,
  11: WEEK11_SCENARIO,
  12: WEEK12_SCENARIO,
};

export function scenarioForWeek(week: number | null | undefined): AmScenario | null {
  if (week == null) return null;
  return AM_SCENARIOS[week] || null;
}
