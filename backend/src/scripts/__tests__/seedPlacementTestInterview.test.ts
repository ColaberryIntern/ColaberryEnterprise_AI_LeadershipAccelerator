jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn(), transaction: jest.fn() } }));
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnrollmentIds: jest.fn() }));

import { create, parseArgs, remove, REMOVE_CLIENT_SQL, REMOVE_INTERVIEW_SQL, tagFor, type Q } from '../seedPlacementTestInterview';

/**
 * Loop T33: the test-records seed. Dry run by default; refuses an enrollment not on the Career Prep allow-list (no SQL at
 * all); both addresses required; a re-run changes nothing; --remove runs every delete in ONE transaction, in foreign-key
 * order, each keyed to the tagged client or interview. The real-Postgres proof (zero rows left per table, an untagged
 * client's offer and invoice untouched) is seedPlacementTestInterview.integration.test.ts in the CI integration tier.
 */
const E = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const base = ['--enrollment', E, '--employer-email', 'Ali+Employer@Example.com', '--interviewer-email', 'ali+iv@example.com'];
const allow = (ids: string[]) => async () => ids;

/** Records every statement; answers the two lookups from `found`, inserts with fresh ids. */
function fake(found: { iv?: string; client?: string } = {}) {
  const sql: Array<{ s: string; r: Record<string, unknown>; tx: boolean }> = [];
  let inTx = false; let n = 0;
  const query: Q = async (s, r) => {
    sql.push({ s, r, tx: inTx });
    if (s.startsWith('SELECT id FROM placement_interviews')) return found.iv ? [{ id: found.iv }] : [];
    if (s.startsWith('SELECT id FROM hire_clients')) return found.client ? [{ id: found.client }] : [];
    if (s.includes('information_schema.tables')) return ['prep_observations', 'prep_readiness_daily', 'zoom_meeting_requests', 'career_interviews'].map((table_name) => ({ table_name }));
    if (/RETURNING id/.test(s)) return [{ id: `new-${++n}` }];
    return [];
  };
  const transaction = async <T>(fn: (r: Q) => Promise<T>) => { inTx = true; try { return await fn(query); } finally { inTx = false; } };
  return { sql, query, transaction };
}

describe('arguments', () => {
  it('needs an enrollment uuid and BOTH addresses to create; lower-cases them; dry run unless --apply', () => {
    expect(parseArgs(base)).toEqual({ enrollment: E, employer: 'ali+employer@example.com', interviewer: 'ali+iv@example.com', remove: false, apply: false });
    expect(parseArgs([...base, '--apply']).apply).toBe(true);
    expect(() => parseArgs(['--enrollment', E, '--employer-email', 'a@b.co'])).toThrow(/both required/);
    expect(() => parseArgs(['--enrollment', 'x', ...base.slice(2)])).toThrow(/usage/);
    expect(parseArgs(['--enrollment', E, '--remove'])).toEqual({ enrollment: E, employer: null, interviewer: null, remove: true, apply: false });
  });
});

describe('create', () => {
  it('refuses an enrollment that is not on the Career Prep allow-list, and runs no SQL', async () => {
    const f = fake();
    await expect(create(parseArgs([...base, '--apply']), { ...f, allowList: allow(['someone-else']) })).rejects.toThrow(/not on the Career Prep allow-list/);
    expect(f.sql).toEqual([]);
  });

  it('a dry run only looks', async () => {
    const f = fake();
    expect(await create(parseArgs(base), { ...f, allowList: allow([E]) })).toMatchObject({ dry: true, changed: true, interviewId: null, clientId: null });
    expect(f.sql.every((x) => x.s.startsWith('SELECT'))).toBe(true);
  });

  it('--apply writes the tagged interview, the tagged client, ONE member (the employer address) and the put-forward, in one transaction', async () => {
    const f = fake();
    const out = await create(parseArgs([...base, '--apply']), { ...f, allowList: allow([E]) });
    expect(out).toMatchObject({ dry: false, changed: true });
    const writes = f.sql.filter((x) => !x.s.startsWith('SELECT'));
    expect(writes.every((x) => x.tx)).toBe(true);
    expect(writes.map((x) => x.s.match(/INSERT INTO (\w+)/)?.[1])).toEqual(['placement_interviews', 'placement_events', 'hire_clients', 'hire_client_members', 'hire_client_candidates']);
    expect(writes[0].s).toMatch(/'review'.*ON CONFLICT \(source_event_id\) DO NOTHING/s);
    expect(writes[2].r).toEqual({ tag: tagFor(E) });
    expect(writes[3].r).toMatchObject({ email: 'ali+employer@example.com' });
  });

  it('a re-run when both already exist writes nothing', async () => {
    const f = fake({ iv: 'iv-1', client: 'c-1' });
    expect(await create(parseArgs([...base, '--apply']), { ...f, allowList: allow([E]) })).toMatchObject({ changed: false, interviewId: 'iv-1', clientId: 'c-1' });
    expect(f.sql.every((x) => x.s.startsWith('SELECT'))).toBe(true);
  });
});

describe('remove', () => {
  it('deletes in foreign-key order, every statement keyed to the tagged client or interview, all in one transaction', async () => {
    expect(REMOVE_CLIENT_SQL.map(([t]) => t)).toEqual(['employer_follow_up_events', 'employer_follow_ups', 'placement_events (placement_invoice)', 'placement_events (hire_client)', 'placement_invoices',
      'placement_offers', 'hire_client_candidates', 'hire_client_signin_tokens', 'hire_client_members', 'hire_clients']);
    expect(REMOVE_INTERVIEW_SQL.map(([t]) => t)).toEqual(['prep_observations', 'prep_readiness_daily', 'zoom_meeting_requests', 'placement_events (placement_review_item)',
      'placement_events (interview)', 'career_interviews', 'placement_interviews']);
    for (const [label, s] of [...REMOVE_CLIENT_SQL, ...REMOVE_INTERVIEW_SQL]) if (/^DELETE FROM placement_events/.test(s)) expect([label, /subject_type = '[a-z_]+'/.test(s)]).toEqual([label, true]);
    for (const [, s] of REMOVE_CLIENT_SQL) expect(s).toMatch(/:clientId/);
    for (const [, s] of REMOVE_INTERVIEW_SQL) expect(s).toMatch(/:interviewId/);
    expect(REMOVE_CLIENT_SQL[9][1]).toMatch(/created_by = :tag/);
    expect(REMOVE_INTERVIEW_SQL[6][1]).toMatch(/source_event_id = :tag/);
    const f = fake({ iv: 'iv-1', client: 'c-1' });
    expect(await remove(parseArgs(['--enrollment', E, '--remove']), f)).toMatchObject({ dry: true, changed: true });
    expect(f.sql.every((x) => x.s.startsWith('SELECT'))).toBe(true);
    expect(await remove(parseArgs(['--enrollment', E, '--remove', '--apply']), f)).toMatchObject({ dry: false, changed: true, clientId: 'c-1', interviewId: 'iv-1' });
    const deletes = f.sql.filter((x) => x.s.startsWith('DELETE'));
    expect(deletes).toHaveLength(17);
    expect(deletes.every((x) => x.tx && (x.r.clientId === 'c-1' || x.r.interviewId === 'iv-1') && x.r.tag === tagFor(E))).toBe(true);
  });

  it('nothing tagged: nothing deleted (a second remove is a no-op)', async () => {
    const f = fake();
    expect(await remove(parseArgs(['--enrollment', E, '--remove', '--apply']), f)).toMatchObject({ changed: false, clientId: null, interviewId: null });
    expect(f.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
});
