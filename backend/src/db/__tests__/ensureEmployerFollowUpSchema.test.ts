const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { EMPLOYER_FOLLOW_UP_SCHEMA_ROLLBACK, EMPLOYER_FOLLOW_UP_STATEMENTS, ensureEmployerFollowUpSchema } from '../ensureEmployerFollowUpSchema';

/** CP10.3: the follow-up tables. Additive, scoped by client, the id is the idempotency key, engagement counted once. */
const find = (name: string) => EMPLOYER_FOLLOW_UP_STATEMENTS.find((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${name} (`)) as string;

describe('ensureEmployerFollowUpSchema (statements)', () => {
  it('is additive and re-runnable: every statement is IF NOT EXISTS, none ALTERs or DROPs', () => {
    for (const s of EMPLOYER_FOLLOW_UP_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/);
      expect(s).not.toMatch(/\bALTER\b|\bDROP\b/i);
    }
  });
  it('follow-ups: the id is the key (no default), scoped to a client, the plan\'s statuses, attempts and tracking columns', () => {
    const t = find('employer_follow_ups');
    expect(t).toMatch(/id UUID PRIMARY KEY,/);
    expect(t).toMatch(/client_id UUID NOT NULL REFERENCES hire_clients\(id\) ON DELETE CASCADE/);
    expect(t).toMatch(/member_id UUID REFERENCES hire_client_members\(id\) ON DELETE SET NULL/);
    expect(t).toMatch(/CHECK \(status IN \('scheduled','sending','sent','opened','clicked','replied','cancelled','failed','held'\)\)/);
    expect(t).toMatch(/only_if VARCHAR\(10\) NOT NULL CHECK \(only_if IN \('no_reply','always'\)\)/);
    expect(t).toMatch(/body TEXT NOT NULL CHECK \(length\(body\) BETWEEN 1 AND 5000\)/);
    for (const col of ['send_on TIMESTAMPTZ NOT NULL', 'attempts SMALLINT NOT NULL DEFAULT 0', 'mandrill_id VARCHAR', 'opens INTEGER NOT NULL DEFAULT 0', "clicks JSONB NOT NULL DEFAULT '{}'::jsonb", 'to_email VARCHAR']) {
      expect(t).toContain(col);
    }
    expect(t).not.toMatch(/\bip\b|user_agent|attachment/i);
  });
  it('engagement events: the event key is the primary key (a repeat counts once)', () => {
    expect(find('employer_follow_up_events')).toMatch(/event_key CHAR\(64\) PRIMARY KEY/);
  });
  it('the scheduler scan has a partial index on what can still go', () => {
    expect(EMPLOYER_FOLLOW_UP_STATEMENTS.join('\n')).toMatch(/ON employer_follow_ups \(send_on\) WHERE status IN \('scheduled','sending'\)/);
  });
  it('has a rollback that drops every table it creates, dependents first', () => {
    const made = EMPLOYER_FOLLOW_UP_STATEMENTS.map((s) => /CREATE TABLE IF NOT EXISTS (\w+)/.exec(s)?.[1]).filter(Boolean);
    const dropped = EMPLOYER_FOLLOW_UP_SCHEMA_ROLLBACK.map((s) => /DROP TABLE IF EXISTS (\w+)/.exec(s)?.[1]);
    expect([...dropped].sort()).toEqual([...made].sort());
    expect(dropped.indexOf('employer_follow_up_events')).toBeLessThan(dropped.indexOf('employer_follow_ups'));
  });
  it('keeps booting when one statement fails, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockQuery.mockReset().mockResolvedValue([[], 0]).mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'SequelizeDatabaseError' }));
    await ensureEmployerFollowUpSchema();
    expect(mockQuery).toHaveBeenCalledTimes(EMPLOYER_FOLLOW_UP_STATEMENTS.length);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'employer_follow_up_schema_stmt_skipped', error_class: 'SequelizeDatabaseError' });
    jest.restoreAllMocks();
  });
});
