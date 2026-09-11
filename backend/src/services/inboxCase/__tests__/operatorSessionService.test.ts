// Pins the two behaviours the Phase 2 plan auditor found wrong in cycle 2:
//
//  1. The SAME tab identity must be able to re-acquire the operator lease
//     after releasing it. The first draft used the tab id as the lease's
//     idempotency_key; acquireLease() short-circuits on that key and returns
//     `acquired: status === 'active'`, and the column is uniquely indexed,
//     so a released tab could never resume. `/inbox-zero resume` depends on
//     this test staying green.
//  2. The cursor must NOT advance when the caller reports a failed refresh.
//
// The real workCoordinatorService runs here. ResourceLease is a fake that
// enforces the partial unique index (resource_key WHERE status='active') and
// the unique idempotency_key the way Postgres does, so the lease semantics
// under test are the production ones, not a mock's opinion of them.

import { Op } from 'sequelize';
import { makeFakeModel } from './testHelpers/fakeModel';

const leaseModel = makeFakeModel();
const settingModel = makeFakeModel();

function uniqueViolation(constraint: string): Error {
  const e: any = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  e.name = 'SequelizeUniqueConstraintError';
  return e;
}

jest.mock('../../../models', () => ({
  ResourceLease: {
    // Simulates the two DB-level uniqueness guarantees from ensureWorkGraphSchema.ts.
    async create(attrs: any) {
      const rows = Array.from(leaseModel.rows.values());
      if (rows.some((r: any) => r.idempotency_key === attrs.idempotency_key)) {
        throw uniqueViolation('idx_resource_leases_idempotency_key');
      }
      if (rows.some((r: any) => r.resource_key === attrs.resource_key && r.status === 'active')) {
        throw uniqueViolation('idx_resource_leases_active_resource_key');
      }
      return leaseModel.create({ ...attrs, heartbeat_at: null, released_at: null });
    },
    findOne: (q: any) => leaseModel.findOne(q),
    findByPk: (id: string) => leaseModel.findByPk(id),
    // Static update(values, { where }) — used by expireStaleLeases().
    async update(values: any, { where }: any) {
      let n = 0;
      for (const row of leaseModel.rows.values()) {
        const r: any = row;
        if (r.resource_key !== where.resource_key || r.status !== where.status) continue;
        const lt = where.expires_at?.[Op.lt];
        if (lt && !(r.expires_at < lt)) continue;
        Object.assign(r, values);
        n++;
      }
      return [n];
    },
  },
  AgentRun: { findOne: jest.fn() },
}));

jest.mock('../../ticketAgentDispatcher', () => ({ dispatchTicketToAgent: jest.fn() }));

jest.mock('../../../models/SystemSetting', () => ({
  __esModule: true,
  default: {
    findOne: (q: any) => settingModel.findOne(q),
    async findOrCreate({ where, defaults }: any) {
      const existing = await settingModel.findOne({ where });
      if (existing) return [existing, false];
      return [await settingModel.create({ ...defaults }), true];
    },
  },
}));

import {
  startOperatorSession,
  stopOperatorSession,
  heartbeatOperatorSession,
  readOperatorCursor,
  advanceOperatorCursor,
  INBOX_ZERO_OPERATOR_RESOURCE_KEY,
} from '../operatorSessionService';

beforeEach(() => {
  leaseModel.rows.clear();
  settingModel.rows.clear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('operator lease', () => {
  it('acquires when free, and a second tab is refused and told who holds it', async () => {
    const first = await startOperatorSession('tab-A');
    expect(first.acquired).toBe(true);
    expect(first.leaseId).toBeTruthy();

    const second = await startOperatorSession('tab-B');
    expect(second.acquired).toBe(false);
    expect(second.leaseId).toBeNull();
    expect(second.incumbent).toMatchObject({ leaseId: first.leaseId, leaseOwner: 'tab-A' });

    const active = await leaseModel.findAll({ where: { resource_key: INBOX_ZERO_OPERATOR_RESOURCE_KEY, status: 'active' } });
    expect(active).toHaveLength(1);
  });

  it('REGRESSION: the same tab can acquire again after releasing (resume)', async () => {
    const first = await startOperatorSession('tab-A');
    expect(first.acquired).toBe(true);

    const stop = await stopOperatorSession(first.leaseId!);
    expect(stop.released).toBe(true);

    // With the tab id as idempotency_key this returns acquired:false forever.
    const again = await startOperatorSession('tab-A');
    expect(again.acquired).toBe(true);
    expect(again.leaseId).not.toBe(first.leaseId);
  });

  it('a stale lease is reaped lazily on the next acquire', async () => {
    const stale = await startOperatorSession('tab-dead');
    expect(stale.acquired).toBe(true);
    const row: any = await leaseModel.findByPk(stale.leaseId!);
    row.expires_at = new Date(Date.now() - 60_000); // one minute in the past

    const next = await startOperatorSession('tab-live');
    expect(next.acquired).toBe(true);
    expect(row.status).toBe('expired');
  });

  it('heartbeat extends an active lease and refuses a released one', async () => {
    const s = await startOperatorSession('tab-A');
    const before: any = await leaseModel.findByPk(s.leaseId!);
    const beforeExpiry = before.expires_at.getTime();

    const hb = await heartbeatOperatorSession(s.leaseId!);
    expect(hb.heartbeat).toBe(true);
    expect(hb.expiresAt!.getTime()).toBeGreaterThanOrEqual(beforeExpiry);

    await stopOperatorSession(s.leaseId!);
    const dead = await heartbeatOperatorSession(s.leaseId!);
    expect(dead.heartbeat).toBe(false);
  });

  it('stop is idempotent', async () => {
    const s = await startOperatorSession('tab-A');
    expect((await stopOperatorSession(s.leaseId!)).released).toBe(true);
    expect((await stopOperatorSession(s.leaseId!)).released).toBe(false);
  });
});

describe('operator cursor', () => {
  it('starts empty and round-trips through system_settings', async () => {
    expect(await readOperatorCursor()).toEqual({ cursor_at: null, advanced_at: null, advanced_by: null });

    const to = new Date('2026-09-11T10:00:00.000Z');
    const r = await advanceOperatorCursor({ to, processingSucceeded: true, advancedBy: 'tab-A' });
    expect(r.advanced).toBe(true);
    expect(r.cursor.cursor_at).toBe(to.toISOString());
    expect(r.cursor.advanced_by).toBe('tab-A');

    expect((await readOperatorCursor()).cursor_at).toBe(to.toISOString());
  });

  it('does NOT advance when processing failed', async () => {
    const t1 = new Date('2026-09-11T10:00:00.000Z');
    await advanceOperatorCursor({ to: t1, processingSucceeded: true, advancedBy: 'tab-A' });

    const t2 = new Date('2026-09-11T10:05:00.000Z');
    const held = await advanceOperatorCursor({ to: t2, processingSucceeded: false, advancedBy: 'tab-A' });
    expect(held.advanced).toBe(false);
    expect((await readOperatorCursor()).cursor_at).toBe(t1.toISOString());
  });

  it('never moves backwards on a stale or replayed refresh', async () => {
    const t2 = new Date('2026-09-11T10:05:00.000Z');
    await advanceOperatorCursor({ to: t2, processingSucceeded: true, advancedBy: 'tab-A' });

    const t1 = new Date('2026-09-11T10:00:00.000Z');
    const held = await advanceOperatorCursor({ to: t1, processingSucceeded: true, advancedBy: 'tab-A' });
    expect(held.advanced).toBe(false);
    expect((await readOperatorCursor()).cursor_at).toBe(t2.toISOString());

    const replay = await advanceOperatorCursor({ to: t2, processingSucceeded: true, advancedBy: 'tab-A' });
    expect(replay.advanced).toBe(false);
  });

  it('a session start reports the persisted cursor so resume knows where it left off', async () => {
    const to = new Date('2026-09-11T10:00:00.000Z');
    await advanceOperatorCursor({ to, processingSucceeded: true, advancedBy: 'tab-A' });
    const s = await startOperatorSession('tab-A');
    expect(s.cursor.cursor_at).toBe(to.toISOString());
  });
});
