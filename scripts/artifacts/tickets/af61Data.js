/**
 * AF6.1: the decision record for the 21 legacy agents that belong to no domain.
 *
 * Facts only. No rendering, no I/O, no formatting decisions -- those live in af61Render.js, so
 * these numbers can be re-verified against production without touching a single layout rule.
 *
 * Every figure here was measured on 2026-11-01 from `ai_agent_activity_logs` joined to
 * `ai_agents` on `agent_id`, NOT from `agent_runs`, which holds two rows and is vestigial.
 * Reading the wrong table shows zero activity for agents that run every ten minutes, and makes
 * retiring a live one look safe. That is the single most expensive mistake available here, and
 * the ticket says so in its own words.
 */
'use strict';

const TICKET = 'AF6.1';
const DECIDED_ON = '2026-11-01';
const DECIDED_BY = 'Ali Muwwakkil';
const PACKAGE_ON = '2026-10-14';
const MEASURED_ON = '2026-11-01';
const TOTAL = 21;

/** The ruling, in the words it was given in. */
const RULING = {
  answer: 'Q2: B',
  text: 'Approve retire and absorb, park the third group.',
  consequence: 'Sixteen of the twenty-one now carry a terminal disposition with a named decider '
    + 'and a date. Five do not, and are recorded as PARKED rather than quietly counted as done.',
};

/**
 * What the decision turns on, stated before the tables so a reader cannot miss it: the retire
 * group and the behavior group are two completely different decisions wearing one ticket.
 */
const HEADLINE = {
  ruling: 'Retire the eight that have never run. Absorb the eight that run constantly. Park the '
    + 'five live production rows.',
  why: 'The retire group is genuinely dead and the behavior group is extremely alive, so these '
    + 'were never one decision. Group A has zero runs and zero activity rows between all eight of '
    + 'them. Group B ran 65,735 times in the last thirty days and every one of them was active '
    + 'within the last twenty minutes.',
  parked: 'The five parked rows are the only ones where the judgment was actually hard, and they '
    + 'are the ones nobody has evidence for: no owner, no recorded autonomy source, created by a '
    + 'March governance seed that nobody has claimed since.',
};

/** GROUP A: retire. Measured today, not assumed from the 14 Oct package. */
const GROUP_A = {
  disposition: 'RETIRE',
  n: 8,
  names: [
    'Alumni_Outreach_Agent', 'Alumni_Reengagement_Agent', 'Alumni_Referral_Agent',
    'Corporate_Training_Agent', 'Employer_Relationship_Agent', 'Enterprise_Partnership_Agent',
    'Opportunity_Detection_Agent', 'Trend_Detection_Agent',
  ],
  evidence: 'All eight: enabled FALSE, run_count 0, activity rows 0, last activity never. '
    + 'Re-measured 2026-11-01 and unchanged from the 14 Oct package. Retiring these removes '
    + 'nothing that runs.',
  risk: 'None that is measurable. The measurement that would have changed this answer is a '
    + 'non-zero activity count, and it is zero across all eight.',
};

/** GROUP B: absorb as behaviors. These are machinery, not strays. */
const GROUP_B = {
  disposition: 'ABSORB',
  n: 8,
  rows: [
    ['SessionLifecycle', 66343, 8626, '2026-11-01 17:10'],
    ['BehavioralSignalDetector', 33133, 4305, '2026-11-01 17:10'],
    ['BehavioralTriggerEvaluator', 33026, 4310, '2026-11-01 17:05'],
    ['IntentScoreRecomputer', 21740, 2875, '2026-11-01 17:07'],
    ['OpportunityScoreRecomputer', 16092, 2153, '2026-11-01 17:03'],
    ['SessionReminders', 11056, 1437, '2026-11-01 17:00'],
    ['ICPInsightComputer', 231, 29, '2026-11-01 02:00'],
    ['PortfolioGitHubSyncAgent', 128, 29, '2026-11-01 02:15'],
  ],
  evidence: 'All eight enabled, all at autonomy observe, all active today. Each is wired to a '
    + 'cron in schedulerService.ts and tracked in capabilities/_unresolved.json with the source '
    + 'line that schedules it, which is what "what depends on it" means for this group.',
  risk: 'Retiring any of these takes real functionality down with it. Absorption is a '
    + 'reclassification, not a behavior change: the cron keeps firing and the work keeps '
    + 'happening, under a domain agent that now owns it.',
};

/**
 * GROUP C: parked. Five live production rows.
 *
 * Parked is a recorded disposition, not a decision. The ticket asks for one of assign-to-domain,
 * retire or keep-with-owner for each of the 21, so these five leave AF6.1 short of its own
 * acceptance criteria, and this record says that rather than rounding up.
 */
const GROUP_C = {
  disposition: 'PARKED',
  n: 5,
  rows: [
    {
      name: 'visitor_tracker',
      runs: 1348617,
      act: 1383355,
      d30: 187022,
      last: '2026-11-01 17:14',
      note: 'The busiest agent in the fleet by a wide margin. Retiring it is a major production '
        + 'change, not a tidy-up.',
    },
    {
      name: 'intent_scorer',
      runs: 2203,
      act: 2239,
      d30: 1107,
      last: '2026-11-01 17:07',
      note: 'Half its lifetime activity happened in the last thirty days, so it is getting '
        + 'busier rather than winding down.',
    },
    {
      name: 'forecast_engine',
      runs: 9351,
      act: 9370,
      d30: 52,
      last: '2026-10-26 11:24',
      note: 'CHANGED SINCE THE PACKAGE. Recorded as active on 14 Oct; it has not run since '
        + '26 October. Something stopped and nobody noticed, which is its own finding.',
    },
    {
      name: 'revenue_aggregator',
      runs: 155,
      act: 164,
      d30: 28,
      last: '2026-11-01 15:24',
      note: 'Low volume but live, and it touches revenue figures, which raises the cost of '
        + 'being wrong well above its run count.',
    },
    {
      name: 'calendar_intent_booster',
      runs: 12,
      act: 12,
      d30: 0,
      last: '2026-04-28 15:15',
      note: 'Twelve runs ever, nothing since 28 April. The package recommended retiring it; '
        + 'parked instead, so it stays enabled and dormant.',
    },
  ],
  shared: 'All five: enabled, autonomy observe, autonomy_level_source EMPTY, status idle, '
    + 'created 2026-03-11 by the March governance seed, and NO owner recorded. The missing owner '
    + 'is why they were unresolved in the first place, and parking does not supply one.',
};

/** What parking actually costs, said plainly rather than left as an absence. */
const PARKED_COST = [
  'AF6.1 does not meet its own first acceptance criterion. It asks for a recorded decision for '
  + 'each of the 21; sixteen have one. The ticket stays open.',
  'The consolidation claim stays imprecise. "217 agents down to 10" is defensible for sixteen of '
  + 'these and silent about five, and the five include the busiest agent in the fleet.',
  'calendar_intent_booster stays enabled while being dead for six months, because parking it is '
  + 'not the same as retiring it and this record will not blur the two.',
  'forecast_engine has already stopped on its own, with no decision and no alert. Parking leaves '
  + 'that unexplained rather than resolved.',
];

/** What AF6.1 unblocks, and what it does not. */
const UNBLOCKS = {
  now: 'AF3.3, the consolidation map, can proceed for the sixteen decided agents: eight retire '
    + 'and eight absorb into their domain agent capability sets.',
  not: 'The five parked rows cannot be mapped, so AF3.3 completes at sixteen of twenty-one and '
    + 'inherits the same gap.',
};

/** Nothing was changed. This is the claim most worth being able to prove. */
const NO_WRITE = {
  claim: 'Nothing was retired, disabled, reassigned or modified by this ticket.',
  how: 'The measurement script issues one SELECT and closes its client. There is no UPDATE, no '
    + 'INSERT and no code path in it that could reach one. The eight Group A agents remain '
    + 'enabled=false as they already were; the other thirteen remain enabled=true.',
  acceptance: 'The ticket requires this: "Nothing is retired or disabled by this ticket." The '
    + 'decision is recorded here and executed under AF3.3, where it can be reviewed as a change '
    + 'rather than happening as a side effect of writing a document.',
};

/**
 * A defect in the measurement itself, recorded because the ticket is explicitly about not being
 * misled by a measurement.
 */
const MEASUREMENT_DEFECT = {
  what: 'The first version of the measurement script guessed the column names, and the queries '
    + 'failed: the table is ai_agents.agent_name, not name, and ai_agent_activity_logs has no '
    + 'agent_name at all -- it carries agent_id, a uuid.',
  worse: 'It caught those failures, printed "0 of 21 found", and then listed all 21 agents under '
    + '"no activity rows at all". A failed lookup rendered as a confident zero. That is exactly '
    + 'the shape of error this ticket warns about, where reading the wrong thing makes retiring '
    + 'a live agent look safe.',
  fix: 'A failed query is now fatal and says so: "MEASURE FAILED (this is NOT a measurement of '
    + 'zero)". The schema is read and printed before anything is counted.',
};

/** The acceptance criteria, with honest met flags. */
const CRITERIA = [
  {
    n: 1,
    text: 'All 21 have a recorded decision with a decider and a date.',
    met: false,
    evidence: 'Sixteen do: eight RETIRE and eight ABSORB, decided by Ali Muwwakkil on '
      + '2026-11-01. Five are PARKED, which is a recorded disposition but not one of the three '
      + 'the ticket asks for. Recording them as decided would make this criterion pass and the '
      + 'record false.',
  },
  {
    n: 2,
    text: 'For each of the five live rows, what depends on it is stated, measured from '
      + 'ai_agent_activity_logs rather than agent_runs.',
    met: false,
    evidence: 'Activity is measured for all five from the correct table and is current to '
      + '2026-11-01. What DEPENDS on them is still not stated, because none has an owner, a '
      + 'recorded autonomy source or a caller identified in code. That gap is the reason they '
      + 'are parked, so parking cannot also be the thing that closes it.',
  },
  {
    n: 3,
    text: 'Nothing is retired or disabled by this ticket.',
    met: true,
    evidence: 'No write was issued. The measurement is one SELECT followed by a close. All 21 '
      + 'agents are in the same state they were before this record existed.',
  },
  {
    n: 4,
    text: 'REVIEW STATE set, and the ticket not closed by Claude.',
    met: true,
    evidence: 'READY FOR ALI REVIEW - DOCUMENT. The ruling is recorded; the ticket stays open '
      + 'because five of twenty-one are undecided.',
  },
];

module.exports = {
  TICKET, DECIDED_ON, DECIDED_BY, PACKAGE_ON, MEASURED_ON, TOTAL,
  RULING, HEADLINE, GROUP_A, GROUP_B, GROUP_C, PARKED_COST, UNBLOCKS,
  NO_WRITE, MEASUREMENT_DEFECT, CRITERIA,
};
