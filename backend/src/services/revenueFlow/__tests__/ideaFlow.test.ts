/**
 * R18 — the declared-but-unbuilt revenue sources.
 *
 * These tests exist because the module shipped without any. It was committed on 2026-11-13
 * with "WIP: tests ... still to come", and it carried a defect that no amount of reading
 * would have caught as reliably as one call: `buildIdeaFlows` passed one argument to a
 * two-argument `betEvents`, so `now` was `undefined` and the first `now.toISOString()` threw.
 *
 * The failure would also have been nearly invisible in production. `revenueFlowService`
 * wraps every stream builder in `.catch()` on purpose, so one broken stream costs its own
 * section rather than the page — which means the entire idea section would have disappeared
 * behind a caveat reading like a data problem, on a board Ram is meant to trust.
 *
 * So the first test here is simply that it runs.
 */
import { buildIdeaFlows } from '../ideaFlow';
import { classificationFor } from '../revenueClassifications';

/** A window the real service would build: 90 days back from `now`. */
function windowFor(now: Date): Date {
  return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
}

const NOW = new Date('2026-11-16T12:00:00Z');

describe('it runs at all', () => {
  /**
   * The regression test for the defect above. Kept as its own case, with its own name, so a
   * future failure says what broke rather than appearing as a knock-on in a bigger test.
   */
  it('builds without throwing, which the first version did not', async () => {
    await expect(buildIdeaFlows(windowFor(NOW), NOW)).resolves.toBeDefined();
  });

  it('returns a stream for every declared source', async () => {
    const { streams } = await buildIdeaFlows(windowFor(NOW), NOW);
    expect(streams.map((s) => s.key)).toEqual([
      'hypotheses', 'hire_fde', 'subscription_conversion',
    ]);
  });
});

describe('a declared source can never print a figure', () => {
  /**
   * This is the condition on which these streams were allowed onto a board whose headline is
   * money. R16 had argued they should stay off it, because "adding them to a board whose
   * headline is money would invite them to be read as pipeline". The instruction overrode
   * that, so the risk is handled structurally instead: nothing here can hold a number.
   *
   * Asserted over every stream, stage and event rather than spot-checked, because the whole
   * value of the guarantee is that it has no exceptions.
   */
  it('has a null headline on every idea stream', async () => {
    const { streams } = await buildIdeaFlows(windowFor(NOW), NOW);
    for (const s of streams) {
      expect(s.headline.cents).toBeNull();
      // The display must be words. A dash on a revenue dashboard reads as zero.
      expect(s.headline.display).toMatch(/[a-z]/i);
      expect(s.headline.provenance.length).toBeGreaterThan(30);
    }
  });

  it('has a null value on every funnel stage', async () => {
    const { streams } = await buildIdeaFlows(windowFor(NOW), NOW);
    const stages = streams.flatMap((s) => s.funnel);
    expect(stages.length).toBeGreaterThan(0);
    for (const stage of stages) {
      expect(stage.value.cents).toBeNull();
    }
  });

  it('emits no event carrying a value', async () => {
    // A `now` past every deadline in the register, so this is asserted against events that
    // actually exist rather than against an empty array.
    const later = new Date('2027-07-01T00:00:00Z');
    const { events } = await buildIdeaFlows(windowFor(later), later);
    for (const e of events) {
      expect(e.valueCents).toBeNull();
    }
  });

  /**
   * The registry half of the same promise. `revenueFlowService.enforceValueHonesty` rejects
   * an event whose classification declares `carriesValue: false`, so if any classification
   * used here ever flipped to true, these streams would gain the ability to print a number
   * without a single line of this module changing.
   */
  it('uses only classifications that declare they carry no value', async () => {
    const { streams, events } = await buildIdeaFlows(windowFor(NOW), NOW);
    const keys = [
      ...streams.flatMap((s) => s.funnel.map((f) => f.classification)),
      ...events.map((e) => e.classification),
    ];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(classificationFor(key).carriesValue).toBe(false);
    }
  });
});

describe('the timeline never shows a plan as something that happened', () => {
  /**
   * The board's timeline looks backward and sorts newest first, so a date in 2027 would land
   * at the very top of a list of things that have happened. That is not a presentation
   * nicety: it reads as "this occurred". A deadline that has not arrived is a plan.
   */
  it('emits nothing while every judgment date is still ahead', async () => {
    const { events } = await buildIdeaFlows(windowFor(NOW), NOW);
    expect(events).toEqual([]);
  });

  it('emits a judgment date once it has passed, and never one in the future', async () => {
    const later = new Date('2027-07-01T00:00:00Z');
    const today = later.toISOString().slice(0, 10);
    const { events } = await buildIdeaFlows(windowFor(later), later);

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.at <= today).toBe(true);
    }
  });

  /**
   * The window is the other boundary, and the one a `now`-only check would miss: an event
   * older than the window belongs to no visible day column, so an empty tail on the
   * timeline has to mean out-of-window rather than nothing-happened.
   */
  it('emits nothing from before the window', async () => {
    const later = new Date('2027-07-01T00:00:00Z');
    const windowStart = windowFor(later);
    const from = windowStart.toISOString().slice(0, 10);
    const { events } = await buildIdeaFlows(windowStart, later);
    for (const e of events) {
      expect(e.at >= from).toBe(true);
    }
  });
});

describe('the setup funnels count what we actually know', () => {
  async function streamByKey(key: string) {
    const { streams } = await buildIdeaFlows(windowFor(NOW), NOW);
    const found = streams.find((s) => s.key === key);
    if (!found) throw new Error(`no stream called ${key}`);
    return found;
  }

  const stage = (s: Awaited<ReturnType<typeof streamByKey>>, key: string) => {
    const found = s.funnel.find((f) => f.key === key);
    if (!found) throw new Error(`no stage called ${key}`);
    return found;
  };

  /**
   * A stated price is an agreement, not a measurement. The FDE fee is 10% of first year
   * salary, which answers what `defined` asks for and answers nothing `wired` asks for:
   * there is still no table holding a placement, a salary, or an earned fee. Pinned as a
   * test because "we decided the price" is the most natural moment for someone to mark the
   * whole source as ready.
   *
   * THE FIGURE IS ASSERTED IN BOTH DIRECTIONS, and that is deliberate. This file asserted
   * `/1%/` from 16 to 21 November, while the price was wrong by a factor of ten. A test that
   * only checks the new number passes just as happily if someone puts the old one back, so
   * the superseded figure is named here as something the stage must NOT say.
   */
  it('counts the FDE fee basis as defined, and still not wired', async () => {
    const fde = await streamByKey('hire_fde');
    expect(stage(fde, 'declared').count).toBe(1);
    expect(stage(fde, 'defined').count).toBe(1);
    expect(stage(fde, 'wired').count).toBe(0);
    expect(stage(fde, 'earning').count).toBe(0);
    // The basis is stated in words where a reader meets the stage, not rendered as money.
    expect(stage(fde, 'defined').definition).toMatch(/10% of the first year salary/);
    // And the superseded figure is gone from the stage a reader actually meets. `/\b1%/`
    // rather than `/1%/` so it cannot be satisfied by the "10%" it is guarding.
    expect(stage(fde, 'defined').definition).not.toMatch(/\b1%/);
  });

  /**
   * Three conversion campaigns were declared; exactly one has an audience this database can
   * see. Measured on 2026-11-16: 29 active monthly subscriptions carry a PaySimple payment
   * id, `alumni_referral_profiles` holds 2 rows, and DA-program students are not in this
   * database at all.
   *
   * The two unseeable audiences are counted at `defined` rather than given a funnel stage
   * reading 0, because a 0 would say "nobody to ask" when the truth is "we cannot see them
   * from here" — the zero-versus-unknown distinction this surface is built on.
   */
  it('counts three conversion campaigns and one reachable audience', async () => {
    const conv = await streamByKey('subscription_conversion');
    expect(stage(conv, 'declared').count).toBe(3);
    expect(stage(conv, 'defined').count).toBe(1);
    expect(stage(conv, 'wired').count).toBe(0);
    expect(stage(conv, 'earning').count).toBe(0);
  });

  /**
   * The thing Ram has to be able to read off this stream without opening the code: two of
   * the three campaigns have no list to send to, and that is a migration problem before it
   * is a revenue problem. If that sentence ever leaves the caveat, the stream starts looking
   * like three runnable campaigns.
   */
  it('says in words that two of the three audiences are not in this database', async () => {
    const conv = await streamByKey('subscription_conversion');
    expect(conv.caveat).toBeTruthy();
    expect(conv.caveat).toMatch(/alumni/i);
    expect(conv.caveat).toMatch(/migration/i);
    expect(stage(conv, 'defined').definition).toMatch(/29/);
  });

  /**
   * Double counting is the specific way this stream could lie. A converted member becomes an
   * ordinary `annual` row on `subscriptions` and `membershipFlow` counts it there; if this
   * stream also reported yield, one dollar would appear twice on one page.
   */
  it('explains that a converted member is counted by the membership stream, not here', async () => {
    const conv = await streamByKey('subscription_conversion');
    expect(`${conv.headline.provenance} ${conv.caveat}`).toMatch(/membership/i);
  });

  /** Every stream must be readable without colour: a label, a status, and real provenance. */
  it('gives every idea stream words a reader can act on', async () => {
    const { streams } = await buildIdeaFlows(windowFor(NOW), NOW);
    for (const s of streams) {
      expect(s.label.trim().length).toBeGreaterThan(3);
      expect(s.status).toBe('unmeasurable');
      expect(s.provenance.length).toBeGreaterThan(40);
      for (const f of s.funnel) {
        expect(f.definition.length).toBeGreaterThan(30);
      }
    }
  });
});
