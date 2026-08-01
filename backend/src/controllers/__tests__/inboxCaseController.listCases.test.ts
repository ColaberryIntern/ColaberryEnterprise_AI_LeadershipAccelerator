// Direct-invocation unit tests for handleListCases's default-hide-RESOLVED
// behavior (root CLAUDE.md's testing minimum: at least one unit test
// covering the happy path). Mocks InboxCase.findAndCountAll and calls the
// handler with mock req/res, bypassing the route+requireAdmin middleware
// stack — the behavior under test is the where-clause construction, not
// auth, which is already covered by every other route in this file sharing
// the same requireAdmin gate.

import { Op } from 'sequelize';

const findAndCountAll = jest.fn(async () => ({ count: 0, rows: [] }));
jest.mock('../../models/InboxCase', () => ({ __esModule: true, default: { findAndCountAll: (...a: any[]) => findAndCountAll(...a) } }));

// caseDiscoveryService.ts (imported by inboxCaseController.ts for the
// /discover route) transitively pulls in caseRepository.ts ->
// caseTicketService.ts -> ticketService.ts -> the full models barrel,
// which runs real Sequelize association setup (InboxCase.hasMany(...))
// against the mocked InboxCase above and throws. Stub it out entirely —
// same pattern used by every inboxCase service test in this repo.
jest.mock('../../services/inboxCase/caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { handleListCases } from '../inboxCaseController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  findAndCountAll.mockReset().mockResolvedValue({ count: 0, rows: [] });
});

describe('handleListCases — default RESOLVED-hidden behavior', () => {
  it('excludes RESOLVED when no state param is given', async () => {
    const req: any = { query: {} };
    const res = mockRes();

    await handleListCases(req, res);

    const callArgs = findAndCountAll.mock.calls[0][0];
    expect(callArgs.where.state).toEqual({ [Op.ne]: 'RESOLVED' });
  });

  it('still returns RESOLVED when state=RESOLVED is explicitly given', async () => {
    const req: any = { query: { state: 'RESOLVED' } };
    const res = mockRes();

    await handleListCases(req, res);

    const callArgs = findAndCountAll.mock.calls[0][0];
    expect(callArgs.where.state).toBe('RESOLVED');
  });

  it('returns every state when include_resolved=true and no state param', async () => {
    const req: any = { query: { include_resolved: 'true' } };
    const res = mockRes();

    await handleListCases(req, res);

    const callArgs = findAndCountAll.mock.calls[0][0];
    expect(callArgs.where.state).toBeUndefined();
  });

  it('an explicit state param is unaffected by include_resolved (redundant no-op)', async () => {
    const req: any = { query: { state: 'RESOLVED', include_resolved: 'true' } };
    const res = mockRes();

    await handleListCases(req, res);

    const callArgs = findAndCountAll.mock.calls[0][0];
    expect(callArgs.where.state).toBe('RESOLVED');
  });
});
