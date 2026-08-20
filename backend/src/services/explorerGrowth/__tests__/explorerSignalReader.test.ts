const queryMock = jest.fn();
const profileFindByPk = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

jest.mock('../../../models', () => ({
  ExplorerJourneyProfile: { findByPk: (...a: unknown[]) => profileFindByPk(...a) },
}));

import { readLearnerSignals } from '../explorerSignalReader';

const ENR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-08-12T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/**
 * Route each source query to a canned row set. Keyed on a distinctive fragment
 * of each SQL statement so the test does not depend on query ordering.
 */
function mockSources(bySql: Array<{ match: RegExp; rows: Array<{ signal: string; occurred_at: Date }> }>) {
  queryMock.mockImplementation((sql: string) => {
    const hit = bySql.find((b) => b.match.test(sql));
    return Promise.resolve(hit ? hit.rows : []);
  });
}

beforeEach(() => {
  queryMock.mockReset();
  profileFindByPk.mockReset();
  profileFindByPk.mockResolvedValue({ lead_id: 4242 });
  queryMock.mockResolvedValue([]);
});

describe('the identity bridge decides which keyspaces are reachable', () => {
  it('reads lead-keyed sources when the bridge has resolved', async () => {
    await readLearnerSignals(ENR, { asOf: NOW });
    const sqls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => /FROM page_events/.test(s))).toBe(true);
    expect(sqls.some((s) => /FROM interaction_outcomes/.test(s))).toBe(true);
    // lead-keyed queries must be parameterised with the bridged id
    const pageCall = queryMock.mock.calls.find((c) => /FROM page_events/.test(String(c[0])));
    expect(pageCall?.[1].replacements).toEqual({ leadId: 4242 });
  });

  it('still returns learner-side bands when NO lead is bridged', async () => {
    // The bridge is nullable by design. An unbridged learner is a reportable
    // condition, not an error — their learning signals must still score.
    profileFindByPk.mockResolvedValue({ lead_id: null });
    mockSources([{ match: /FROM timeline_card_progress/, rows: [{ signal: 'card_completed', occurred_at: NOW }] }]);

    const r = await readLearnerSignals(ENR, { asOf: NOW });

    expect(r.lead_id).toBeNull();
    expect(r.bands.engagement.total).toBeGreaterThan(0);
    // and no lead-keyed query was attempted
    expect(queryMock.mock.calls.every((c) => !/FROM page_events/.test(String(c[0])))).toBe(true);
  });

  it('does not throw when the learner has no profile row at all', async () => {
    profileFindByPk.mockResolvedValue(null);
    await expect(readLearnerSignals(ENR, { asOf: NOW })).resolves.toMatchObject({ lead_id: null });
  });
});

describe('decay and caps', () => {
  it('gives a fresh occurrence its full weight', async () => {
    mockSources([{ match: /FROM timeline_card_progress/, rows: [{ signal: 'card_completed', occurred_at: NOW }] }]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.bands.engagement.total).toBeCloseTo(6, 5); // card_completed weight 6
  });

  it('halves a contribution at one half-life', async () => {
    mockSources([{ match: /FROM timeline_card_progress/, rows: [{ signal: 'card_completed', occurred_at: daysAgo(21) }] }]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.bands.engagement.total).toBeCloseTo(3, 5);
  });

  it('caps a signal however many times it occurs', async () => {
    // card_completed: weight 6, cap 24. Ten fresh completions would sum to 60.
    mockSources([
      {
        match: /FROM timeline_card_progress/,
        rows: Array.from({ length: 10 }, () => ({ signal: 'card_completed', occurred_at: NOW })),
      },
    ]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.bands.engagement.total).toBe(24);
    expect(r.bands.engagement.signals[0]).toMatchObject({ signal: 'card_completed', occurrences: 10, contribution: 24 });
  });

  it('never decays a signal whose half-life is null', async () => {
    mockSources([{ match: /FROM interaction_outcomes/, rows: [{ signal: 'email_hard_bounce', occurred_at: daysAgo(365) }] }]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.bands.friction.total).toBe(30);
  });
});

describe('band separation and the HIGH_INTENT gate', () => {
  it('routes each signal to its own band and keeps the others clean', async () => {
    mockSources([
      { match: /FROM timeline_card_progress/, rows: [{ signal: 'card_completed', occurred_at: NOW }] },
      { match: /FROM page_events/, rows: [{ signal: 'pricing_page_view', occurred_at: NOW }] },
      { match: /FROM interaction_outcomes/, rows: [{ signal: 'email_hard_bounce', occurred_at: NOW }] },
    ]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.bands.engagement.total).toBeCloseTo(6, 5);
    expect(r.bands.intent.total).toBeCloseTo(6, 5);
    expect(r.bands.friction.total).toBe(30);
  });

  it('reports tier 1 for a pile of page views — views are not readiness', async () => {
    mockSources([
      {
        match: /FROM page_events/,
        rows: Array.from({ length: 20 }, () => ({ signal: 'pricing_page_view', occurred_at: NOW })),
      },
    ]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.highestIntentTier).toBe(1);
  });

  it('reports tier 3 once a real commitment signal appears', async () => {
    mockSources([
      {
        match: /FROM page_events/,
        rows: [
          { signal: 'pricing_page_view', occurred_at: NOW },
          { signal: 'enrollment_form_started', occurred_at: NOW },
        ],
      },
    ]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.highestIntentTier).toBe(3);
  });

  it('reports tier 0 when there is no intent signal at all', async () => {
    mockSources([{ match: /FROM timeline_card_progress/, rows: [{ signal: 'card_completed', occurred_at: NOW }] }]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.highestIntentTier).toBe(0);
  });
});

describe('robustness', () => {
  it('ignores a row whose signal is not in the definitions table', async () => {
    // Not counted at weight 0, not crashed on — simply not a signal we score.
    mockSources([
      {
        match: /FROM student_navigation_events/,
        rows: [
          { signal: 'some_legacy_event', occurred_at: NOW },
          { signal: 'portal_session', occurred_at: NOW },
        ],
      },
    ]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.bands.engagement.signals.map((s) => s.signal)).toEqual(['portal_session']);
  });

  it('degrades per-source rather than blinding the whole profile', async () => {
    // One unavailable table must not take a learner's entire profile dark.
    let call = 0;
    queryMock.mockImplementation((sql: string) => {
      call++;
      if (/FROM timeline_card_progress/.test(sql)) return Promise.reject(new Error('relation unavailable'));
      if (/FROM student_navigation_events/.test(sql)) {
        return Promise.resolve([{ signal: 'portal_session', occurred_at: NOW }]);
      }
      return Promise.resolve([]);
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const r = await readLearnerSignals(ENR, { asOf: NOW });

    expect(r.bands.engagement.total).toBeCloseTo(2, 5); // portal_session survived
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('source_read_failed');
    warn.mockRestore();
  });

  it('returns zeroed bands for a learner with no signals rather than throwing', async () => {
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    expect(r.bands.engagement.total).toBe(0);
    expect(r.bands.intent.total).toBe(0);
    expect(r.bands.friction.total).toBe(0);
    expect(r.highestIntentTier).toBe(0);
  });
});

describe('T000: the timestamps the state machine needs', () => {
  // A decayed, capped sum cannot be inverted back to a date. Without these
  // fields every §8 time-window rule is uncomputable — DORMANT (14d),
  // IN_CONVERSATION (7d), HIGH_INTENT's 21d exit, every 72h/30d/90d clock.

  it('reports the MOST RECENT occurrence per signal, not the last row read', async () => {
    // Source rows arrive in no guaranteed order, so this must take the max.
    mockSources([
      {
        match: /FROM timeline_card_progress/,
        rows: [
          { signal: 'card_completed', occurred_at: daysAgo(10) },
          { signal: 'card_completed', occurred_at: daysAgo(2) },
          { signal: 'card_completed', occurred_at: daysAgo(30) },
        ],
      },
    ]);
    const r = await readLearnerSignals(ENR, { asOf: NOW });
    const card = r.bands.engagement.signals.find((s) => s.signal === 'card_completed')!;
    expect(card.lastOccurredAt.getTime()).toBe(daysAgo(2).getTime());
    expect(card.occurrences).toBe(3);
  });

  describe('recentIntentTier vs highestIntentTier', () => {
    it('EXCLUDES a stale tier-4 signal that highestIntentTier still counts', async () => {
      // The divergence is the entire reason recentIntentTier exists. §8.2 line
      // 772 gates HIGH_INTENT on a tier-3/4 signal "in 14d"; the lifetime
      // maximum would grant that overlay permanently once earned.
      mockSources([
        { match: /FROM enrollments/, rows: [{ signal: 'enrollment_form_completed', occurred_at: daysAgo(200) }] },
      ]);
      const r = await readLearnerSignals(ENR, { asOf: NOW });
      expect(r.highestIntentTier).toBe(4);
      expect(r.recentIntentTier).toBe(0);
    });

    it('counts a tier-4 signal inside the window in both', async () => {
      mockSources([
        { match: /FROM enrollments/, rows: [{ signal: 'enrollment_form_completed', occurred_at: daysAgo(3) }] },
      ]);
      const r = await readLearnerSignals(ENR, { asOf: NOW });
      expect(r.highestIntentTier).toBe(4);
      expect(r.recentIntentTier).toBe(4);
    });

    it('holds the boundary: 14 days in, 15 days out', async () => {
      mockSources([
        { match: /FROM page_events/, rows: [{ signal: 'enrollment_form_started', occurred_at: daysAgo(14) }] },
      ]);
      expect((await readLearnerSignals(ENR, { asOf: NOW })).recentIntentTier).toBe(3);

      mockSources([
        { match: /FROM page_events/, rows: [{ signal: 'enrollment_form_started', occurred_at: daysAgo(15) }] },
      ]);
      expect((await readLearnerSignals(ENR, { asOf: NOW })).recentIntentTier).toBe(0);
    });

    it('reports the RECENT tier even when an older signal ranks higher', async () => {
      mockSources([
        { match: /FROM enrollments/, rows: [{ signal: 'enrollment_form_completed', occurred_at: daysAgo(90) }] },
        { match: /FROM page_events/, rows: [{ signal: 'pricing_page_view', occurred_at: NOW }] },
      ]);
      const r = await readLearnerSignals(ENR, { asOf: NOW });
      expect(r.highestIntentTier).toBe(4); // lifetime
      expect(r.recentIntentTier).toBe(1); // only the view is recent
    });
  });

  describe('lastEngagementAt drives the DORMANT clock', () => {
    it('is NULL for a learner who has never engaged, not epoch-zero', async () => {
      // Null keeps "never active" distinguishable from "active in 1970" — a
      // date of 0 would make every never-engaged learner look 56 years dormant.
      const r = await readLearnerSignals(ENR, { asOf: NOW });
      expect(r.lastEngagementAt).toBeNull();
    });

    it('reports the most recent engagement across DIFFERENT signals', async () => {
      mockSources([
        {
          match: /FROM timeline_card_progress/,
          rows: [{ signal: 'card_completed', occurred_at: daysAgo(9) }],
        },
        {
          match: /FROM student_navigation_events/,
          rows: [{ signal: 'portal_session', occurred_at: daysAgo(4) }],
        },
      ]);
      const r = await readLearnerSignals(ENR, { asOf: NOW });
      expect(r.lastEngagementAt!.getTime()).toBe(daysAgo(4).getTime());
    });

    it('ignores intent and friction signals — engagement band only', async () => {
      // A learner who clicks a pricing page but never opens a lesson is not
      // "engaged" for the purposes of the dormancy clock.
      mockSources([
        { match: /FROM page_events/, rows: [{ signal: 'pricing_page_view', occurred_at: NOW }] },
        { match: /FROM interaction_outcomes/, rows: [{ signal: 'email_hard_bounce', occurred_at: NOW }] },
      ]);
      const r = await readLearnerSignals(ENR, { asOf: NOW });
      expect(r.lastEngagementAt).toBeNull();
    });
  });
});
