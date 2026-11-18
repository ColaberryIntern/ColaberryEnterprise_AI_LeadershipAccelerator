import {
  BAND_DAYS,
  QUIET_AFTER_DAYS,
  silenceFinding,
  type BuildSilenceReport,
} from '../buildSilenceReport';

/**
 * THE SILENCE FINDING'S WORDING AND SEVERITY, which is the half most likely to drift.
 *
 * `silenceFinding` is pure, so this needs no database. The query it reads from is exercised
 * against production separately; what is tested here is the judgement: what gets named, what gets
 * counted, and what is allowed to be called critical.
 *
 * The numbers in these fixtures are the real measured production shape from 2026-11-18: a
 * population of 43, 28 quiet, three of which have never delivered. A fixture that used tidy round
 * numbers would not have shown that the plain 14-day rule names two thirds of the cohort.
 */

const MEASURED: BuildSilenceReport = {
  population: 43,
  quiet: 28,
  buckets: {
    never_delivered: 3,
    over_60_days: 7,
    from_30_to_60_days: 14,
    from_14_to_30_days: 4,
    delivering: 15,
  },
  never_delivered: [
    { project_id: 'p1', slug: 'fbeig2020-cloud/kashmiri-islamic-hub', last_delivery_at: null, days_quiet: null },
    { project_id: 'p2', slug: 'amr23-sudo/DataBuddy', last_delivery_at: null, days_quiet: null },
    { project_id: 'p3', slug: 'tanmayikatamaraja-web/architect-workspace', last_delivery_at: null, days_quiet: null },
  ],
  ok: true,
  reason: null,
};

const clone = (over: Partial<BuildSilenceReport> = {}): BuildSilenceReport =>
  JSON.parse(JSON.stringify({ ...MEASURED, ...over }));

describe('the build silence finding', () => {
  it('leads with the ratio rather than a list of 28 projects', () => {
    const f = silenceFinding(MEASURED)!;
    expect(f.message).toContain('28 of 43');
    expect(f.count).toBe(28);
    // The whole point: the 25 that merely went quiet are counted, never listed.
    expect(f.message).not.toContain('baidhani/HomeHub');
    expect(f.message.length).toBeLessThan(400);
  });

  it('names only the projects that have never delivered anything', () => {
    const f = silenceFinding(MEASURED)!;
    for (const p of MEASURED.never_delivered) expect(f.message).toContain(p.slug);
    // And says why those three are different from the rest.
    expect(f.message).toContain('never delivered');
    expect(f.message).toContain('setup has never worked');
  });

  it('shows every non-empty band, and no empty one', () => {
    const f = silenceFinding(MEASURED)!;
    expect(f.message).toContain('3 never');
    expect(f.message).toContain(`7 over ${BAND_DAYS.over} days`);
    expect(f.message).toContain(`14 ${BAND_DAYS.paused} to ${BAND_DAYS.over} days`);
    expect(f.message).toContain(`4 ${QUIET_AFTER_DAYS} to ${BAND_DAYS.paused} days`);

    // An empty band must not be printed as a zero.
    const noNever = silenceFinding(clone({
      buckets: { ...MEASURED.buckets, never_delivered: 0 },
      never_delivered: [],
      quiet: 25,
    }))!;
    expect(noNever.message).not.toContain('0 never');
  });

  it('reserves critical for a setup that has NEVER worked, not for a high ratio', () => {
    // Critical with never-delivered present...
    expect(silenceFinding(MEASURED)!.severity).toBe('critical');

    // ...and only a warning when the same 25 are quiet but every one of them has worked before.
    // A majority being quiet is a fact about the cohort. Promoting that to critical on every run
    // is how a report stops being read.
    const quietButNeverNever = silenceFinding(clone({
      buckets: { ...MEASURED.buckets, never_delivered: 0 },
      never_delivered: [],
      quiet: 25,
    }))!;
    expect(quietButNeverNever.severity).toBe('warning');
    expect(quietButNeverNever.message).toContain('25 of 43');
  });

  it('says so plainly when everything is reporting', () => {
    const healthy = silenceFinding(clone({
      population: 43,
      quiet: 0,
      buckets: { never_delivered: 0, over_60_days: 0, from_30_to_60_days: 0, from_14_to_30_days: 0, delivering: 43 },
      never_delivered: [],
    }))!;
    expect(healthy.severity).toBe('info');
    expect(healthy.count).toBe(0);
    expect(healthy.message).toContain('All 43');
  });

  it('reports a FAILED check as a failure, never as silence', () => {
    // The load-bearing distinction in this whole module: "we could not find out" must not render
    // identically to "all is well". A null report that produced no finding would do exactly that.
    const broken = silenceFinding(clone({ ok: false, reason: 'relation does not exist' }))!;
    expect(broken).not.toBeNull();
    expect(broken.severity).toBe('warning');
    expect(broken.message).toContain('could not run');
    expect(broken.message).toContain('relation does not exist');
    expect(broken.message).not.toContain('All ');
  });

  it('says nothing at all when there is no population to speak about', () => {
    // Distinct from the healthy case: zero bound projects is not "all 0 are reporting in", which
    // would be a reassuring sentence about nothing.
    const none = silenceFinding(clone({
      population: 0,
      quiet: 0,
      buckets: { never_delivered: 0, over_60_days: 0, from_30_to_60_days: 0, from_14_to_30_days: 0, delivering: 0 },
      never_delivered: [],
    }));
    expect(none).toBeNull();
  });

  it('uses the category the health report groups on', () => {
    for (const r of [MEASURED, clone({ ok: false, reason: 'x' })]) {
      expect(silenceFinding(r)!.category).toBe('Build sync');
    }
  });

  it('keeps the thresholds in a stated order, so the bands cannot overlap', () => {
    expect(QUIET_AFTER_DAYS).toBeLessThan(BAND_DAYS.paused);
    expect(BAND_DAYS.paused).toBeLessThan(BAND_DAYS.over);
  });
});
