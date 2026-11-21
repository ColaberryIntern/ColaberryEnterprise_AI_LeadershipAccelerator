const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { ensurePlacementSchema, PLACEMENT_SCHEMA_ROLLBACK, PLACEMENT_STATEMENTS } from '../ensurePlacementSchema';

const tables = (list: readonly string[], re: RegExp) => list.map((s) => re.exec(s)?.[1]).filter(Boolean);

describe('ensurePlacementSchema (statements)', () => {
  it('is additive and re-runnable: every statement is IF NOT EXISTS, none ALTERs or DROPs', () => {
    for (const s of PLACEMENT_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/);
      expect(s).not.toMatch(/\bALTER\b|\bDROP\b/i);
    }
  });
  it('CP6.1: one inbox per learner, one Gmail mailbox across learners (dots and +tags folded), one row per message', () => {
    const inbox = PLACEMENT_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS job_search_inboxes')) as string;
    expect(inbox).toMatch(/enrollment_id UUID NOT NULL UNIQUE/);
    expect(PLACEMENT_STATEMENTS).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_job_search_inboxes_mailbox ON job_search_inboxes (mailbox)');
    expect(PLACEMENT_STATEMENTS.find((s) => s.includes('inbox_received ('))).toMatch(/message_id VARCHAR\(255\) NOT NULL UNIQUE/);
  });
  it('CP6.2: inbox events are stored once per (message_id, type), with the four F3 types only', () => {
    const events = PLACEMENT_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS inbox_events')) as string;
    expect(events).toMatch(/CONSTRAINT uq_inbox_events_message_type UNIQUE \(message_id, type\)/);
    expect(events).toMatch(/CHECK \(type IN \('email\.classified', 'interview\.detected', 'interview\.updated', 'forwarding\.confirmation'\)\)/);
    expect(events).toMatch(/processed_at TIMESTAMPTZ,/);
  });
  it('CP6.2: the backfill cursor is ONE row, apart from inbox_events', () => {
    expect(PLACEMENT_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS inbox_backfill_state'))).toMatch(/id SMALLINT PRIMARY KEY CHECK \(id = 1\)/);
  });
  it('CP8.1: one interview per source event, six states only; one event row per inbox event; one review item per kind and event', () => {
    const iv = PLACEMENT_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS placement_interviews')) as string;
    expect(iv).toMatch(/source_event_id VARCHAR\(300\) NOT NULL UNIQUE/);
    expect(iv).toMatch(/state IN \('new','awaiting','review','booked','done','cancelled'\)/);
    expect(PLACEMENT_STATEMENTS).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_events_source ON placement_events (source_event_id) WHERE source_event_id IS NOT NULL');
    expect(PLACEMENT_STATEMENTS.find((s) => s.includes('placement_review_items ('))).toMatch(/UNIQUE \(kind, source_event_id\)/);
  });
  it('CP8.1b: a partial index serves the booking-link sweep (only interviews still owed a reply)', () => {
    expect(PLACEMENT_STATEMENTS).toContain("CREATE INDEX IF NOT EXISTS idx_placement_interviews_owed_link ON placement_interviews (created_at) WHERE state = 'new' AND booking_link_sent_at IS NULL");
  });
  it('has a rollback that drops every table it creates, dependents first, never run at boot', () => {
    const made = tables(PLACEMENT_STATEMENTS, /CREATE TABLE IF NOT EXISTS (\w+)/);
    const dropped = tables(PLACEMENT_SCHEMA_ROLLBACK, /DROP TABLE IF EXISTS (\w+)/);
    expect([...dropped].sort()).toEqual([...made].sort());
    expect(dropped.indexOf('inbox_received')).toBeLessThan(dropped.indexOf('job_search_inboxes'));
  });
  it('keeps booting when one statement fails, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockQuery.mockReset().mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'SequelizeDatabaseError' })).mockResolvedValue([[], 0]);
    await ensurePlacementSchema();
    expect(mockQuery).toHaveBeenCalledTimes(PLACEMENT_STATEMENTS.length);
    expect(String(warn.mock.calls[0][0])).toContain('placement_schema_stmt_skipped');
    jest.restoreAllMocks();
  });
});
