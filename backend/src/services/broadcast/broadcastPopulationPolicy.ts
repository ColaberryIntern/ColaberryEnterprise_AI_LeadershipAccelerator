/**
 * broadcastPopulationPolicy - the rules behind the Colaberry Live population figure (C8.10).
 *
 * Pure. No imports, no database, no clock of its own. Everything here is a decision about
 * what a number MEANS, which is the part of this ticket that can be got wrong silently.
 *
 * THE RULE THIS FILE EXISTS FOR. C8.10 names its own failure mode: "Declaring it done
 * against a schema that exists but holds no rows. A table with the right shape and zero
 * records reads as capability and is not." The subtler version of that same mistake is
 * reporting the zero. `broadcast_viewer_people` holds no rows today, and there are three
 * completely different reasons a count could be zero:
 *
 *   1. Nobody watched a broadcast that aired        -> a real, measured zero
 *   2. Nothing aired at all                         -> not a zero; there was nothing to count
 *   3. The instrument was broken while it aired     -> not a zero; the count is unknown
 *
 * Only the first is a measurement. The other two are an absence of measurement wearing a
 * measurement's clothes, and the whole value of this ticket is refusing to conflate them.
 * `classifyPopulation` below is that refusal, expressed as code rather than as a caveat in
 * a document that the next reader will skip.
 *
 * WHY AN OUTAGE REGISTER EXISTS. Colaberry Live has aired exactly twice - a test on
 * 13 October 2026 and the first private technical airing on 14 October 2026 - and every
 * telemetry beat written in that period failed. The fix is commit 3fac2543, "Every
 * broadcast beat write has failed since 2026-10-09; found by trying to test its lock",
 * dated 18 October 2026, four days after the last airing. So the empty table is fully
 * explained and is NOT evidence that nobody watched. Without the register below, the first
 * monthly report would have published "0 learners" for October 2026 as though it were a
 * finding about the audience, when it is a fact about the instrument.
 */

/** A closed-open window of wall-clock days, in the house timezone. */
export interface DateWindow {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** EXCLUSIVE, YYYY-MM-DD. A window that ended is recorded by its first good day. */
  to: string;
}

/**
 * Periods in which the measurement was known to be broken.
 *
 * Each entry needs evidence a reader can check for themselves - a commit, not a memory.
 * `assertEveryOutageCitesEvidence` enforces that, because an outage register nobody can
 * audit is just a way of explaining away an inconvenient number.
 */
export interface InstrumentOutage extends DateWindow {
  reason: string;
  evidence: string;
}

export const INSTRUMENT_OUTAGES: ReadonlyArray<InstrumentOutage> = [
  {
    from: '2026-10-09',
    to: '2026-10-18',
    reason: 'Every playback beat write failed, so no viewer row could be created for any '
      + 'broadcast that aired in this period. Both of Colaberry Live\'s airings to date '
      + 'fall inside it.',
    evidence: 'commit 3fac2543, "Every broadcast beat write has failed since 2026-10-09; '
      + 'found by trying to test its lock", 2026-10-18',
  },
];

/** How much of a window the instrument could actually see. */
export type InstrumentCoverage = 'clean' | 'partially_blind' | 'fully_blind';

/** What the population number for a window actually is. */
export type PopulationState =
  /** The instrument was working and airings happened. The count is a measurement. */
  | 'measured'
  /** Nothing aired. A count of people who watched nothing is not zero, it is undefined. */
  | 'no_airings'
  /** Something aired while the instrument was blind. The count is unknown, not zero. */
  | 'unmeasurable';

export interface PopulationInputs {
  /** Broadcasts that actually started within the window. */
  airings: number;
  /** Distinct non-staff, non-test people with a viewer row. Raw, before interpretation. */
  rawLearners: number;
  coverage: InstrumentCoverage;
}

export interface PopulationVerdict {
  state: PopulationState;
  /** The number to publish, or null when publishing one would be a fabrication. */
  learners: number | null;
  because: string;
}

const iso = (d: string): number => Date.parse(`${d}T00:00:00Z`);

/** Do two closed-open day windows overlap at all? */
export function windowsOverlap(a: DateWindow, b: DateWindow): boolean {
  return iso(a.from) < iso(b.to) && iso(b.from) < iso(a.to);
}

/** Is `inner` wholly inside `outer`? */
export function windowContains(outer: DateWindow, inner: DateWindow): boolean {
  return iso(outer.from) <= iso(inner.from) && iso(inner.to) <= iso(outer.to);
}

/**
 * How much of this window could the instrument see?
 *
 * Deliberately pessimistic: any overlap at all with a known outage downgrades the window,
 * because a partial outage means the count is a floor and not a total, and a floor
 * presented as a total is the same error as a fabricated zero.
 */
export function coverageFor(
  window: DateWindow, outages: ReadonlyArray<InstrumentOutage> = INSTRUMENT_OUTAGES,
): InstrumentCoverage {
  const touching = outages.filter((o) => windowsOverlap(window, o));
  if (touching.length === 0) return 'clean';
  if (touching.some((o) => windowContains(o, window))) return 'fully_blind';
  return 'partially_blind';
}

/**
 * Turn raw rows into a number that can be published, or a refusal to publish one.
 *
 * The order of these branches is the policy. Airings are checked BEFORE the count, because
 * "nobody watched" and "there was nothing to watch" are different findings and the second
 * one must never be reported as the first.
 */
export function classifyPopulation(input: PopulationInputs): PopulationVerdict {
  if (input.airings === 0) {
    return {
      state: 'no_airings',
      learners: null,
      because: 'No broadcast started in this period, so there is no audience to count. '
        + 'This is not a measurement of zero learners.',
    };
  }
  if (input.coverage !== 'clean') {
    return {
      state: 'unmeasurable',
      learners: null,
      because: `${input.airings} broadcast(s) aired while the telemetry instrument was `
        + `${input.coverage === 'fully_blind' ? 'not recording at all' : 'recording for only part of the period'}. `
        + 'Whatever audience they had was not captured, so the count is unknown rather '
        + 'than zero.',
    };
  }
  return {
    state: 'measured',
    learners: input.rawLearners,
    because: `${input.rawLearners} distinct learner(s) recorded across ${input.airings} `
      + 'airing(s), with the instrument recording throughout. Staff and test accounts are '
      + 'excluded.',
  };
}

/* ------------------------------------------------------------------ *
 * Guards - the acceptance criteria as assertions
 * ------------------------------------------------------------------ */

/** An outage nobody can check is an excuse. Every entry cites something verifiable. */
export function assertEveryOutageCitesEvidence(
  outages: ReadonlyArray<InstrumentOutage> = INSTRUMENT_OUTAGES,
): number {
  for (const o of outages) {
    if (!/\d{4}-\d{2}-\d{2}/.test(o.from) || !/\d{4}-\d{2}-\d{2}/.test(o.to)) {
      throw new Error(`broadcast population: outage ${o.from}..${o.to} has a malformed date`);
    }
    if (iso(o.from) >= iso(o.to)) {
      throw new Error(`broadcast population: outage ${o.from}..${o.to} ends before it starts`);
    }
    if (!o.evidence || o.evidence.length < 20) {
      throw new Error(`broadcast population: outage ${o.from}..${o.to} cites no usable evidence`);
    }
  }
  return outages.length;
}

/**
 * A zero must never escape as a measurement while the instrument was blind.
 *
 * This is the assertion the whole module exists to make true. It is run as a build gate
 * rather than trusted, because the failure it prevents is invisible in the output: a
 * published zero looks exactly like a measured zero.
 */
export function assertBlindPeriodsNeverReportZero(): number {
  let checked = 0;
  for (const coverage of ['partially_blind', 'fully_blind'] as InstrumentCoverage[]) {
    for (const airings of [1, 5]) {
      const v = classifyPopulation({ airings, rawLearners: 0, coverage });
      if (v.learners !== null) {
        throw new Error('broadcast population: a blind period published a number '
          + `(coverage=${coverage}, airings=${airings}, learners=${v.learners})`);
      }
      if (v.state === 'measured') {
        throw new Error(`broadcast population: coverage=${coverage} was reported as measured`);
      }
      checked += 1;
    }
  }
  // And the mirror: a clean period with airings MUST publish, or the policy is useless.
  const ok = classifyPopulation({ airings: 2, rawLearners: 0, coverage: 'clean' });
  if (ok.state !== 'measured' || ok.learners !== 0) {
    throw new Error('broadcast population: a clean period refused to report its measured zero');
  }
  return checked;
}

/** "Nothing aired" must never be dressed up as "nobody watched". */
export function assertNoAiringsIsNotZero(): void {
  const v = classifyPopulation({ airings: 0, rawLearners: 0, coverage: 'clean' });
  if (v.state !== 'no_airings' || v.learners !== null) {
    throw new Error('broadcast population: an empty schedule was reported as an audience of zero');
  }
}
