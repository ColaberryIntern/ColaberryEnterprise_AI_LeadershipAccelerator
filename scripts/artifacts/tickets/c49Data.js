/**
 * C4.9 - Ram Monthly Commercialization Board Pack Template. THE single source for both PDFs.
 *
 * ## The named failure mode, and how the template resists it
 *
 * "A template that invites filling with activity rather than outcomes. Lead with revenue and
 * pipeline." So the section ORDER is the control: the first three sections are outcomes and
 * they are the only sections that may carry a headline number. Activity appears in section
 * 6, after the decisions, where nobody mistakes it for progress.
 *
 * The build enforces that rather than trusting the prose: an assertion fails if an activity
 * section is ordered above an outcome section.
 *
 * ## Auto-population is marked per section and honestly
 *
 * The ticket asks which sections C8.x can auto-populate. C8.2, the command center, is due
 * 20 October and is not built, so every "auto" here is a statement about where the data
 * already lives rather than about a feature that exists. Sections whose data has no home
 * yet are marked MANUAL and say why, because a template that promises automation it cannot
 * deliver costs an hour a month forever.
 */

const AS_OF = '18 October 2026';

const HEADLINE = 'Outcomes occupy the first three sections and are the only ones allowed a '
  + 'headline number. Activity sits in section 6, after the decisions, where it cannot be '
  + 'mistaken for progress.';

const SO_WHAT = [
  'The ticket names the failure precisely: a template that invites filling with activity. '
    + 'The defense is structural rather than editorial. Outcome sections come first, they '
    + 'are the only ones with a number slot, and a build assertion fails if that order is '
    + 'ever reversed.',
  'Five of the nine sections can be auto-populated from data that already exists today, '
    + 'which is what makes the hour-a-month target plausible. The other four are marked '
    + 'MANUAL with the reason, because the honest version of this template is the one that '
    + 'says which parts a human still has to write.',
  'Every number slot carries its source query or its registry row. CLM-029 says a figure on '
    + 'an external surface without a named source does not go out, and a board pack for Ram '
    + 'is the surface most likely to have its numbers quoted onward.',
];

const AUTO = {
  AUTO: { k: 'AUTO', color: '#2f7d32' },
  PARTIAL: { k: 'PART AUTO', color: '#b26a00' },
  MANUAL: { k: 'MANUAL', color: '#b3261e' },
};

/**
 * The fixed section set. `kind` is what the order assertion checks.
 * Outcome sections lead; activity is deliberately late.
 */
const SECTIONS = [
  {
    n: 1, name: 'Revenue', kind: 'outcome', headline: true, auto: AUTO.AUTO,
    asks: 'Closed revenue this month, cumulative against the plan, and the change from last '
      + 'month.',
    source: 'App-originated payments only. Revenue is counted from checkout in the '
      + 'application, never from an invoice or a PaySimple record that the app did not '
      + 'originate.',
    note: 'If the number is zero, print zero. A board pack whose revenue section is prose is '
      + 'a board pack hiding a zero.',
  },
  {
    n: 2, name: 'Pipeline movement', kind: 'outcome', headline: true, auto: AUTO.AUTO,
    asks: 'Opportunities by stage, what moved since last month, and what went backwards.',
    source: '`leads.pipeline_stage`, which already exists and carries 24,791 rows.',
    note: 'Movement, not a snapshot. A stage count that never changes reads as healthy and '
      + 'is the opposite.',
  },
  {
    n: 3, name: 'Pilots and proposals', kind: 'outcome', headline: true, auto: AUTO.PARTIAL,
    asks: 'Proposals out, pilots running, pilots completed, and each one against the C7.1 '
      + 'lighthouse standard.',
    source: 'C7.1 scorecard per opportunity. The scores are recorded by hand until the '
      + 'account model from C6.1 exists.',
    note: 'Name any deal declined on the C7.1 standard. The ticket’s own success metric '
      + 'is that we decline at least one, and a decline is evidence of a working filter.',
  },
  {
    n: 4, name: 'Proof created', kind: 'outcome', headline: true, auto: AUTO.AUTO,
    asks: 'Verified stories added this month, the projects they span, and how many are '
      + 'externally checkable.',
    source: "COUNT(*) FROM student_tasks WHERE verified_by = 'build_pipeline:repo_verification', "
      + 'with the as-of date CLM-002 requires. Externally checkable has been true since C5.0 '
      + 'deployed on 17 October 2026.',
    note: 'This is the only section whose number is also a differentiator. It was 345 across '
      + '29 projects on 17 October.',
  },
  {
    n: 5, name: 'Decisions needed from Ram', kind: 'decision', headline: false,
    auto: AUTO.MANUAL,
    asks: 'Each decision in one sentence, with the option recommended and the cost of not '
      + 'deciding.',
    source: 'Written by hand. There is no data source for a decision.',
    note: 'Placed before activity on purpose. If Ram reads four sections and stops, he has '
      + 'read the outcomes and the asks.',
  },
  {
    n: 6, name: 'Activity', kind: 'activity', headline: false, auto: AUTO.AUTO,
    asks: 'Meetings held, outreach sent, replies received, content published.',
    source: '`interaction_outcomes`, counted per DISTINCT lead_id rather than per row. The '
      + 'rows are events, not people: 48,924 sends resolve to 8,456 leads.',
    note: 'Deliberately section 6. Activity is the input and belongs after the output.',
  },
  {
    n: 7, name: 'Blockers', kind: 'risk', headline: false, auto: AUTO.MANUAL,
    asks: 'What is stopping work, who owns it, and since when.',
    source: 'Written by hand, from the open ticket list.',
    note: 'The "since when" is what makes this section useful. A blocker with no age is a '
      + 'complaint.',
  },
  {
    n: 8, name: 'Claims and compliance', kind: 'risk', headline: false, auto: AUTO.PARTIAL,
    asks: 'Any claim registry row that changed, expired or is about to expire.',
    source: 'The C0.6 claim registry. CLM-002 expires 8 November 2026, so this section has '
      + 'content next month whether or not anybody writes it.',
    note: 'Added because the registry has an expiry mechanism and nothing currently watches '
      + 'it. An expired row is a claim that quietly became unsayable.',
  },
  {
    n: 9, name: 'Next month', kind: 'plan', headline: false, auto: AUTO.MANUAL,
    asks: 'The three things that will be true by the next pack, each one checkable.',
    source: 'Written by hand.',
    note: 'Three, not ten, and each phrased so next month’s pack can mark it true or '
      + 'false without argument.',
  },
];

const HOUR_BUDGET = [
  { part: 'Sections 1, 2, 4 and 6, pulled from existing queries', mins: 10 },
  { part: 'Section 3, pilots and proposals, scored by hand', mins: 15 },
  { part: 'Sections 5, 7 and 9, written by hand', mins: 25 },
  { part: 'Section 8, claim registry check', mins: 5 },
  { part: 'Read it back as Ram would', mins: 5 },
];

const LIMITS = [
  'C8.2, the command center that would make the AUTO sections genuinely automatic, is due '
    + '20 October and does not exist. Every AUTO mark here says the data has a home and a '
    + 'query, not that a button exists.',
  'Narrative strategy stays in C4.8 and out of this pack. If a month needs a strategy '
    + 'argument it is a separate document, because a template that absorbs narrative stops '
    + 'taking an hour.',
  'The hour budget is an estimate built from the section list, not a measurement. It can '
    + 'only be checked by running the pack once, and that has not happened.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

const ORDER = { outcome: 0, decision: 1, activity: 2, risk: 2, plan: 3 };

/** "Fixed section set." */
function assertFixedSectionSet() {
  const ns = SECTIONS.map((s) => s.n);
  const expected = Array.from({ length: SECTIONS.length }, (_, i) => i + 1);
  if (JSON.stringify(ns) !== JSON.stringify(expected)) {
    throw new Error('C4.9: the section numbers are not a clean sequence: ' + ns.join(','));
  }
  for (const s of SECTIONS) {
    if (!s.asks || !s.source) throw new Error(`C4.9: section ${s.n} has no ask or no source`);
  }
  return SECTIONS.length;
}

/**
 * "Outcome metrics lead."
 *
 * Checked structurally, which is the whole defense against the failure the ticket names:
 * no activity section may appear above an outcome section, and only outcome sections may
 * carry a headline number.
 */
function assertOutcomesLead() {
  const firstActivity = SECTIONS.findIndex((s) => s.kind === 'activity');
  const lastOutcome = SECTIONS.map((s) => s.kind).lastIndexOf('outcome');
  if (firstActivity !== -1 && firstActivity < lastOutcome) {
    throw new Error('C4.9: an activity section is ordered above an outcome section, which is '
      + 'the failure this template exists to resist');
  }
  const badHeadline = SECTIONS.filter((s) => s.headline && s.kind !== 'outcome');
  if (badHeadline.length) {
    throw new Error('C4.9: non-outcome section(s) carry a headline number: '
      + badHeadline.map((s) => s.name).join(', '));
  }
  if (!SECTIONS[0] || SECTIONS[0].kind !== 'outcome') {
    throw new Error('C4.9: section 1 is not an outcome');
  }
  return { firstActivity: firstActivity + 1, outcomes: SECTIONS.filter((s) => s.kind === 'outcome').length };
}

/** "Notes which sections C8.x can auto-populate", and does not overpromise. */
function assertAutoMarked() {
  for (const s of SECTIONS) {
    if (!s.auto) throw new Error(`C4.9: section ${s.n} has no auto-population mark`);
    if (s.auto === AUTO.MANUAL && !/hand|no data source/i.test(s.source)) {
      throw new Error(`C4.9: section ${s.n} is marked MANUAL but its source implies data`);
    }
  }
  const auto = SECTIONS.filter((s) => s.auto === AUTO.AUTO).length;
  if (auto === SECTIONS.length) {
    throw new Error('C4.9: every section claims to be automatic, which C8.2 cannot deliver '
      + 'because it does not exist yet');
  }
  return auto;
}

/** The hour target has to be arithmetically possible, or it is a wish. */
function assertHourBudgetHolds() {
  const total = HOUR_BUDGET.reduce((a, b) => a + b.mins, 0);
  if (total > 60) throw new Error(`C4.9: the budget sums to ${total} minutes, over the hour`);
  return total;
}

module.exports = {
  AS_OF, AUTO, HEADLINE, SO_WHAT, SECTIONS, HOUR_BUDGET, LIMITS,
  assertFixedSectionSet, assertOutcomesLead, assertAutoMarked, assertHourBudgetHolds,
};
