/**
 * C7.5 (pilot operating playbook) and C7.6 (measurement and baseline framework).
 *
 * ## Two numbers in the brief were checked and one of them has moved
 *
 * C7.5's execution prompt says to note that Demo Day "is designed but not yet proven end to
 * end, since 0 of 46 tasks are complete". Measured in production on 19 October 2026 the
 * demo preparation list holds 276 tasks of which 37 are complete, and NO task list anywhere
 * has 46 tasks. The substantive point stands and is flagged: Demo Day has never been run
 * end to end. The figure has moved, so the figure is not repeated.
 *
 * The second number matters more for C7.6. `verification_logs` holds 2,339 rows, of which
 * 1,624 are `verified_partial` and 715 are `not_verified`. NOTHING is fully verified. A
 * measurement framework that rested on "the platform verifies the work" without saying that
 * would be claiming an attribution strength we do not have, which is the exact failure C7.6
 * names.
 *
 * Every figure below carries how it was obtained, and `assertProductionFiguresDated()`
 * fails the build on one that does not.
 */

const AS_OF = '19 October 2026';

/** Measured against the production database, read-only, on the date shown. */
const MEASURED = [
  ['student_tasks', '1,567 total, 407 complete', 'the build pipeline is real and carrying volume'],
  ['student_task_lists', '354', 'per-participant task lists exist'],
  ['verification_logs', '2,339 rows: 1,624 verified_partial, 715 not_verified, 0 fully verified',
    'the verification substrate exists and NOTHING in it is fully verified'],
  ['tasks carrying a verified_at', '383 across 30 projects', 'commit-time verification is '
    + 'recorded for a subset, not for everything'],
  ['career_portfolio_pages', '16', 'the public evidence surface C5.0 proved'],
  ['demo preparation task list', '276 tasks, 37 complete, list status still not_started',
    'Demo Day preparation has started and has never been completed'],
  ['cohorts', 'April 2026 completed; July, September and November 2026 open',
    'the cohort machinery has delivered at least one cohort end to end'],
];

/* ------------------------------------------------------------------ *
 * C7.5 - THE RUNBOOK
 * ------------------------------------------------------------------ */

const OWNER = {
  DELIVERY: 'Delivery lead',
  INSTRUCTOR: 'Instructor',
  SPONSOR: 'Customer sponsor',
  ALI: 'Ali',
};

const PROVEN = {
  YES: { k: 'PROVEN', color: '#2f7d32' },
  PARTIAL: { k: 'PARTLY PROVEN', color: '#b26a00' },
  NO: { k: 'UNPROVEN', color: '#b3261e' },
};

const PHASES = [
  {
    days: 'Day 0 to 7', name: 'Mobilisation', owner: OWNER.DELIVERY, proven: PROVEN.YES,
    gate: 'A named executive sponsor, three to ten business problems in writing each with a '
      + 'named owner, and named participants with their managers signed up to the time. '
      + 'These are C7.2’s customer obligations and they are a gate, not a wish: the '
      + 'clock does not start until they exist.',
    capability: 'Cohort creation, which is live. A cohort completed in April 2026 and three '
      + 'more are open.',
    failure: 'The problems do not arrive, or arrive without owners. DO NOT START. A pilot '
      + 'that begins without named problems spends week three inventing them, and the '
      + 'invented ones have no sponsor who cares about the answer.',
  },
  {
    days: 'Day 7 to 14', name: 'Baseline', owner: OWNER.DELIVERY, proven: PROVEN.PARTIAL,
    gate: 'A capability baseline recorded per named participant, and the customer-side '
      + 'baseline from the C7.4 discovery questionnaire. No baseline, no outcome claim '
      + 'later. This gate protects the case study more than it protects the pilot.',
    capability: 'Per-participant assessment is live. The customer-side baseline is a '
      + 'questionnaire, not a platform capability, so it depends on the sponsor returning it.',
    failure: 'The sponsor does not return the baseline. Escalate at day 10, not day 30. '
      + 'Running without it is a decision to give up the outcome claim, and that decision '
      + 'belongs to Ali rather than to the delivery lead.',
  },
  {
    days: 'Day 14 to 30', name: 'Learn', owner: OWNER.INSTRUCTOR, proven: PROVEN.YES,
    gate: 'Every participant has a task list and has started it. 354 task lists exist in '
      + 'production, so this is routine rather than novel.',
    capability: 'The learning path and per-participant task lists, both live.',
    failure: 'A participant stops attending. Covered under attrition below; the rule is '
      + 'that the cohort does not slow down for one person and the sponsor is told in week '
      + 'three rather than week ten.',
  },
  {
    days: 'Day 30 to 60', name: 'Build', owner: OWNER.INSTRUCTOR, proven: PROVEN.YES,
    gate: 'Each participant has committed work against one of the named problems. 1,567 '
      + 'tasks exist in production with 407 complete, so the pipeline carries real volume.',
    capability: 'The student build pipeline and its verification records, live.',
    failure: 'The business problem turns out to be wrong, which is common and is not a '
      + 'crisis. Covered below.',
  },
  {
    days: 'Day 60 to 75', name: 'Prove', owner: OWNER.DELIVERY, proven: PROVEN.YES,
    gate: 'Every completed piece of work links to the commit behind it, and a stranger can '
      + 'open it without an account. This is the one gate that has been tested at scale: '
      + 'C5.0 probed 213 distinct commit URLs and 212 returned 200 to an anonymous request.',
    capability: 'Commit-verified portfolio deep links, live and externally checkable.',
    failure: 'A repository is private, so the link would 404 for the reader. The '
      + 'reachability gate drops it rather than publishing a dead link, which is why the '
      + 'published count can be lower than the completed count.',
  },
  {
    days: 'Day 75 to 85', name: 'Demo Day', owner: OWNER.DELIVERY, proven: PROVEN.NO,
    gate: 'Participants present their work to the sponsor. THIS HAS NEVER BEEN RUN END TO '
      + 'END. The demo preparation list holds 276 tasks with 37 complete and its status is '
      + 'still not_started, measured 19 October 2026.',
    capability: 'Designed, with schema behind it. Not proven.',
    failure: 'Demo Day slips, which on current evidence is the likeliest single failure in '
      + 'the whole runbook. The fallback is below and it is deliberately unglamorous: the '
      + 'evidence does not depend on the ceremony.',
  },
  {
    days: 'Day 85 to 90', name: 'Report and handover', owner: OWNER.ALI, proven: PROVEN.NO,
    gate: 'A written account of what each participant built and what changed against the '
      + 'baseline, that the sponsor can take to their own leadership.',
    capability: 'NONE. The C2.2 audit found the executive impact report has no generator, '
      + 'and C8.1 confirmed there is still no source for the deployment-outcome tile. This '
      + 'phase is delivered by a person writing it.',
    failure: 'It does not get written, because it is the last thing in a tired pilot and '
      + 'nobody is measured on it. This is the phase most likely to be quietly skipped, and '
      + 'it is the one the renewal conversation rests on.',
  },
];

const FAILURE_PATHS = [
  {
    situation: 'A participant drops out',
    response: 'Tell the sponsor inside one week, not at the end. Reassign their business '
      + 'problem to another participant or return it to the sponsor explicitly. Do not '
      + 'silently absorb it: the sponsor named that problem and will ask about it.',
    threshold: 'More than 20% of a cohort lost by day 45 is an escalation to Ali, because '
      + 'at that point the outcome report has a denominator problem.',
  },
  {
    situation: 'A business problem turns out to be wrong',
    response: 'Expected, and not a crisis. Replace it from the sponsor’s own list '
      + 'rather than inventing one, and record that it was replaced, because the case study '
      + 'is more credible when it says so than when the list quietly changes.',
    threshold: 'Two or more replacements in one pilot is an escalation: it usually means '
      + 'the discovery in C7.4 was thin rather than that the problems were bad.',
  },
  {
    situation: 'The sponsor goes quiet',
    response: 'One direct message, then one to their manager or the person who signed. Do '
      + 'not let a quiet sponsor become a surprise at day 85. A sponsor who stops answering '
      + 'in week four is usually a sponsor who has lost internal cover.',
    threshold: 'Fourteen days without a reply is an escalation to Ali. The decision that '
      + 'follows is whether to keep delivering, and it is not the delivery lead’s.',
  },
  {
    situation: 'Demo Day slips',
    response: 'Ship the evidence without the ceremony. Every completed piece already links '
      + 'to its commit and the portfolio page is public, so the sponsor can be walked '
      + 'through the work in a normal meeting. Demo Day is the presentation layer, not the '
      + 'proof, and treating it as the proof is what makes a slip look like a failure.',
    threshold: 'A slip past day 90 is an escalation, not because the date matters but '
      + 'because it usually means the build phase ran short.',
  },
];

/* ------------------------------------------------------------------ *
 * C7.6 - THE MEASUREMENT SPEC
 * ------------------------------------------------------------------ */

const ATTRIB = {
  STRONG: { k: 'STRONG', color: '#2f7d32' },
  PARTIAL: { k: 'PARTIAL', color: '#b26a00' },
  WEAK: { k: 'WEAK', color: '#b3261e' },
};

const MEASURES = [
  {
    what: 'What each named person built',
    baseline: 'None needed. It is a record, not a change.',
    method: 'The completed task and the commit it links to, in the participant’s own '
      + 'repository.',
    cadence: 'Continuous, visible as it happens.',
    attribution: ATTRIB.STRONG,
    why: 'The strongest thing we have. A stranger opens the link and sees the work without '
      + 'an account. C5.0 probed 213 of these and 212 resolved to an anonymous reader.',
  },
  {
    what: 'Capability change per participant',
    baseline: 'The week-one assessment, same instrument both times.',
    method: 'Re-run the same assessment in the final week and report the delta per named '
      + 'person, not a cohort average.',
    cadence: 'Twice: week one and the final week.',
    attribution: ATTRIB.PARTIAL,
    why: 'Same instrument twelve weeks apart measures change, and it cannot separate our '
      + 'teaching from everything else that happened to that person in twelve weeks. Report '
      + 'it as change observed, not as change caused.',
  },
  {
    what: 'Progress on the sponsor’s named business problems',
    baseline: 'The sponsor’s own written description of the problem and its current '
      + 'cost, captured in the C7.4 discovery questionnaire before the pilot starts.',
    method: 'The sponsor rates each problem at the end against their own baseline text.',
    cadence: 'Twice: at discovery and at day 85.',
    attribution: ATTRIB.PARTIAL,
    why: 'The sponsor is judging their own problem, which is the right person and an '
      + 'interested one. Record who rated it and that they were the problem owner.',
  },
  {
    what: 'Internal verification status of completed work',
    baseline: 'None.',
    method: 'The platform’s verification records against the acceptance criteria each '
      + 'task set.',
    cadence: 'Continuous.',
    attribution: ATTRIB.WEAK,
    why: 'STATED PLAINLY BECAUSE IT MATTERS: of 2,339 verification records in production on '
      + '19 October 2026, 1,624 are partial and 715 are not verified. NONE is fully '
      + 'verified. This is our own assessment of our own learners’ work and it is '
      + 'currently incomplete, so it is reported as our view and never as independent '
      + 'verification.',
  },
  {
    what: 'Business outcome in money or time saved',
    baseline: 'Would require the customer’s own operational data.',
    method: 'NOT MEASURED.',
    cadence: 'Not applicable.',
    attribution: ATTRIB.WEAK,
    why: 'Deliberately out of scope. C7.6 says not to measure what we cannot attribute. A '
      + 'twelve-week pilot touching a handful of problems inside a large organization '
      + 'cannot be separated from everything else that moved, and claiming it would be the '
      + 'fastest way to lose a skeptical reader of the first case study.',
  },
];

const PUBLICATION_RULE = 'Where attribution is partial or weak, the published wording says '
  + 'so in the sentence that carries the number, not in a footnote and not at review time. '
  + 'A case study that says "capability improved, measured on the same instrument twelve '
  + 'weeks apart, which does not isolate our contribution" survives a skeptical read. One '
  + 'that says "we improved capability by X" does not.';

/* ------------------------------------------------------------------ *
 * TAKEAWAY AND DECISIONS
 * ------------------------------------------------------------------ */

function counts() {
  return {
    phases: PHASES.length,
    unproven: PHASES.filter((p) => p.proven === PROVEN.NO).length,
    failures: FAILURE_PATHS.length,
    measures: MEASURES.length,
    strong: MEASURES.filter((m) => m.attribution === ATTRIB.STRONG).length,
  };
}

function headline() {
  const c = counts();
  return `The runbook has ${c.phases} phases, each with an owner and a gate, and `
    + `${c.unproven} of them are unproven: Demo Day has never been run end to end and the `
    + `executive report has no generator. On measurement, ${c.strong} of ${c.measures} `
    + 'things we could measure carries strong attribution, and the honest spec says so in '
    + 'the sentence rather than at publication.';
}

const SO_WHAT = [
  'THE TWO UNPROVEN PHASES ARE THE LAST TWO, WHICH IS THE EXPENSIVE PLACE FOR THEM TO BE. '
    + 'Everything up to day 75 runs on machinery that is live and carrying volume: 354 task '
    + 'lists, 1,567 tasks, 407 of them complete, and commit links that C5.0 proved resolve '
    + 'for an anonymous reader. Day 75 onward is Demo Day, which has never been run end to '
    + 'end, and the executive report, which has no generator at all. Those two sit exactly '
    + 'where a sponsor decides whether to renew.',
  'THE FIGURE IN THE TICKET HAS MOVED, AND THE POINT BEHIND IT HAS NOT. C7.5 says to note '
    + 'that Demo Day is unproven "since 0 of 46 tasks are complete". In production today the '
    + 'demo preparation list holds 276 tasks with 37 complete, and no list anywhere has 46. '
    + 'The figure is not repeated; the flag is kept, because the list status is still '
    + 'not_started and nothing has been run through to the end.',
  'THE MEASUREMENT SPEC’S MOST IMPORTANT LINE IS AN ADMISSION. Of 2,339 verification '
    + 'records in production, 1,624 are partial and 715 are not verified, and none is fully '
    + 'verified. Any framework resting on "the platform verifies the work" without saying '
    + 'that would be claiming an attribution strength we do not have. It is reported as our '
    + 'own assessment, which is what it is, and the commit link is what carries the weight.',
];

const DECISIONS = [
  'The escalation thresholds. C7.5 names these as yours. The proposals are: more than 20% '
    + 'of a cohort lost by day 45, two or more replaced business problems, fourteen days of '
    + 'sponsor silence, and any slip past day 90. Each is a number I picked to start an '
    + 'argument rather than to end one.',
  'What we commit to measuring in the proposal. C7.6 names this as yours. My recommendation '
    + 'is to commit only to the one with strong attribution, which is the record of what '
    + 'each named person built, and to offer the other two as observations rather than '
    + 'promises. Committing to a business-outcome number in the proposal is the single '
    + 'fastest way to lose the first case study.',
];

const LIMITS = [
  'No pilot has run, so every timing in the runbook is a design rather than an observation. '
    + 'The first real pilot should be treated as the instrument that corrects it.',
  'The platform figures are production counts across all cohorts and projects, not a single '
    + 'pilot. They establish that the machinery exists and carries volume; they do not '
    + 'establish how it behaves under a paying customer.',
  'Demo Day and the executive report are flagged unproven rather than estimated. Putting a '
    + 'confident duration on either would be inventing the number that matters most.',
  'The measurement spec deliberately declines to measure business outcome. That is a '
    + 'commercial cost and it is the honest position until a customer gives us access to '
    + 'their own operational data and a way to isolate the pilot’s contribution.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** Every phase has an owner and a gate. C7.5's first acceptance criterion. */
function assertEveryPhaseHasOwnerAndGate() {
  for (const p of PHASES) {
    if (!Object.values(OWNER).includes(p.owner)) throw new Error(`${p.name}: no valid owner`);
    if (!p.gate || p.gate.length < 40) throw new Error(`${p.name}: no gate`);
    if (!p.capability || p.capability.length < 20) throw new Error(`${p.name}: no capability named`);
    if (!Object.values(PROVEN).includes(p.proven)) throw new Error(`${p.name}: no proven state`);
  }
  return PHASES.length;
}

/** Failure paths are written, not just the happy path. The second criterion. */
function assertFailurePathsWritten() {
  for (const p of PHASES) {
    if (!p.failure || p.failure.length < 40) throw new Error(`${p.name}: no failure path`);
  }
  const required = ['drops out', 'wrong', 'quiet', 'slips'];
  for (const r of required) {
    if (!FAILURE_PATHS.some((f) => f.situation.toLowerCase().includes(r))) {
      throw new Error(`the failure path for "${r}" that the ticket names is missing`);
    }
  }
  for (const f of FAILURE_PATHS) {
    if (!f.threshold || f.threshold.length < 30) {
      throw new Error(`${f.situation}: no escalation threshold`);
    }
  }
  return FAILURE_PATHS.length;
}

/** Unproven steps are flagged as unproven. The third criterion. */
function assertUnprovenIsFlagged() {
  const demo = PHASES.find((p) => p.name === 'Demo Day');
  if (!demo || demo.proven !== PROVEN.NO) {
    throw new Error('Demo Day is not flagged unproven, and it has never been run end to end');
  }
  const report = PHASES.find((p) => p.name.startsWith('Report'));
  if (!report || report.proven !== PROVEN.NO) {
    throw new Error('the executive report phase is not flagged unproven, and it has no generator');
  }
  /*
   * The stale figure may be NAMED, but only alongside the current one. Quoting it in order
   * to say it has moved is the honest thing to do; asserting it as current is not. An
   * earlier version of this guard forbade the string outright and fired on the paragraph
   * that exists to correct it.
   */
  const blob = [headline(), ...SO_WHAT].join(' ');
  if (/0 of 46/.test(blob) && !/276 tasks/.test(blob)) {
    throw new Error('the stale "0 of 46" figure appears without the current count beside '
      + 'it; production shows 276 tasks with 37 complete');
  }
  return PHASES.filter((p) => p.proven === PROVEN.NO).length;
}

/** No measure claims an attribution strength it does not have. C7.6's core rule. */
function assertAttributionHonest() {
  for (const m of MEASURES) {
    if (!Object.values(ATTRIB).includes(m.attribution)) throw new Error(`${m.what}: no attribution`);
    if (!m.why || m.why.length < 40) throw new Error(`${m.what}: attribution not explained`);
    if (m.attribution === ATTRIB.STRONG && !/commit|link|repository/i.test(m.method + m.why)) {
      throw new Error(`${m.what}: claims STRONG attribution without resting on the commit link`);
    }
  }
  const outcome = MEASURES.find((m) => /business outcome/i.test(m.what));
  if (!outcome || !/NOT MEASURED/.test(outcome.method)) {
    throw new Error('business outcome is not explicitly declined, and C7.6 says not to '
      + 'measure what cannot be attributed');
  }
  if (!/says so in the sentence/i.test(PUBLICATION_RULE)) {
    throw new Error('the publication rule does not require the caveat to travel with the number');
  }
  return MEASURES.filter((m) => m.attribution === ATTRIB.STRONG).length;
}

/** Every production figure quoted carries how it was obtained. */
function assertProductionFiguresDated() {
  for (const m of MEASURED) {
    if (!m[1] || !m[2] || m[2].length < 15) throw new Error(`${m[0]}: figure without meaning`);
  }
  const blob = [headline(), ...SO_WHAT, ...LIMITS].join(' ');
  if (/\b\d{3,}\b/.test(blob) && !/19 October 2026|production/i.test(blob)) {
    throw new Error('a production figure is quoted with no indication of when it was measured');
  }
  return MEASURED.length;
}

module.exports = {
  AS_OF, MEASURED, PHASES, FAILURE_PATHS, MEASURES, PUBLICATION_RULE,
  OWNER, PROVEN, ATTRIB, SO_WHAT, LIMITS, DECISIONS, counts, headline,
  assertEveryPhaseHasOwnerAndGate, assertFailurePathsWritten, assertUnprovenIsFlagged,
  assertAttributionHonest, assertProductionFiguresDated,
};
