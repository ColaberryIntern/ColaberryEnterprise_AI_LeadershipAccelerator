/**
 * CH7.5 the alert store's SQL, without a database: queueing is ON CONFLICT on the once-per-state key
 * and always includes the dashboard; claims are SKIP LOCKED and bounded by tries; a result is recorded
 * only for the claim that holds the row. The SQL itself runs in alertRepo.integration.test.ts (CI).
 */
const queries: Array<{ sql: string; replacements: Record<string, unknown> }> = [];
let settings: { alert_recipients: unknown[] } | null = { alert_recipients: ['ops@colaberry.com', 'not-an-email', 7] };
jest.mock('../../../../config/database', () => ({
  sequelize: { query: jest.fn(async (sql: string, o: { replacements: Record<string, unknown> }) => { queries.push({ sql, replacements: o.replacements }); return [[{ id: 'a1', state_event_id: 's1', message_id: 'm1', failure_state: 'failed', recipient: 'dashboard', attempt: '2' }]]; }) },
}));
jest.mock('../../../../models/CommsHubSettings', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => settings) } }));
jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => ({ id: 'm1', event_id: null, kind: 'update', plan_kind: null, subject: 'Holiday hours' })) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../../models/CommsHubActivity', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => ({ detail: { sent: 1, not_sent: 2 } })) } }));
jest.mock('../../board/messageBoard', () => ({ messageTitle: (m: { subject: string }) => m.subject }));

import { alertRepo } from '../alertRepo';

const NOW = new Date('2026-11-20T16:00:00Z');
beforeEach(() => { queries.length = 0; });

it('recipients are the email addresses in settings only', async () => {
  expect(await alertRepo.recipients()).toEqual(['ops@colaberry.com']);
  settings = null;
  expect(await alertRepo.recipients()).toEqual([]);
});

it('queue: failure actions only, inside the window, the dashboard plus each recipient, ON CONFLICT DO NOTHING', async () => {
  await alertRepo.queue(['ops@colaberry.com'], new Date('2026-11-18T16:00:00Z'), NOW);
  const { sql, replacements } = queries[0];
  expect(sql).toMatch(/action IN \('message\.failed', 'message\.partially_failed'\)/);
  expect(sql).toMatch(/created_at >= :since/);
  expect(sql).toMatch(/ON CONFLICT \(state_event_id, recipient\) DO NOTHING/);
  expect(sql).toMatch(/ARRAY\[:recipients\]::text\[\]/);
  expect(replacements.recipients).toEqual(['dashboard', 'ops@colaberry.com']);
});

it('claim: spent stale rows are failed first; due rows are taken SKIP LOCKED, bounded by tries; the try is a number', async () => {
  const [row] = await alertRepo.claim(NOW, 20);
  expect(queries[0].sql).toMatch(/SET status = 'failed'[\s\S]*attempt_count >= :max/);
  expect(queries[1].sql).toMatch(/FOR UPDATE SKIP LOCKED/);
  expect(queries[1].sql).toMatch(/attempt_count < :max/);
  expect(queries[1].replacements).toEqual(expect.objectContaining({ max: 3, limit: 20, stale: new Date(NOW.getTime() - 600_000) }));
  expect(row.attempt).toBe(2);
});

it('settle records only for the claim holding the row', async () => {
  const a = { id: 'a1', state_event_id: 's1', message_id: 'm1', failure_state: 'failed' as const, recipient: 'dashboard', attempt: 2 };
  await alertRepo.settle(a, { kind: 'retry', at: NOW, error: 'SmtpError: x' }, NOW);
  expect(queries[0].sql).toMatch(/WHERE id = :id AND status = 'sending' AND attempt_count = :attempt/);
  expect(queries[0].replacements).toEqual(expect.objectContaining({ status: 'pending', next: NOW, attempt: 2 }));
});

it('context: the message title and the counts recorded with the state change', async () => {
  expect(await alertRepo.context({ id: 'a1', state_event_id: 's1', message_id: 'm1', failure_state: 'failed', recipient: 'x', attempt: 1 })).toEqual({ title: 'Holiday hours', sent: 1, not_sent: 2 });
});
