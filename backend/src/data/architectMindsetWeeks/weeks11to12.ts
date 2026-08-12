import type { AmScenario } from '../architectMindsetScenario';
import { AM_QUALIFICATION } from '../architectMindsetQualification';

/**
 * architectMindsetWeeks/weeks11to12 — the two closing scenarios of "The Architect
 * Time Machine": Week 11 (organizational leadership) and Week 12 (the capstone,
 * which reactivates every prior lesson in one decision). Both are SCORED
 * (baseline: false) and follow the AmScenario contract field-for-field, matching
 * WEEK1_SCENARIO. Pure DATA + TYPES — no I/O, no model imports.
 */

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 11 — "Architecture Is Organizational Leadership"
// A technically correct design fails on adoption. Principle (LOCKED): architecture
// succeeds through shared understanding, ownership, trust, sequencing,
// communication, and adoption, not diagrams alone.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK11_SCENARIO: AmScenario = {
  version: 'wk11.v1',
  week: 11,
  baseline: false,
  title: 'Architecture Is Organizational Leadership',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Architecture succeeds through shared understanding, ownership, trust, sequencing, communication, and adoption, not diagrams alone.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the executive sponsor',
    text: 'The design is finished and approved. Just send the diagram to the teams and have them build it.',
  },
  initial_system: ['A finished, approved design', 'The teams who will build it', 'A diagram to hand off'],
  first_decision: {
    prompt: 'Capture your instinct before the reveal. The design is approved on paper. What would you do first to turn it into a real, adopted system?',
    options: [
      { id: 'send', label: 'Send the approved diagram to each team and set a build deadline.' },
      { id: 'kickoff', label: 'Run one kickoff meeting to walk everyone through the diagram.' },
      { id: 'align', label: 'Hold alignment sessions until each team shares the same understanding and owns its part.' },
      { id: 'sequence', label: 'Sequence the work so an early, visible win builds trust before the hard parts.' },
      { id: 'adopt', label: 'Pair the design with an adoption plan: ownership, communication, sequencing, change management.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: { people: 'Who must understand, own, and adopt it', information: 'What "approved" did not actually settle', decisions: 'What a diagram alone decides', operations: 'What only the organization can make real' },
    people: ['Affected team leads', 'The executive sponsor', 'HR systems owner', 'IT and service-desk lead', 'Security owner', 'The people whose daily work changes', 'The future maintainers', 'The architect acting as communicator'],
    information: ['Whether each team read the design the same way', 'Who owns each component after handoff', 'Which team goes first, and why', 'What changes in each person\'s daily work', 'What success looks like to each group', 'Where trust has to be earned before adoption', 'What the diagram left implicit', 'How disagreements get resolved'],
    decisions: ['The component shapes and their connections', 'The interfaces and names on paper', 'The intended data and control flow', 'The technically correct end-state structure', 'The stated target the teams should reach'],
    operations: ['Shared understanding across every team', 'Agreed ownership of each part', 'Trust between the teams and the architect', 'The sequence in which delivery happens', 'Communication and change management', 'Actual adoption in daily work', 'Resolving conflicting interpretations', 'Sustained operation after the build'],
  },
  signature_reveals: [
    'The architecture was technically correct and organizationally rejected. No diagram survives being handed to teams who were never brought along.',
    'The design had one author and needed a dozen owners. Approval on paper is not adoption in practice.',
    'Every team was handed the same diagram, and every team built a different system.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'The design was approved, yet the teams did not adopt it. Whose understanding and ownership did the handoff quietly assume?', mode: 'single', dimension: 'stakeholder_awareness',
      options: [
        { id: 'leads', label: 'The team leads who would have to translate the diagram into real work.' },
        { id: 'workers', label: 'The people whose daily work the design silently changes.' },
        { id: 'owners', label: 'The HR, IT, and security owners who must run their piece of it.' },
        { id: 'sponsor', label: 'The sponsor, who approved the picture but not the disruption it required.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What did "the design is finished and approved, just send it" assume that the organization did not support?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'same_read', label: 'That every team would read the same diagram the same way.' },
        { id: 'approval', label: 'That approval by leadership equals adoption by the teams.' },
        { id: 'ownership', label: 'That someone already owned each part of the built system.' },
        { id: 'no_change', label: 'That no one\'s daily work or incentives had to change.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'How should the architecture be communicated so that separate teams build the same system?', mode: 'single', dimension: 'decision_communication',
      options: [
        { id: 'walkthrough', label: 'A shared walkthrough where each team restates its part in its own words.' },
        { id: 'contracts', label: 'Explicit interfaces and ownership, not just boxes and arrows.' },
        { id: 'narrative', label: 'The outcome and the "why," not only the end-state picture.' },
        { id: 'oneway', label: 'A clear written spec sent once, so teams can start immediately.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'For the architecture to hold after handoff, what has to be true about ownership?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'named', label: 'Every component has a named owner who accepted it, not an assumed one.' },
        { id: 'decider', label: 'There is one clear decider when interpretations conflict.' },
        { id: 'seams', label: 'The seams between teams are owned, not left in the gaps.' },
        { id: 'architect', label: 'The architect stays accountable for adoption, not only for the design.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Given a technically correct design that no team has adopted, which organizational rollout do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'publish', label: 'Publish the diagram and expect execution.' },
        { id: 'align', label: 'Run alignment sessions to build shared understanding and ownership before building.' },
        { id: 'sequence', label: 'Sequence delivery so early wins build trust and adoption.' },
        { id: 'adoption_plan', label: 'Pair the design with a full adoption plan: ownership, communication, sequencing, change management.' },
        { id: 'custom', label: 'I propose my own organizational rollout, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When the organization rejected a correct design, what was the most important thing you originally missed, and what did it cost?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'adoption', label: 'I treated a correct diagram as a delivered system; adoption was the real work.' },
        { id: 'ownership', label: 'I never secured a named owner for each part, so no one drove it.' },
        { id: 'trust', label: 'I skipped the trust and sequencing that make teams willing to change.' },
        { id: 'people', label: 'I designed the system but not the human change it required.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Teams building the same design', value: '2 of 6', trend: 'down' },
      { label: 'Components with a named owner', value: '40%', trend: 'down' },
      { label: 'Daily workflows actually changed', value: '15%', trend: 'flat' },
      { label: 'Team trust in the rollout', value: '-22%', trend: 'down' },
      { label: 'Adoption after 60 days', value: '18%', trend: 'down' },
    ],
    horizon: [
      { point: 'Diagram sent', risk: 12, note: 'Leadership approved; the teams received a picture.' },
      { point: 'First interpretation', risk: 30, note: 'Each team reads the same diagram differently.' },
      { point: 'Build starts', risk: 46, note: 'Teams build divergent versions of "the" design.' },
      { point: 'Integration', risk: 68, note: 'The pieces do not fit; no one owns the seams.' },
      { point: 'Quiet non-adoption', risk: 80, note: 'Teams keep their old process; the new design is bypassed.' },
      { point: 'Executive review', risk: 74, note: 'A technically correct architecture is declared a failure.' },
      { point: 'Re-launch attempt', risk: 58, note: 'Adoption now costs more than building it right would have.' },
      { point: 'Long-term operation', risk: 44 },
    ],
    reveal: 'Every team was handed the same correct diagram, and every team built a different interpretation of it, or quietly kept its old process. The architecture was right; the organization never adopted it.',
    lesson: 'A diagram is a claim, not a system. Architecture becomes real only through shared understanding, named ownership, earned trust, deliberate sequencing, and change management. Leading the organization through the design is part of the design.',
  },
  rearchitecture: {
    prompt: 'You have seen a correct design fail on adoption. Choose the organizational rollout you would recommend and defend it, name who must own and sequence it, and state the single most important thing the handoff originally missed.',
  },
  receipt: {
    counts: [
      { label: 'organizational rollout hours', value: '1,900' },
      { label: 'stakeholder alignment hours', value: '1,200' },
      { label: 'change-management hours', value: '1,000' },
      { label: 'adoption-failure recovery hours', value: '1,100' },
      { label: 'communication & sequencing hours', value: '600' },
      { label: 'teams that must adopt', value: '6' },
      { label: 'ownership seams to assign', value: '9' },
      { label: 'adoption tradeoffs weighed', value: '5' },
    ],
    represented_hours: 5800,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-011 — Lead the Organization Through the Architecture',
    fields: ['context', 'decision', 'stakeholders_to_align', 'shared_understanding_plan', 'ownership_assignments', 'trust_and_sequencing', 'communication_plan', 'change_management', 'adoption_measures', 'risks_of_non_adoption', 'accepted_tradeoffs', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'Who must understand, own, and adopt your project\'s design for it to succeed, and which of them has not yet been brought along?',
      'How will you sequence and communicate the rollout so trust is earned before the hard parts, rather than merely diagramming the end state?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 12 — "The Architect's Final Horizon" (CAPSTONE)
// One decision reactivates all eleven prior lessons at once, under a deadline,
// with the cost of being wrong at its highest. Richest scenario; highest
// represented-hours. Principle (LOCKED): the mature architect simultaneously
// considers delivery, value, risk, reversibility, operations, ownership, future
// change, and the consequences of being wrong.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK12_SCENARIO: AmScenario = {
  version: 'wk12.v1',
  week: 12,
  baseline: false,
  title: 'The Architect\'s Final Horizon',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'The mature architect simultaneously considers delivery, value, risk, reversibility, operations, ownership, future change, and the consequences of being wrong.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'leadership',
    text: 'Leadership loved the pilot. Roll the assistant out company-wide across every department, integrated with every system, by the end of the quarter. Make the call.',
  },
  initial_system: ['A successful pilot', 'Every department and every system', 'One quarter to decide and deliver', 'Your call to make'],
  first_decision: {
    prompt: 'This is the capstone. Capture your instinct before the reveal: the pilot succeeded and leadership wants everything, everywhere, by quarter-end. What is your first move?',
    options: [
      { id: 'rollout', label: 'Commit to the full company-wide rollout by the deadline as requested.' },
      { id: 'phased', label: 'Propose a sequenced, reversible rollout by department and risk.' },
      { id: 'bounded', label: 'Start from a bounded, well-governed footprint with explicit expansion gates.' },
      { id: 'reshape', label: 'Recommend reshaping scope, timeline, and ownership to match the real risk.' },
      { id: 'discover', label: 'Re-run outcome, boundary, and risk discovery before committing to anything.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: { people: 'People and organization now in scope', information: 'Data, risk, and reversibility across departments', decisions: 'What the AI must, may not, and must escalate', operations: 'Long-term operations, ownership, and change' },
    people: ['The executive sponsor who set the deadline', 'Every department lead', 'HR, Legal, and Compliance', 'Security and identity owners', 'Ops / SRE and the service desk', 'Finance, on cost per decision', 'The future maintainers and their successors', 'Every employee the system now acts for'],
    information: ['Regulated data classes across every department', 'The data lifecycle from creation to deletion at company scale', 'Coupling to every integrated system', 'The blast radius of a company-wide failure', 'What is reversible versus one-way at this scale', 'Cost per decision across the whole footprint', 'Evidence quality behind high-impact answers', 'What would actually prove the rollout is working'],
    decisions: ['Low-risk factual answers it may handle alone', 'Consequential actions it must never take unaided', 'Cross-department policy it may not interpret', 'Personal and compensation data it must not release', 'High-impact, low-evidence cases it must abstain on', 'When it must escalate to a named human owner'],
    operations: ['Observability across the entire footprint', 'Named ownership and succession for every domain', 'Runbooks, reproducible builds, and a decommission path', 'Security rotation and incident response at scale', 'Change management and organizational adoption', 'The plan for when the decision proves wrong', 'Sustained cost, latency, and reliability over years'],
  },
  signature_reveals: [
    'Eleven weeks taught eleven lessons. This one decision demanded all eleven at the same time, under a deadline, with the cost of being wrong at its highest.',
    'The pilot succeeded in one department on a good quarter. Company-wide, every rare failure, every coupling, and every ungoverned decision arrives at once.',
    'The mature call is not the boldest or the safest. It is the single judgment that weighs delivery, value, risk, reversibility, operations, ownership, future change, and the cost of being wrong, all eleven prior lessons folded into one.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'One approval reactivates every prior lesson at once. What is actually in scope in this single decision?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'whole', label: 'The whole company, every integrated system, and every prior stakeholder, simultaneously.' },
        { id: 'pilot', label: 'Mostly what the pilot already proved, now scaled up.' },
        { id: 'tech', label: 'The technical rollout and integration work, primarily.' },
        { id: 'deadline', label: 'Whatever can realistically be delivered by the quarter-end deadline.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'What does "the pilot succeeded, so roll it out everywhere by quarter-end" assume that may not hold?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'transfers', label: 'That one department\'s success transfers unchanged to every department.' },
        { id: 'risk', label: 'That scale multiplies value without multiplying risk and coupling.' },
        { id: 'reversible', label: 'That a company-wide commitment is as reversible as a pilot.' },
        { id: 'ready', label: 'That governance, ownership, and operations are already ready at scale.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'Before you commit under the deadline, what evidence would you require to make the call defensible?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'proof', label: 'Proof the pilot\'s outcomes hold outside the pilot department.' },
        { id: 'observability', label: 'Observability that can prove, per decision, what the system did and whether it worked.' },
        { id: 'failure', label: 'A tested failure and recovery path at company scale, not just the happy path.' },
        { id: 'benchmark', label: 'A benchmark score showing the model is strong enough.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'Across every department and system, what must be true about ownership and AI authority?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'owners', label: 'Every domain has a named owner and a succession plan, not the build team by default.' },
        { id: 'authority', label: 'The AI\'s authority is tiered by business impact, with abstention and escalation.' },
        { id: 'seams', label: 'The coupling seams between systems are explicitly owned and governed.' },
        { id: 'later', label: 'Ownership can be assigned after the rollout proves successful.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Weighing delivery, value, risk, reversibility, operations, ownership, and future change together, what is your final architecture and delivery decision?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'full', label: 'Full company-wide rollout by the deadline as requested.' },
        { id: 'sequenced', label: 'A sequenced, reversible phased rollout by department and risk.' },
        { id: 'bounded', label: 'A bounded, well-governed initial footprint with explicit expansion gates.' },
        { id: 'reshape', label: 'A recommendation that reshapes scope, timeline, and ownership to match the real risk.' },
        { id: 'custom', label: 'I propose my own final architecture and delivery decision, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'If your decision turns out to be wrong, what is the most important thing you would have missed, and what is the cost of being wrong at this scale?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'irreversible', label: 'I committed the whole company to a path that could not be cheaply reversed.' },
        { id: 'coupling', label: 'I underestimated coupling, so one failure cascaded across every department.' },
        { id: 'governance', label: 'I scaled AI authority faster than governance, ownership, and observability.' },
        { id: 'adoption', label: 'I delivered it technically but never earned company-wide adoption.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Departments live at once', value: 'all 14', trend: 'up' },
      { label: 'Integrated systems coupled', value: '30+', trend: 'up' },
      { label: 'Company-wide incidents / quarter', value: '11', trend: 'down' },
      { label: 'High-impact actions taken unaided', value: '4%', trend: 'down' },
      { label: 'Decisions traceable end to end', value: '35%', trend: 'down' },
      { label: 'Cost per decision vs pilot', value: '+180%', trend: 'up' },
      { label: 'Rollback feasible', value: 'no', trend: 'down' },
      { label: 'Company-wide adoption', value: '46%', trend: 'flat' },
    ],
    horizon: [
      { point: 'Quarter-end launch', risk: 22, note: 'Every department goes live at once to hit the deadline.' },
      { point: 'First cross-system change', risk: 44, note: 'Coupling to every integrated system surfaces simultaneously.' },
      { point: 'First company-wide failure', risk: 72, note: 'One failure cascades across departments with no containment.' },
      { point: 'First high-impact wrong action', risk: 85, note: 'AI authority outran governance on a consequential decision.' },
      { point: 'First audit', risk: 90, note: 'The footprint cannot prove what it did, on what evidence, at what cost.' },
      { point: 'Attempted rollback', risk: 82, note: 'The commitment is one-way; reversal is slow and expensive.' },
      { point: 'Ownership handoff', risk: 66, note: 'No named owner or succession for most of the footprint.' },
      { point: 'Long-term operation', risk: 52 },
    ],
    reveal: 'The all-at-once rollout compounded outcome, boundary, failure, coupling, data, security, observability, AI-authority, ownership, and adoption risk into a single company-wide incident, and the commitment was too far along to reverse cheaply.',
    lesson: 'The mature call weighs delivery, value, risk, reversibility, operations, ownership, future change, and the cost of being wrong together, and no single prior lesson alone produces a defensible decision. A sequenced, reversible rollout delivers value while keeping the cost of being wrong survivable.',
  },
  rearchitecture: {
    prompt: 'You have seen the all-at-once path fail. Combine every prior lesson, outcome, boundaries, failure, coupling, data, security, observability, AI authority, decision system, ownership, and organizational adoption, into one final decision, defend it against the deadline, and state exactly what you would do if you turned out to be wrong.',
  },
  receipt: {
    counts: [
      { label: 'multi-department project-cycle hours', value: '2,400' },
      { label: 'cross-department incident hours', value: '1,300' },
      { label: 'redesign & rollout hours', value: '1,200' },
      { label: 'security, data & governance hours', value: '1,000' },
      { label: 'ownership & succession hours', value: '900' },
      { label: 'prior lessons combined', value: '11' },
      { label: 'departments and systems in scope', value: '14+' },
      { label: 'whole-horizon tradeoffs weighed', value: '8' },
    ],
    represented_hours: 6800,
    minutes: 30,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-012 — The Architect\'s Final Judgment',
    fields: ['context', 'final_decision', 'observable_outcome', 'system_boundaries', 'failure_and_recovery', 'coupling_and_integration', 'data_lifecycle', 'security_and_identity', 'observability', 'ai_decision_authority', 'ownership_and_succession', 'organizational_adoption', 'reversibility_and_cost_of_being_wrong'],
  },
  project_transfer: {
    prompt: 'Make the final call on your own project.',
    questions: [
      'Combine outcome, boundaries, failure, coupling, data, security, observability, AI authority, decision system, ownership, and organizational adoption into one decision about your real project: what do you commit to, and why is it defensible?',
      'State exactly what you would do if that decision proved wrong: how would you know, how reversible is it, and who owns the recovery?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};
