/**
 * M24.1, M24.2 and M24.3 - one rule, three places it was broken.
 *
 * THE RULE: an absent input must never read as zero. "We have no evidence" and "we have evidence
 * of nothing" are different facts about a person, and the Sales Readiness Score ranks on them.
 * The M24 contract excluded six of its thirteen inputs for failing exactly this, and these are
 * the fixes that let them back in.
 *
 * Every case below asserts the REAL zero as well as the absent one. That pairing is the point: a
 * change that turned every zero into null would satisfy a one-sided test while destroying the
 * measurement, so each rule is pinned from both directions.
 */
const query = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => query(...args) },
}));

import { getPersonProfile } from '../personProfileService';
import { buildJourney } from '../panels/journeyPanel';

const IDENTITY = {
  email: 'someone@example.com',
  name: 'Someone',
  stage: 'lead',
  company: null,
  title: null,
  traced: true,
};

/** The engagement aggregate, recognised by a fragment unique to its SELECT. */
const ENGAGEMENT_SQL = 'array_remove(array_agg(DISTINCT vs.site_slug)';

type Row = Record<string, unknown>;

/**
 * Route answers by SQL content rather than by call order, so inserting an unrelated query
 * upstream cannot silently hand a panel someone else's rows.
 */
function route(handlers: Array<[string, Row[]]>): void {
  query.mockReset();
  query.mockImplementationOnce(() => Promise.resolve([IDENTITY]));
  query.mockImplementation((sql: unknown) => {
    const s = String(sql);
    for (const [needle, rows] of handlers) {
      if (s.includes(needle)) return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  });
}

const profileFor = (sections: string[], visibleEnrollmentIds: string[] | null = null) =>
  getPersonProfile({ email: IDENTITY.email, sections, visibleEnrollmentIds });

describe('M24.1 - engagement separates never tracked from tracked and never visited', () => {
  it('is NULL for a person with no visitor record at all', async () => {
    // The aggregate has no GROUP BY, so it returns a row of zeros rather than no row. Before the
    // fix this produced {sessions: 0, ...}, which a score would read as measured inactivity.
    route([[ENGAGEMENT_SQL, [{ sessions: '0', visitors: '0', firstSeen: null, lastSeen: null, sites: null }]]]);
    const profile = await profileFor(['leads', 'campaigns']);
    expect(profile.engagement).toBeNull();
  });

  it('is a REAL ZERO for a person who has a visitor record and no sessions', async () => {
    // The control. Without it the fix could null everything out and still pass above.
    route([[ENGAGEMENT_SQL, [{ sessions: '0', visitors: '1', firstSeen: null, lastSeen: null, sites: null }]]]);
    const profile = await profileFor(['leads', 'campaigns']);
    expect(profile.engagement).not.toBeNull();
    expect(profile.engagement?.sessions).toBe(0);
  });

  it('reports real activity unchanged', async () => {
    route([[ENGAGEMENT_SQL, [{
      sessions: '4', visitors: '1', firstSeen: '2026-01-01T00:00:00.000Z',
      lastSeen: '2026-02-01T00:00:00.000Z', sites: ['colaberry'],
    }]]]);
    const profile = await profileFor(['leads', 'campaigns']);
    expect(profile.engagement?.sessions).toBe(4);
    expect(profile.engagement?.sites).toEqual(['colaberry']);
  });

  it('asks the database for the visitor count, so absence is detectable at all', async () => {
    route([[ENGAGEMENT_SQL, [{ sessions: '0', visitors: '0', firstSeen: null, lastSeen: null, sites: null }]]]);
    await profileFor(['leads', 'campaigns']);
    const engagementSql = query.mock.calls.map((c) => String(c[0])).find((s) => s.includes(ENGAGEMENT_SQL));
    expect(engagementSql).toContain('COUNT(DISTINCT v.id)');
  });
});

describe('M24.2 - the journey counts obey the rule their own docblock states', () => {
  it('is NULL for every lead-derived count when the person has no lead record', async () => {
    route([]);
    const j = await buildJourney([], [], ['leads'], []);
    expect(j.sessions).toBeNull();
    expect(j.pageEvents).toBeNull();
    expect(j.campaigns).toBeNull();
    expect(j.emailsSent).toBeNull();
  });

  it('issues no acquisition query at all in that case', async () => {
    route([]);
    await buildJourney([], [], ['leads'], []);
    const asked = query.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('FROM page_events'));
    expect(asked).toEqual([]);
  });

  it('is a REAL ZERO when the query ran and counted nothing', async () => {
    route([['FROM page_events', [{
      sessions: '0', page_events: '0', campaigns: '0', emails: '0',
      first_touch: null, intent: null,
    }]]]);
    const j = await buildJourney([7], [], ['leads'], []);
    expect(j.sessions).toBe(0);
    expect(j.pageEvents).toBe(0);
    expect(j.campaigns).toBe(0);
    expect(j.emailsSent).toBe(0);
  });

  it('is NULL for the learning counts when there are no enrolment ids, and zero when there are', async () => {
    route([]);
    const absent = await buildJourney([], [], ['leads'], []);
    expect(absent.cardsCompleted).toBeNull();
    expect(absent.sessionsAttended).toBeNull();

    route([['FROM timeline_card_progress', [{ cards: '0', attended: '0', enrolled_at: null }]]]);
    const zero = await buildJourney([], ['enr-1'], ['leads'], []);
    expect(zero.cardsCompleted).toBe(0);
    expect(zero.sessionsAttended).toBe(0);
  });

  it('leaves daysKnown and intentScore behaving exactly as before', async () => {
    // These two already honoured the rule. A regression here would mean the fix overreached.
    route([]);
    const j = await buildJourney([], [], ['leads'], []);
    expect(j.daysKnown).toBeNull();
    expect(j.intentScore).toBeNull();
  });
});

describe('M24.3 - permission and key states stop being written into value slots', () => {
  it('withholds the enrolment count when the id list was narrowed, instead of shrinking it', async () => {
    const j = await buildJourney([], ['enr-1'], ['leads'], [], false);
    expect(j.enrollments).toBeNull();
  });

  it('still counts enrolments for a caller who may see them all - the control', async () => {
    const j = await buildJourney([], ['enr-1', 'enr-2'], ['leads'], [], true);
    expect(j.enrollments).toBe(2);
  });

  it('defaults to counting, so an omitted argument cannot silently withhold', async () => {
    const j = await buildJourney([], ['enr-1'], ['leads'], []);
    expect(j.enrollments).toBe(1);
  });

  it('names the withheld count through the EXISTING mechanism, not a new one', async () => {
    route([]);
    const profile = await profileFor(['leads'], []);     // mentor with no grants
    expect(profile.withheldPanels).toContain('journey.enrollments');
  });

  it('does not name it when nothing was withheld - the control', async () => {
    route([]);
    const profile = await profileFor(['leads'], null);
    expect(profile.withheldPanels).not.toContain('journey.enrollments');
  });

  it('returns NULL appointments and automation when there is no lead key to look with', async () => {
    // Empty acquisition means no leadId, so the composer had nothing to query by. [] would have
    // claimed we looked and found nothing booked.
    route([]);
    const profile = await profileFor(['leads']);
    expect(profile.appointments).toBeNull();
    expect(profile.automation).toBeNull();
  });

  it('returns a REAL EMPTY LIST when there was a lead and nothing was booked', async () => {
    route([['FROM leads', [{ leadId: 7, id: 7 }]]]);
    const profile = await profileFor(['leads']);
    // Whatever the loaders returned, the point is that it is a list and not the absent marker.
    expect(profile.appointments).not.toBeNull();
    expect(Array.isArray(profile.appointments)).toBe(true);
  });
});
