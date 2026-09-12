// /inbox-zero T9a (CC-20260910-3q7x). Direct-invocation tests for the operator
// API's session routes: a second tab is refused with 409 and told who holds the
// lease; only the tab holding the ACTIVE lease may advance the cursor (the
// multi-tab guard the brief requires); bad bodies are 400 at the Zod boundary.
// Read routes are covered by inboxZeroService.test.ts against the fixture.

import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { makeFakeModel } from '../../services/inboxCase/__tests__/testHelpers/fakeModel';

const leaseModel = makeFakeModel();
const settingModel = makeFakeModel();
const fakeInboxCase = makeFakeModel();

jest.mock('../../models', () => ({
  ResourceLease: {
    async create(attrs: any) {
      const rows = Array.from(leaseModel.rows.values());
      if (rows.some((r: any) => r.resource_key === attrs.resource_key && r.status === 'active')) {
        const e: any = new Error('duplicate key value violates unique constraint "idx_resource_leases_active_resource_key"');
        e.name = 'SequelizeUniqueConstraintError';
        throw e;
      }
      return leaseModel.create({ ...attrs, heartbeat_at: null, released_at: null });
    },
    findOne: (q: any) => leaseModel.findOne(q),
    findByPk: (id: string) => leaseModel.findByPk(id),
    async update(values: any, { where }: any) {
      let n = 0;
      for (const r of leaseModel.rows.values() as any) {
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
jest.mock('../../services/ticketAgentDispatcher', () => ({ dispatchTicketToAgent: jest.fn() }));
jest.mock('../../models/SystemSetting', () => ({
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
jest.mock('../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../models/InboxCaseItem', () => ({ __esModule: true, default: makeFakeModel() }));
jest.mock('../../models/InboxCaseAction', () => ({ __esModule: true, default: makeFakeModel() }));
jest.mock('../../models/InboxCommitment', () => ({ __esModule: true, default: makeFakeModel() }));
jest.mock('../../models/InboxVip', () => ({ __esModule: true, default: makeFakeModel() }));
jest.mock('../../models/InboxCaseEvent', () => ({ __esModule: true, default: makeFakeModel() }));
jest.mock('../../services/inbox/inboxSyncBackoff', () => ({ getBackoffStatus: () => ({ consecutiveFailures: 0, nextAttemptAt: null }) }));
jest.mock('../../services/inbox/inboxSyncService', () => ({ getColaberryGmailClient: () => ({}), getPersonalGmailClient: () => ({}) }));
jest.mock('../../services/inbox/graphMailService', () => ({ isConfigured: () => true }));
jest.mock('../../services/ops/basecampToken', () => ({ getBcToken: () => 'tok' }));
jest.mock('../../services/ops/basecampClient', () => ({ bcGet: async () => ({ id: 1 }) }));
jest.mock('../../models/InboxClassification', () => ({ __esModule: true, default: { count: async () => 0 } }));
jest.mock('../../services/inboxCase/caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}), syncTicketForCase: jest.fn(async () => {}), postCaseProgressNote: jest.fn(async () => {}),
}));

import { handleZeroCursor, handleZeroStart, handleZeroStop } from '../inboxZeroController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
const req = (body: any) => ({ body, query: {}, params: {}, admin: { email: 'ali@colaberry.com' } } as any);

beforeEach(() => {
  leaseModel.rows.clear();
  settingModel.rows.clear();
  fakeInboxCase.rows.clear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('session start', () => {
  it('200 with the lease and an overview for the first tab; 409 naming the incumbent for a second', async () => {
    const r1 = mockRes();
    await handleZeroStart(req({ tab: 'A' }), r1);
    expect(r1.status).toHaveBeenCalledWith(200);
    const body1 = r1.json.mock.calls[0][0];
    expect(body1.session.acquired).toBe(true);
    expect(body1.session.leaseId).toBeTruthy();
    expect(body1.overview.status).toBe('ZERO'); // no cases seeded, all sources healthy

    const r2 = mockRes();
    await handleZeroStart(req({ tab: 'B' }), r2);
    expect(r2.status).toHaveBeenCalledWith(409);
    const body2 = r2.json.mock.calls[0][0];
    expect(body2.session.acquired).toBe(false);
    expect(body2.session.incumbent.leaseOwner).toBe('ali@colaberry.com#A');
  });
  it('400 on a missing tab', async () => {
    const r = mockRes();
    await handleZeroStart(req({}), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe('cursor guard', () => {
  it('the active lease holder can advance; after stop the same lease id is refused with 409', async () => {
    const start = mockRes();
    await handleZeroStart(req({ tab: 'A' }), start);
    const leaseId = start.json.mock.calls[0][0].session.leaseId;

    const ok = mockRes();
    await handleZeroCursor(req({ lease_id: leaseId, to: '2026-09-11T15:00:00.000Z', processing_succeeded: true }), ok);
    expect(ok.status).not.toHaveBeenCalled();
    expect(ok.json.mock.calls[0][0]).toMatchObject({ advanced: true, cursor: { cursor_at: '2026-09-11T15:00:00.000Z', advanced_by: 'ali@colaberry.com#A' } });

    const stop = mockRes();
    await handleZeroStop(req({ lease_id: leaseId }), stop);
    expect(stop.json.mock.calls[0][0]).toEqual({ released: true });

    const refused = mockRes();
    await handleZeroCursor(req({ lease_id: leaseId, to: '2026-09-11T15:05:00.000Z', processing_succeeded: true }), refused);
    expect(refused.status).toHaveBeenCalledWith(409);
    expect(refused.json.mock.calls[0][0].error).toBe('LeaseNotActive');
  });
  it('an active lease on some OTHER work-graph resource cannot advance the operator cursor', async () => {
    const other: any = await leaseModel.create({ resource_key: 'file:backend/src/x.ts', lease_owner: 'PlatformFixAgent', status: 'active', idempotency_key: randomUUID(), expires_at: new Date(Date.now() + 60_000) });
    const r = mockRes();
    await handleZeroCursor(req({ lease_id: other.id, to: '2026-09-11T15:00:00.000Z', processing_succeeded: true }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });
  it('a failed refresh holds the cursor even for the lease holder', async () => {
    const start = mockRes();
    await handleZeroStart(req({ tab: 'A' }), start);
    const leaseId = start.json.mock.calls[0][0].session.leaseId;
    const r = mockRes();
    await handleZeroCursor(req({ lease_id: leaseId, to: '2026-09-11T15:00:00.000Z', processing_succeeded: false }), r);
    expect(r.json.mock.calls[0][0]).toMatchObject({ advanced: false });
  });
  it('400 on a non-uuid lease id or a non-ISO cursor', async () => {
    const r = mockRes();
    await handleZeroCursor(req({ lease_id: 'nope', to: 'yesterday', processing_succeeded: true }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});
