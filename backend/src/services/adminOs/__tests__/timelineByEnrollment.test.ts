/**
 * The per-enrollment projection of the timeline's sources.
 *
 * This exists so a roster of ten interns costs ONE query instead of ten person-timeline calls,
 * and it is built by rewriting the same `BRANCHES` array rather than by restating what counts as
 * activity. The rewrite is a string substitution on SQL, which is the kind of thing that works on
 * the twelve branches that exist today and fails silently on the thirteenth — so the guard, and
 * the test that the guard can actually fire, are the point of this file.
 *
 * **The failure being prevented is specific and silent.** If a branch's filter were spelled
 * differently, `IN (:enrollmentIds)` would survive the rewrite and that branch would return
 * *every* listed intern's rows inside *each* intern's lateral. The console would then report one
 * intern's work as all ten interns' work, with no error raised anywhere.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import {
  activityDaysByEnrollment, scopeBranchToLateral, TimelineBranchShapeError,
} from '../personTimelineService';

const ENRS = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe('scoping one branch to a single lateral enrollment', () => {
  it('rewrites the list filter into an equality against the lateral row', () => {
    const out = scopeBranchToLateral(
      "SELECT x.created_at FROM xp_events x WHERE x.enrollment_id IN (:enrollmentIds)",
    );

    expect(out).toContain('x.enrollment_id = enr.id');
    expect(out).not.toContain(':enrollmentIds');
  });

  it('rewrites every occurrence, not just the first', () => {
    // A branch with a join could scope twice. Leaving the second one as a list would quietly
    // widen that half of the branch back to every intern.
    const out = scopeBranchToLateral(
      'SELECT 1 FROM a WHERE a.enrollment_id IN (:enrollmentIds) '
      + 'AND EXISTS (SELECT 1 FROM b WHERE b.enrollment_id IN (:enrollmentIds))',
    );

    expect(out).not.toContain(':enrollmentIds');
    expect(out.match(/= enr\.id/g)).toHaveLength(2);
  });

  it('POSITIVE CONTROL: throws by name on a branch it cannot scope', () => {
    // Without this the guard would be decoration. A branch filtering some other way must stop
    // the query being built, not be passed through unscoped.
    expect(() => scopeBranchToLateral('SELECT 1 FROM t WHERE t.enrollment_id = ANY(:ids)'))
      .toThrow(TimelineBranchShapeError);
  });

  it('keeps the branch otherwise untouched, so each source still names itself', () => {
    const sql = "SELECT tcp.completed_at AS occurred_at, 'learning' AS domain, "
      + "'timeline_card_progress' AS source FROM timeline_card_progress tcp "
      + 'WHERE tcp.enrollment_id IN (:enrollmentIds) AND tcp.completed_at IS NOT NULL';

    const out = scopeBranchToLateral(sql);

    expect(out).toContain("'timeline_card_progress' AS source");
    expect(out).toContain('tcp.completed_at IS NOT NULL');
  });
});

describe('every real branch survives the rewrite', () => {
  it('builds the query for learning + community without throwing, unioning all fourteen', async () => {
    // The guard is only worth having if the live branch array passes it. Thirteen UNION ALLs join
    // fourteen branches — the count is asserted so that a branch silently dropped from the array (or
    // newly excluded by the domain filter) fails here rather than quietly shrinking what counts as
    // activity. It went from ten to fourteen on 2026-10-02 when cert sittings, verified build tasks,
    // comments and reactions were added; updating this number is the point of having it.
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning', 'community'] });

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql.match(/UNION ALL/g)).toHaveLength(13);
    expect(sql).not.toContain('IN (:enrollmentIds)');
  });

  it('scopes every branch to the lateral row — no branch escapes unfiltered', async () => {
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning', 'community'] });

    const sql = String(mockQuery.mock.calls[0][0]);
    // Fourteen branches, fourteen scopings. A branch with no `= enr.id` would be returning everyone
    // — which is exactly what the four new sources had to be checked for.
    expect(sql.match(/\.enrollment_id = enr\.id/g)).toHaveLength(14);
  });

  it('includes the four sources the console colours by', async () => {
    // A count alone would stay green if one of these were swapped for another branch.
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning', 'community'] });

    const sql = String(mockQuery.mock.calls[0][0]);
    for (const source of ['cert_sessions', 'student_tasks', 'community_comments', 'community_likes']) {
      expect(sql).toContain(`'${source}' AS source`);
    }
  });

  it('scopes the verified-task branch through the PROJECT, which is where the enrollment lives', async () => {
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning'] });

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('JOIN projects p ON p.id = st.project_id');
    expect(sql).toContain('p.enrollment_id = enr.id');
  });

  it('takes only enrollment-keyed branches — a lead-keyed one has no enrollment to scope', async () => {
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['acquisition', 'learning'] });

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).not.toContain(':leadIds');
    expect(sql).not.toContain('lead_id');
  });
});

describe('one query, whatever the roster size', () => {
  it('asks once for two enrollments', async () => {
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning'] });

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('asks once for twenty, not twenty times — the whole reason this exists', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `0000000${i}-0000-0000-0000-000000000000`);

    await activityDaysByEnrollment({ enrollmentIds: many, domains: ['learning', 'community'] });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1].replacements.enrollmentIds).toHaveLength(20);
  });

  it('does not query at all for an empty roster', async () => {
    expect(await activityDaysByEnrollment({ enrollmentIds: [], domains: ['learning'] })).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does not query when no branch serves the requested domains', async () => {
    // 'support' has no enrollment-keyed source. Building a UNION of nothing would be a syntax
    // error reaching the database.
    expect(await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['support'] as never })).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the rows it returns', () => {
  it('maps a day row to the public shape, normalising the timestamp', async () => {
    mockQuery.mockResolvedValue([{
      enrollment_id: ENRS[0], day: '2026-09-28', events: 54,
      last_at: new Date('2026-09-28T18:04:00Z'), last_source: 'runtime_mentor_turns',
    }]);

    const out = await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning'] });

    expect(out).toEqual([{
      enrollmentId: ENRS[0], date: '2026-09-28', events: 54,
      lastAt: '2026-09-28T18:04:00.000Z', lastSource: 'runtime_mentor_turns',
    }]);
  });

  it('keeps an already-ISO timestamp as it is rather than re-parsing it', async () => {
    mockQuery.mockResolvedValue([{
      enrollment_id: ENRS[0], day: '2026-10-01', events: 1,
      last_at: '2026-10-01T12:00:00.000Z', last_source: 'xp_events',
    }]);

    const out = await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning'] });

    expect(out[0].lastAt).toBe('2026-10-01T12:00:00.000Z');
  });

  it('groups by day and keeps days separate per intern', async () => {
    mockQuery.mockResolvedValue([
      { enrollment_id: ENRS[0], day: '2026-09-28', events: 2, last_at: '2026-09-28T10:00:00.000Z', last_source: 'xp_events' },
      { enrollment_id: ENRS[0], day: '2026-09-29', events: 1, last_at: '2026-09-29T10:00:00.000Z', last_source: 'xp_events' },
      { enrollment_id: ENRS[1], day: '2026-09-28', events: 5, last_at: '2026-09-28T11:00:00.000Z', last_source: 'student_points_events' },
    ]);

    const out = await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning'] });

    expect(out.filter((r) => r.enrollmentId === ENRS[0])).toHaveLength(2);
    expect(out.filter((r) => r.enrollmentId === ENRS[1])).toHaveLength(1);
  });

  it('groups by SOURCE as well as day, so a day can be coloured by category', async () => {
    // Collapsing to one row per day throws the category away before anyone can use it.
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning'] });

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY enr.id, date_trunc('day', t.occurred_at), t.source");
  });

  it('is not time-bounded — a long silence must still carry its real last date', async () => {
    // The console's grid is 28 days; "last active" is not. Trimming the query to the window would
    // turn 200 days quiet into "never", which is the one distinction that matters most here.
    await activityDaysByEnrollment({ enrollmentIds: ENRS, domains: ['learning'] });

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).not.toMatch(/occurred_at\s*>=/);
    expect(sql).not.toContain('INTERVAL');
  });
});
