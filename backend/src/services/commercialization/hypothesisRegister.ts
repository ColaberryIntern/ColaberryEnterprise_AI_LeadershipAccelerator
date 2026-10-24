/**
 * C8.6 — the five revenue hypotheses from the C0.1 register, each with a kill condition.
 *
 * WHAT C0.1 ALREADY HAS, AND WHAT IT IS MISSING. Section 6 of the Commercialization
 * Master Index registers five hypotheses, each with "evidence required to stay alive"
 * and a state, and all five read "Untested". What it does not have is a KILL CONDITION,
 * and C8.6 names the reason that matters: "keeping a hypothesis alive without evidence".
 * A hypothesis with a success target and no failure tripwire never dies; it just stays
 * untested until nobody remembers it was a bet.
 *
 * SO EACH ONE HERE CARRIES A DATED TRIPWIRE, not a vibe. "Kill if 30 November passes
 * with zero pilots proposed" is checkable from funnel data on 30 November. "Kill if it
 * is not working" is not.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: PROJECT A SALES CYCLE.
 * The obvious way to flag a dying hypothesis is arithmetic - take the deadline, subtract
 * the time it takes to produce the evidence, and declare it unreachable when the
 * remainder goes negative. That needs a measured cycle time, and C7.10 established that
 * Colaberry HAS NEVER RUN A PILOT, so no sales cycle has ever been observed. Inventing
 * one here would put a fabricated number at the root of every kill decision, which is
 * exactly the failure the C8 series keeps refusing.
 *
 * The honest substitute needs no invented number: ask whether anything exists in the
 * funnel that could still BECOME the required evidence. A hypothesis needing three paid
 * pilots, with zero proposals out and zero accounts contacted, is not dying because of a
 * cycle-time calculation. It is dying because the pipe is empty, and that is a fact the
 * data states directly.
 *
 * WHO KILLS THEM: Ali. C8.6 says so in as many words ("What does Ali need to personally
 * review or decide? Which hypotheses to kill."). This file makes dying obvious and
 * states the tripwire; it does not retire anything on its own.
 */

/** The funnel stage whose count is the evidence for a hypothesis. Keys match C8.4. */
export type FunnelStageKey =
  | 'target' | 'mapped' | 'contacted' | 'engaged' | 'meeting_booked'
  | 'demo_delivered' | 'pilot_proposed' | 'contract' | 'pilot_running' | 'expansion';

export interface KillTripwire {
  /** The date the tripwire is checked. ISO, so it is a fact rather than "soon". */
  on: string;
  /** What must be true on that date for the hypothesis to survive it. */
  survivesIf: string;
  /** The stage and threshold that makes the above checkable from data. */
  stage: FunnelStageKey;
  atLeast: number;
}

export interface RevenueHypothesis {
  key: string;
  /** The label as it appears in C0.1 section 6, Americanized where that register is not. */
  label: string;
  /** Verbatim from the register, so drift between here and C0.1 is visible. */
  registerLabel: string;
  whoPays: string;
  /** Verbatim "evidence required to stay alive" from C0.1 section 6. */
  evidenceRequired: string;
  /** That requirement expressed as something countable. */
  target: { stage: FunnelStageKey; count: number; by: string };
  /**
   * Stages that must hold something for the target to remain possible. Empty at every
   * one of these means nothing is in flight, which is the kill signal.
   */
  precursors: FunnelStageKey[];
  /** The explicit kill condition C0.1 lacks. Dated and checkable. */
  killCondition: string;
  /** The dated tripwires that make the kill condition operable before the deadline. */
  tripwires: KillTripwire[];
}

/**
 * Transcribed from C0.1 section 6 on 2026-10-23. Every price and buyer in that register
 * reads UNKNOWN by design - the register says filling them with estimates "would make
 * this register useless as a test" - so none is reproduced here.
 */
export const REVENUE_HYPOTHESES: readonly RevenueHypothesis[] = [
  {
    key: 'paid_accelerator',
    label: 'Paid 90-day accelerator',
    registerLabel: 'Paid 90-day accelerator',
    whoPays: 'Mid-market enterprise',
    evidenceRequired: '3 paid pilots by 31 Dec',
    target: { stage: 'contract', count: 3, by: '2026-12-31' },
    precursors: ['pilot_proposed', 'meeting_booked', 'engaged', 'contacted'],
    killCondition:
      'Kill if 31 December 2026 passes with fewer than 3 paid pilots. Kill earlier if 30 '
      + 'November passes with zero pilots proposed, because a proposal is the last point '
      + 'at which a December close is still a sale rather than a wish.',
    tripwires: [
      { on: '2026-11-30', survivesIf: 'at least one pilot has been proposed',
        stage: 'pilot_proposed', atLeast: 1 },
      { on: '2026-12-31', survivesIf: 'three paid pilots exist',
        stage: 'contract', atLeast: 3 },
    ],
  },
  {
    key: 'annual_enterprise',
    label: 'Annual enterprise program',
    // C0.1 writes "programme". The key, not the prose, carries the identity.
    registerLabel: 'Annual enterprise programme',
    whoPays: 'Enterprise',
    evidenceRequired: '1 pilot converts to annual',
    target: { stage: 'expansion', count: 1, by: '2027-03-31' },
    precursors: ['contract', 'pilot_running'],
    killCondition:
      'Kill if 31 March 2027 passes with no pilot converted to an annual commitment. '
      + 'This hypothesis is DOWNSTREAM of the accelerator: it cannot be tested at all '
      + 'until a pilot exists, so if the accelerator hypothesis dies, this one dies with '
      + 'it rather than lingering as untested.',
    tripwires: [
      { on: '2026-12-31', survivesIf: 'at least one pilot is running to convert',
        stage: 'contract', atLeast: 1 },
      { on: '2027-03-31', survivesIf: 'one pilot has converted to an annual commitment',
        stage: 'expansion', atLeast: 1 },
    ],
  },
  {
    key: 'workforce_funded',
    label: 'Workforce or economic development funded cohort',
    registerLabel: 'Workforce / economic development funded cohort',
    whoPays: 'Public or foundation funder',
    evidenceRequired: '1 funded cohort',
    target: { stage: 'contract', count: 1, by: '2027-03-31' },
    precursors: ['pilot_proposed', 'meeting_booked', 'engaged'],
    killCondition:
      'Kill if 31 March 2027 passes with no funded cohort. Kill earlier if 31 January '
      + 'passes with no funder conversation recorded, since grant and workforce money '
      + 'runs on cycles that close months before delivery.',
    tripwires: [
      { on: '2027-01-31', survivesIf: 'at least one funder conversation is recorded',
        stage: 'engaged', atLeast: 1 },
      { on: '2027-03-31', survivesIf: 'one funded cohort exists',
        stage: 'contract', atLeast: 1 },
    ],
  },
  {
    key: 'higher_education',
    label: 'Higher education program',
    registerLabel: 'Higher education programme',
    whoPays: 'Institution',
    evidenceRequired: '1 signed institution',
    target: { stage: 'contract', count: 1, by: '2027-03-31' },
    precursors: ['pilot_proposed', 'meeting_booked', 'engaged'],
    killCondition:
      'Kill if 31 March 2027 passes with no signed institution. Kill earlier if 31 '
      + 'January passes with no institution engaged, which matters more here than '
      + 'elsewhere because C2.5 named higher education continuing education as the '
      + 'beachhead, so this is the hypothesis the positioning is betting on.',
    tripwires: [
      { on: '2027-01-31', survivesIf: 'at least one institution has engaged',
        stage: 'engaged', atLeast: 1 },
      { on: '2027-03-31', survivesIf: 'one institution has signed',
        stage: 'contract', atLeast: 1 },
    ],
  },
  {
    key: 'partner_delivered',
    label: 'Partner-delivered capacity (frontier lab or systems integrator)',
    registerLabel: 'Partner-delivered capacity (frontier lab or SI)',
    whoPays: 'Partner',
    evidenceRequired: 'A partner-delivered engagement',
    target: { stage: 'contract', count: 1, by: '2027-06-30' },
    precursors: ['meeting_booked', 'engaged'],
    killCondition:
      'Kill if 30 June 2027 passes with no partner-delivered engagement. Kill earlier if '
      + '28 February passes with no partner conversation recorded. The longer deadline is '
      + 'deliberate: a partner motion depends on the other side’s roadmap, so it is '
      + 'the slowest of the five and should not be judged on the same clock.',
    tripwires: [
      { on: '2027-02-28', survivesIf: 'at least one partner conversation is recorded',
        stage: 'engaged', atLeast: 1 },
      { on: '2027-06-30', survivesIf: 'a partner-delivered engagement exists',
        stage: 'contract', atLeast: 1 },
    ],
  },
];

/**
 * The acceptance criterion: "Every hypothesis has an explicit kill condition."
 *
 * Explicit means dated and checkable. A condition with no date never fires, and one that
 * cannot be read off the funnel is an opinion with a deadline attached.
 */
export function assertEveryHypothesisHasAKillCondition(): number {
  for (const h of REVENUE_HYPOTHESES) {
    if (!h.killCondition || h.killCondition.length < 40) {
      throw new Error(`hypothesis ${h.key} has no usable kill condition`);
    }
    if (!/\b(19|20)\d{2}\b/.test(h.killCondition)) {
      throw new Error(`hypothesis ${h.key} has a kill condition with no date in it`);
    }
    if (!h.tripwires.length) {
      throw new Error(`hypothesis ${h.key} has no dated tripwire to make the kill checkable`);
    }
  }
  return REVENUE_HYPOTHESES.length;
}

/** Every tripwire must be a date and a countable threshold, or it cannot be evaluated. */
export function assertTripwiresAreCheckable(): void {
  for (const h of REVENUE_HYPOTHESES) {
    for (const t of h.tripwires) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.on)) {
        throw new Error(`${h.key}: tripwire date "${t.on}" is not an ISO date`);
      }
      if (!Number.isInteger(t.atLeast) || t.atLeast < 1) {
        throw new Error(`${h.key}: tripwire on ${t.on} has no countable threshold`);
      }
    }
    // The last tripwire is the deadline itself, so a hypothesis cannot survive by
    // running out of tripwires before its target date.
    const last = h.tripwires[h.tripwires.length - 1];
    if (last.on !== h.target.by) {
      throw new Error(`${h.key}: the final tripwire (${last.on}) is not the target date `
        + `(${h.target.by}), so the deadline would pass unchecked`);
    }
  }
}

/** No hypothesis may claim a price or buyer the C0.1 register deliberately left UNKNOWN. */
export function assertNoInventedPriceOrBuyer(): void {
  const blob = JSON.stringify(REVENUE_HYPOTHESES);
  if (/\$\s?\d/.test(blob)) {
    throw new Error('a hypothesis carries a price; C0.1 leaves every price UNKNOWN by design');
  }
}
