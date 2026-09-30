/**
 * architectMindsetWeeks/weeks08to10 — hand-authored Architect Mindset scenarios
 * for Weeks 8, 9, and 10 of "The Architect Time Machine".
 *
 * Same framework as WEEK0_SCENARIO / WEEK1_SCENARIO (architectMindsetScenario.ts):
 * only DATA changes. Titles and principles are LOCKED (canonical section 3).
 * Keep this file pure DATA + TYPES — no I/O, no model imports.
 */

import type { AmScenario } from '../architectMindsetScenario';
import { AM_QUALIFICATION } from '../architectMindsetQualification';

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 8 — "AI Confidence Is Not Business Confidence"
// A 95%-confident answer about parking and a 95%-confident answer about benefits
// carry the same number and wildly different business cost.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK8_SCENARIO: AmScenario = {
  version: 'wk8.v1',
  week: 8,
  baseline: false,
  title: 'AI Confidence Is Not Business Confidence',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Model confidence must be combined with evidence quality, business impact, uncertainty, action authority, abstention, and escalation.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the sponsor',
    text: 'The model says it\'s 95% confident, so just let it answer and act automatically.',
  },
  initial_system: ['A confidence score', 'An answer', 'An automatic action'],
  first_decision: {
    prompt: 'Capture your instinct before the reveal. What would you do first with a model that reports 95% confidence, and what would you let it do automatically?',
    options: [
      { id: 'threshold', label: 'Set a confidence threshold and act automatically above it.' },
      { id: 'turn_on', label: 'Turn on automatic actions for everything the model is sure about.' },
      { id: 'calibrate', label: 'Check whether "95% confident" actually means right 95 times in 100.' },
      { id: 'rank_impact', label: 'Sort the possible actions by business impact before automating any.' },
      { id: 'ask_wrong', label: 'Ask what happens when a confident answer turns out to be wrong.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: {
      people: 'Who is affected when the AI acts alone',
      information: 'What a confidence score leaves out',
      decisions: 'Actions ranked by business impact',
      operations: 'What must exist before the AI acts alone',
    },
    people: ['The risk owner', 'Legal and compliance', 'Human Resources', 'The model vendor', 'Operations', 'The employee affected by the action', 'The auditor who reviews the decision later'],
    information: ['Evidence quality behind the answer', 'Business impact of the action', 'Uncertainty and calibration of the score', 'Whether the action is authorized', 'Whether abstention is allowed', 'Whether an escalation path exists', 'Reversibility of the action', 'The cost of being wrong'],
    decisions: ['Point to the cafeteria menu (trivial)', 'Confirm an office location (low impact)', 'Explain a benefits policy (medium impact)', 'Change an employee\'s benefits election (high, irreversible)', 'Approve or deny a leave request (high, regulated)', 'Suspend or terminate an account (high, hard to reverse)'],
    operations: ['Calibration monitoring: does 95% mean 95%?', 'An impact tier for every action', 'An abstention path for low-evidence cases', 'A human escalation route with a named owner', 'An audit trail of what acted and why', 'A reversal or compensation procedure', 'Alerting when confident answers turn out wrong'],
  },
  signature_reveals: [
    'The model was 95% confident in both answers. One was about parking. The other would have changed someone\'s health coverage.',
    'The confidence score was identical for a trivial answer and an irreversible one. Confidence measured the model\'s certainty about words, not the business cost of being wrong.',
    'At 95% reported confidence, roughly 1 in 12 high-impact actions was still wrong, and a threshold alone had no way to tell which one.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'What did the request assume that the evidence did not support?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'number_is_risk', label: 'That a high confidence number meant the action was low-risk.' },
        { id: 'all_equal', label: 'That every action above the threshold was equally safe to automate.' },
        { id: 'calibrated', label: 'That "95% confident" actually meant right 95 times out of 100.' },
        { id: 'no_abstain', label: 'That the model should always answer rather than sometimes abstain.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'Confidence is the model\'s certainty about its own words. What else must a real decision weigh before acting?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'impact', label: 'The business impact and reversibility of the action it would trigger.' },
        { id: 'evidence', label: 'The quality and freshness of the evidence the answer rests on.' },
        { id: 'authority', label: 'Whether this is an action the system is authorized to take at all.' },
        { id: 'uncertainty', label: 'How well-calibrated the confidence score is against real accuracy.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'Which action should the AI be prohibited from taking on model confidence alone, no matter how high?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'benefits', label: 'Changing an employee\'s benefits or compensation.' },
        { id: 'leave', label: 'Approving or denying a regulated leave or accommodation request.' },
        { id: 'account', label: 'Suspending or terminating access to an account or system.' },
        { id: 'legal', label: 'Making a legal or employee-relations determination.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'When the AI acts automatically on a confident but wrong answer, whose problem does it become?', mode: 'single', dimension: 'stakeholder_awareness',
      options: [
        { id: 'employee', label: 'The employee whose benefits, leave, or access was changed.' },
        { id: 'risk_owner', label: 'The risk and compliance owner who must answer for the automated decision.' },
        { id: 'ops', label: 'The operations team that has to detect and reverse it after the fact.' },
        { id: 'org', label: 'The organization, now liable for a decision no human ever made.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'How should the system decide what it may do automatically?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'threshold', label: 'Act automatically on anything above a confidence threshold.' },
        { id: 'impact_tier', label: 'Tier actions by business impact, not by model confidence.' },
        { id: 'evidence_gate', label: 'Require evidence-quality and authority checks before any consequential action.' },
        { id: 'matrix', label: 'Use a confidence-plus-impact matrix with abstention and escalation for high-impact, low-evidence cases.' },
        { id: 'custom', label: 'I propose my own decision-authority model, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When the system acted confidently and caused harm, what was the most important thing you originally missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'impact_blind', label: 'I let one confidence number stand in for wildly different business consequences.' },
        { id: 'no_abstain', label: 'I gave the system no way to abstain when the evidence was thin.' },
        { id: 'no_escalate', label: 'I built no escalation path for the high-impact, uncertain cases.' },
        { id: 'no_reverse', label: 'I never designed how to detect and reverse a confident, wrong action.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Actions taken automatically', value: '71%' },
      { label: 'Reported model confidence', value: '95%+', trend: 'flat' },
      { label: 'Actual accuracy on high-impact actions', value: '88%', trend: 'down' },
      { label: 'Confident wrong actions', value: '1 in 12', trend: 'down' },
      { label: 'Actions the AI abstained on', value: '0%', trend: 'down' },
      { label: 'Reversals required', value: '9%', trend: 'down' },
      { label: 'Escalations to a human', value: '2%', trend: 'down' },
      { label: 'High-impact actions auto-executed', value: '34%', trend: 'down' },
    ],
    horizon: [
      { point: 'Threshold set', risk: 14, note: 'Automation turns on for everything above 90% confidence.' },
      { point: 'First 1,000 actions', risk: 30, note: 'Most are trivial and correct; confidence looks vindicated.' },
      { point: 'First high-impact action', risk: 62, note: 'A 95%-confident answer changes a benefits election.' },
      { point: 'First wrong automated action', risk: 82, note: 'A confident, wrong action alters coverage no human reviewed.' },
      { point: 'Compliance review', risk: 88, note: 'A regulated decision was made automatically with no authority check.' },
      { point: 'Reversal and remediation', risk: 70, note: 'The action is hard to reverse; the employee is already affected.' },
      { point: 'Long-term operation', risk: 48, note: 'Trust in every automated answer is now in question.' },
    ],
    reveal: 'The threshold treated a 95%-confident cafeteria answer and a 95%-confident benefits change as the same event. The model was equally sure of both. Only one of them could ruin someone\'s month.',
    lesson: 'Model confidence is a statement about tokens, not about business risk. A real decision must combine that confidence with evidence quality, business impact, uncertainty, action authority, an abstention option, and an escalation path. AI confidence is not business confidence.',
  },
  rearchitecture: {
    prompt: 'You have seen what the threshold automated. Choose the decision-authority model you would recommend and defend it, and name the single most important thing the "just let it act" instruction missed.',
  },
  receipt: {
    counts: [
      { label: 'decision-governance hours', value: '1000' },
      { label: 'mis-scoped automation incident hours', value: '1200' },
      { label: 'authority and abstention design hours', value: '800' },
      { label: 'calibration and evidence hours', value: '700' },
      { label: 'audit and remediation hours', value: '1100' },
      { label: 'action impact tiers defined', value: '6' },
      { label: 'evidence dimensions confidence ignores', value: '6' },
      { label: 'roles affected by an automated action', value: '7' },
    ],
    represented_hours: 4800,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-008 — Separate AI Confidence from Business Confidence',
    fields: ['context', 'decision', 'model_confidence_role', 'evidence_quality', 'business_impact', 'action_authority', 'abstention_policy', 'escalation_path', 'uncertainty_handling', 'reversal_procedure', 'accepted_tradeoffs', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'For one AI-driven action in your project, what business impact does it carry, and is it reversible?',
      'What evidence quality and what authority should be required before that action fires without a human?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 9 — "Optimize the Decision, Not the Model"
// The strongest model on a benchmark is not the strongest business decision
// system. Decision quality lives in retrieval, routing, and governance.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK9_SCENARIO: AmScenario = {
  version: 'wk9.v1',
  week: 9,
  baseline: false,
  title: 'Optimize the Decision, Not the Model',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'The strongest individual model is not necessarily the strongest business decision system.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the product owner',
    text: 'Swap in the newest, most powerful model. It scores highest on the benchmarks, so our results will be better.',
  },
  initial_system: ['A benchmark score', 'A more powerful model', 'Better results'],
  first_decision: {
    prompt: 'Capture your instinct before the reveal. What would you do first when asked to swap in the top-benchmark model, and what would you measure as success?',
    options: [
      { id: 'swap', label: 'Swap in the top-benchmark model and ship it.' },
      { id: 'compare_bench', label: 'Compare the candidate models on the public benchmark and pick the winner.' },
      { id: 'measure_decisions', label: 'Measure decision quality on our own cases before changing anything.' },
      { id: 'retrieval', label: 'Look at retrieval and evidence quality before touching the model.' },
      { id: 'cost', label: 'Check cost and latency per decision at our real volume first.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: {
      people: 'Who the decision system serves and answers to',
      information: 'What actually drives decision quality',
      decisions: 'Where a stronger model does and does not help',
      operations: 'What the benchmark score never measured',
    },
    people: ['The product owner', 'Finance, on cost per decision', 'Operations, on latency', 'The model vendor', 'The data and retrieval owner', 'The reviewer who audits decisions', 'The employee who receives the decision'],
    information: ['Retrieval quality', 'Evidence and grounding', 'Routing by decision type', 'Guardrails and abstention', 'Latency budget', 'Cost per decision', 'How the answer is actually used', 'Escalation to a human'],
    decisions: ['A low-impact factual lookup, where the model is rarely the limit', 'A retrieval-bound answer, where better evidence helps more', 'A high-impact judgment, where governance helps more', 'A latency-sensitive decision, where a smaller model may win', 'A cost-sensitive, high-volume decision', 'A decision the answer format itself is breaking'],
    operations: ['Cost at real volume', 'Latency at real volume', 'Abstention behavior on weak evidence', 'Retrieval accuracy on our own corpus', 'How often the answer is actually used', 'Whether wrong answers became more convincing', 'The total cost of a wrong decision'],
  },
  signature_reveals: [
    'The new model scored eight points higher on the benchmark and made the same wrong decisions more convincingly, at triple the cost.',
    'The benchmark improved by eight points. Decision accuracy on our own cases improved by zero, because the errors lived in retrieval, not in the model.',
    'The most powerful model in the pipeline was rarely the limiting one. The limit was the evidence it was handed.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'What did "higher benchmark means better results" assume that turned out to be false?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'model_limits', label: 'That the model was the part of the system limiting decision quality.' },
        { id: 'bench_maps', label: 'That a benchmark score maps to good decisions on our own cases.' },
        { id: 'worth_it', label: 'That more power was worth its cost and latency at our real volume.' },
        { id: 'same_errors', label: 'That a stronger model would not just make the same errors more convincingly.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'The model is one component in a decision pipeline. Which part most often limits decision quality?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'retrieval', label: 'Retrieval: the system fetches the wrong or stale evidence.' },
        { id: 'routing', label: 'Routing: every decision goes to the same model regardless of impact.' },
        { id: 'guardrails', label: 'Guardrails: nothing makes the system abstain or escalate.' },
        { id: 'usage', label: 'Usage: a fluent answer is produced but acted on incorrectly.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'What would you have to measure to know a model swap actually improved anything?', mode: 'single', dimension: 'evidence_observability',
      options: [
        { id: 'decision_acc', label: 'Decision accuracy on our own cases, not a public benchmark.' },
        { id: 'cost_lat', label: 'Cost and latency per decision at real volume.' },
        { id: 'abstain', label: 'How often it abstained or escalated when evidence was weak.' },
        { id: 'convince', label: 'Whether wrong answers became more or less convincing.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'Leadership wants the strongest model on the benchmark. How do you justify not simply buying it?', mode: 'single', dimension: 'decision_communication',
      options: [
        { id: 'evidence', label: 'Show that decision quality is bound by retrieval, which the swap does not fix.' },
        { id: 'cost', label: 'Show the cost-per-decision and latency the benchmark score never captured.' },
        { id: 'route', label: 'Propose routing: a strong model only where impact justifies it.' },
        { id: 'measure_first', label: 'Ask to measure decision quality on our cases before spending anything.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Which design do you recommend for the decision system?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'upgrade', label: 'Upgrade the model and keep everything else the same.' },
        { id: 'around_small', label: 'Invest in retrieval, evidence, and routing around a smaller model.' },
        { id: 'route_impact', label: 'Route by decision type: a cheap model for low-impact, a strong model for high-impact.' },
        { id: 'whole_pipeline', label: 'Optimize the whole pipeline and measure decision quality, not model score.' },
        { id: 'custom', label: 'I propose my own decision-system design, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'After the swap changed cost but not outcomes, what was the most important thing you originally missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'wrong_lever', label: 'I optimized the model when the limiting factor was the evidence around it.' },
        { id: 'no_measure', label: 'I trusted a benchmark instead of measuring decisions on our own cases.' },
        { id: 'cost_blind', label: 'I ignored the cost and latency a stronger model adds at real volume.' },
        { id: 'convincing', label: 'I did not foresee that a stronger model makes wrong answers more convincing.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    dashboard: [
      { label: 'Benchmark score', value: '+8 pts', trend: 'up' },
      { label: 'Decision accuracy on our cases', value: 'no change', trend: 'flat' },
      { label: 'Cost per decision', value: '3x', trend: 'down' },
      { label: 'Latency per decision', value: '+40%', trend: 'down' },
      { label: 'Retrieval-caused errors', value: 'unchanged', trend: 'flat' },
      { label: 'Wrong answers rated "convincing"', value: '+22%', trend: 'down' },
      { label: 'Abstentions on weak evidence', value: '0%', trend: 'down' },
      { label: 'Escalations to a human', value: 'no change', trend: 'flat' },
    ],
    horizon: [
      { point: 'Model swapped in', risk: 16, note: 'The benchmark score jumps eight points.' },
      { point: 'First 1,000 decisions', risk: 34, note: 'Answers read better; no one measures whether they are more correct.' },
      { point: 'Finance review', risk: 58, note: 'Cost per decision has tripled with no measured benefit.' },
      { point: 'First wrong decision at scale', risk: 74, note: 'The same retrieval error as before, now argued more convincingly.' },
      { point: 'Decision-quality audit', risk: 82, note: 'Accuracy on our own cases is flat; the model was never the limit.' },
      { point: 'Rollback debate', risk: 66, note: 'The team is attached to the "better" model despite the evidence.' },
      { point: 'Long-term operation', risk: 46, note: 'The real bottleneck, retrieval and routing, is still unaddressed.' },
    ],
    reveal: 'The benchmark said the new model was smarter, and it was. It still made the same wrong decisions, because the wrong evidence was retrieved before the model ever saw the question. The upgrade paid triple to argue the old mistakes more fluently.',
    lesson: 'The strongest model on a benchmark is not the strongest business decision system. Decision quality lives in retrieval, evidence, routing, guardrails, cost, and how the answer is used, far more than in raw model horsepower. Optimize the decision, not the model.',
  },
  rearchitecture: {
    prompt: 'You have seen the swap change cost but not outcomes. Choose the decision-system design you would recommend and defend it with evidence, and name the single most important thing the "just buy the best model" instruction missed.',
  },
  receipt: {
    counts: [
      { label: 'decision-system design hours', value: '1100' },
      { label: 'pipeline redesign hours', value: '1300' },
      { label: 'retrieval and evidence hours', value: '900' },
      { label: 'cost and latency analysis hours', value: '700' },
      { label: 'decision-quality measurement hours', value: '1100' },
      { label: 'pipeline components measured', value: '8' },
      { label: 'decision types routed', value: '6' },
      { label: 'benchmark points that changed nothing', value: '8' },
    ],
    represented_hours: 5100,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-009 — Optimize the Decision System, Not the Model',
    fields: ['context', 'decision', 'decision_quality_metric', 'model_role', 'retrieval_and_evidence', 'routing_by_impact', 'guardrails_and_abstention', 'cost_per_decision', 'latency_budget', 'alternatives', 'accepted_tradeoffs', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'What would most improve the decisions your project makes: a stronger model, better evidence and retrieval, or better routing and governance?',
      'What evidence do you have for that, measured on your own cases rather than a benchmark?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEK 10 — "Systems Live Longer Than Their Builders"
// "Keep it running, we don't need documentation" quietly assumes one
// irreplaceable person, available forever.
// ─────────────────────────────────────────────────────────────────────────────
export const WEEK10_SCENARIO: AmScenario = {
  version: 'wk10.v1',
  week: 10,
  baseline: false,
  title: 'Systems Live Longer Than Their Builders',
  series: 'Architect Mindset',
  experience: 'The Architect Time Machine',
  principle: 'Systems must remain understandable, reproducible, changeable, operable, and governable after the original builder leaves.',
  tagline: 'Gain the lessons experience usually teaches too late.',
  request: {
    from: 'the engineering manager',
    text: 'You built it and you know it best, so just keep it running. We don\'t need documentation.',
  },
  initial_system: ['One builder who knows it', 'A running system', 'No documentation'],
  first_decision: {
    prompt: 'Capture your instinct before the reveal. You are asked to just keep the system running, with no documentation. What would you do first?',
    options: [
      { id: 'keep', label: 'Agree to keep running it yourself, since you know it best.' },
      { id: 'doc_later', label: 'Keep operating and write documentation later if there is time.' },
      { id: 'runbook', label: 'Write runbooks for the common operational tasks first.' },
      { id: 'reproduce', label: 'Make sure the system can be rebuilt from source by someone else.' },
      { id: 'owner', label: 'Name a successor owner and start transferring knowledge now.' },
      { id: 'custom', label: 'I would do something else.', custom: true },
    ],
  },
  zoom_out: {
    titles: {
      people: 'Who must operate this after you leave',
      information: 'What lives only in the builder\'s head',
      decisions: 'What "keep it running" quietly requires',
      operations: 'What survivability actually demands',
    },
    people: ['The engineering manager', 'The future maintainer', 'The on-call operator', 'The business owner', 'Compliance and audit', 'A new hire six months from now', 'The builder, who would like a vacation'],
    information: ['Why each key decision was made', 'How to rebuild the system from scratch', 'The undocumented deploy steps', 'Which failures are normal and which are not', 'The credentials and how they rotate', 'The manual fixes no one wrote down', 'The parts that look wrong but must not be touched'],
    decisions: ['Diagnosing an outage without the builder', 'Changing a feature safely', 'Rebuilding after a machine is lost', 'Passing an audit of past decisions', 'Onboarding a new operator', 'Decommissioning it responsibly one day'],
    operations: ['Reproducible builds from source', 'Documented decisions, as ADRs', 'Runbooks for common tasks and failures', 'A named owner and on-call rotation', 'A change and review process', 'Access and secret rotation without the builder', 'A decommissioning plan'],
  },
  signature_reveals: [
    'The system was designed to run for years. Its entire operating knowledge lived in one person\'s head and would leave the building with them.',
    '"Keep it running" quietly assumed one irreplaceable person, available forever. No system that matters is allowed to depend on that.',
    'The day the builder took a two-week vacation, the on-call team could keep it alive but could not change it. It had become a black box while still in production.',
  ],
  interview_part_1: [
    {
      id: 'q1', text: 'What did "we don\'t need documentation" quietly assume?', mode: 'single', dimension: 'assumption_discovery',
      options: [
        { id: 'forever', label: 'That the builder would be available, and remember everything, forever.' },
        { id: 'no_change', label: 'That the system would never need to change, only to keep running.' },
        { id: 'obvious', label: 'That how it works is obvious enough that no one else needs it written down.' },
        { id: 'no_audit', label: 'That no one would ever have to explain or audit why it was built this way.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q2', text: 'For the system to outlive you, what has to be true about ownership?', mode: 'single', dimension: 'governance_ownership',
      options: [
        { id: 'named', label: 'A named team owns it, with an on-call rotation that is not you.' },
        { id: 'access', label: 'Others can access, deploy, and rotate secrets without the builder.' },
        { id: 'process', label: 'There is a change process so someone else can modify it safely.' },
        { id: 'decommission', label: 'Someone owns the eventual decision to retire it responsibly.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q3', text: 'If you disappeared for six months, which part would no one else be able to run or change?', mode: 'single', dimension: 'system_scope',
      options: [
        { id: 'rebuild', label: 'Rebuilding it from source; the build steps live only in your memory.' },
        { id: 'deploy', label: 'Deploying a change; the process is undocumented and manual.' },
        { id: 'diagnose', label: 'Diagnosing an outage; only you know which failures are normal.' },
        { id: 'why', label: 'Changing it safely; only you know why it was built the way it was.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
    {
      id: 'q4', text: 'What must you transfer so a successor can make a safe change, not just keep the lights on?', mode: 'single', dimension: 'decision_communication',
      options: [
        { id: 'adrs', label: 'The decisions and their reasons, recorded as ADRs.' },
        { id: 'runbooks', label: 'Runbooks for the common operational tasks and failures.' },
        { id: 'repro', label: 'A reproducible build so the system can be rebuilt from source.' },
        { id: 'map', label: 'A map of what must never be touched, and why.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  interview_part_2: [
    {
      id: 'r1', text: 'Which approach to the system\'s longevity do you recommend?', mode: 'single', dimension: 'tradeoff_quality',
      options: [
        { id: 'keep_owner', label: 'Keep the builder as the single owner.' },
        { id: 'document', label: 'Document decisions, runbooks, and reproducible builds.' },
        { id: 'transfer', label: 'Transfer ownership to a named team with an operability review.' },
        { id: 'succession', label: 'Design for succession: reproducibility, ownership, governance, and a decommissioning plan.' },
        { id: 'custom', label: 'I propose my own longevity design, let me describe it.', custom: true },
      ],
    },
    {
      id: 'r2', text: 'When the system became a black box the moment you stepped away, what was the most important thing you originally missed?', mode: 'single', dimension: 'failure_anticipation',
      options: [
        { id: 'head', label: 'I let the operating knowledge live only in my own head.' },
        { id: 'no_repro', label: 'I never made the build reproducible by anyone but me.' },
        { id: 'no_owner', label: 'I never named a successor owner or transferred the system.' },
        { id: 'no_why', label: 'I recorded what the system does but never why it was built that way.' },
        { id: 'custom', label: 'I see it differently, let me write my own answer.', custom: true },
      ],
    },
  ],
  consequence: {
    horizon: [
      { point: 'Handoff to "just keep it running"', risk: 18, note: 'One person holds all the operating knowledge.' },
      { point: 'First month', risk: 26, note: 'It runs fine; the dependency on one head is invisible.' },
      { point: 'Builder takes vacation', risk: 60, note: 'On-call can keep it alive but cannot change it.' },
      { point: 'First outage without the builder', risk: 84, note: 'No runbook; no one knows which failures are normal.' },
      { point: 'Audit of past decisions', risk: 78, note: 'No record of why key choices were made.' },
      { point: 'Builder leaves the company', risk: 88, note: 'The system becomes an un-modifiable black box in production.' },
      { point: 'Attempted change by a successor', risk: 70, note: 'A change breaks something no one knew depended on it.' },
    ],
    reveal: 'The system kept running long after the builder\'s attention, memory, and employment did not. Without reproducible builds, recorded decisions, runbooks, and a named owner, "keep it running" had quietly meant "depend on one person forever", and that person was already gone.',
    lesson: 'A system that matters will outlive whoever built it. It must remain understandable, reproducible, changeable, operable, and governable after the original builder leaves. Designing for the builder\'s absence is not documentation overhead; it is what keeps the system alive.',
  },
  rearchitecture: {
    prompt: 'You have seen what happened when the builder stepped away. Choose the longevity design you would recommend and defend it, and name the single most important thing the "we don\'t need documentation" instruction missed.',
  },
  receipt: {
    counts: [
      { label: 'succession and ownership design hours', value: '1000' },
      { label: 'major redesign for succession hours', value: '1400' },
      { label: 'runbook and reproducibility hours', value: '900' },
      { label: 'knowledge-transfer hours', value: '1000' },
      { label: 'audit and governance hours', value: '1100' },
      { label: 'operating tasks no one else could do', value: '6' },
      { label: 'roles that must operate it after you', value: '7' },
      { label: 'decisions recorded for a successor', value: '10' },
    ],
    represented_hours: 5400,
    minutes: 28,
    qualification: AM_QUALIFICATION,
  },
  adr: {
    title: 'ADR-010 — Design for Life After the Builder',
    fields: ['context', 'decision', 'understandability', 'reproducibility', 'changeability', 'operability', 'governability', 'ownership_transfer', 'runbooks', 'decommissioning_plan', 'accepted_tradeoffs', 'owner'],
  },
  project_transfer: {
    prompt: 'Apply the lesson to your own project.',
    questions: [
      'If you disappeared for six months, what part of your own project could no one else run or change?',
      'What would you put in place first, reproducibility, ownership, runbooks, or recorded decisions, to make it survivable?',
    ],
  },
  commitment_prompt: 'Before I build, I will always',
};
