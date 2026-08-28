/**
 * managerDirectiveService — AI Workforce Management, Checkpoint C. Pins the
 * append-only/revoke lifecycle, the agent-existence guard on writes, and
 * getActiveDirectiveTexts()'s fail-safe contract (the one function the
 * runtime prompt-assembly hot path actually calls).
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockDirectiveCreate = jest.fn();
const mockDirectiveFindAll = jest.fn();
const mockDirectiveFindByPk = jest.fn();
jest.mock('../../models/ManagerDirective', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => mockDirectiveCreate(...a),
    findAll: (...a: any[]) => mockDirectiveFindAll(...a),
    findByPk: (...a: any[]) => mockDirectiveFindByPk(...a),
  },
}));

import {
  createDirective,
  listDirectives,
  revokeDirective,
  getActiveDirectiveTexts,
  AgentNotFoundError,
  DirectiveNotFoundError,
} from '../managerDirectiveService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createDirective', () => {
  it('happy path: creates an active directive attributed to a resolved org member', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockDirectiveCreate.mockResolvedValue({
      id: 'd1', directive_text: 'Always loop in the manager on financial tickets.', status: 'active',
      created_by_email: 'manager@colaberry.com', created_by_org_member_id: 'org-member-1',
      created_at: new Date(), revoked_at: null, revoked_by_email: null,
    });

    const result = await createDirective('agent-1', 'org-member-1', 'manager@colaberry.com', 'Always loop in the manager on financial tickets.');

    expect(mockDirectiveCreate).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: 'agent-1', created_by_org_member_id: 'org-member-1', created_by_email: 'manager@colaberry.com', status: 'active',
    }));
    expect(result.status).toBe('active');
  });

  it('happy path: a null org member id (superadmin, no resolved org_member) is accepted — email is the real attribution', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockDirectiveCreate.mockResolvedValue({
      id: 'd2', directive_text: 'text', status: 'active', created_by_email: 'ali@colaberry.com',
      created_by_org_member_id: null, created_at: new Date(), revoked_at: null, revoked_by_email: null,
    });

    const result = await createDirective('agent-1', null, 'ali@colaberry.com', 'text');

    expect(mockDirectiveCreate).toHaveBeenCalledWith(expect.objectContaining({ created_by_org_member_id: null }));
    expect(result.createdByOrgMemberId).toBeNull();
  });

  it('BREAK: a nonexistent agent throws AgentNotFoundError and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(createDirective('does-not-exist', 'org-member-1', 'manager@colaberry.com', 'text')).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockDirectiveCreate).not.toHaveBeenCalled();
  });
});

describe('listDirectives', () => {
  it('happy path: returns the full history (active + revoked), newest first per the query', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockDirectiveFindAll.mockResolvedValue([
      { id: 'd2', directive_text: 'newer', status: 'active', created_by_email: 'a@x.com', created_by_org_member_id: 'om-1', created_at: new Date(), revoked_at: null, revoked_by_email: null },
      { id: 'd1', directive_text: 'older', status: 'revoked', created_by_email: 'a@x.com', created_by_org_member_id: 'om-1', created_at: new Date(), revoked_at: new Date(), revoked_by_email: 'b@x.com' },
    ]);

    const result = await listDirectives('agent-1');

    expect(result).toHaveLength(2);
    expect(result?.[0].directiveText).toBe('newer');
    expect(result?.[1].status).toBe('revoked');
  });

  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await listDirectives('does-not-exist');

    expect(result).toBeNull();
    expect(mockDirectiveFindAll).not.toHaveBeenCalled();
  });
});

describe('revokeDirective', () => {
  it('happy path: an active directive is marked revoked with a real timestamp and revoker', async () => {
    const row: any = { id: 'd1', status: 'active', update: jest.fn().mockResolvedValue(undefined) };
    mockDirectiveFindByPk.mockResolvedValue(row);

    await revokeDirective('d1', 'manager@colaberry.com');

    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', revoked_by_email: 'manager@colaberry.com' }));
  });

  it('idempotency: revoking an already-revoked directive is a no-op, not a second revocation event', async () => {
    const row: any = { id: 'd1', status: 'revoked', update: jest.fn() };
    mockDirectiveFindByPk.mockResolvedValue(row);

    await revokeDirective('d1', 'manager@colaberry.com');

    expect(row.update).not.toHaveBeenCalled();
  });

  it('BREAK: a nonexistent directive throws DirectiveNotFoundError', async () => {
    mockDirectiveFindByPk.mockResolvedValue(null);

    await expect(revokeDirective('does-not-exist', 'manager@colaberry.com')).rejects.toBeInstanceOf(DirectiveNotFoundError);
  });
});

describe('getActiveDirectiveTexts — the runtime prompt-assembly hot path', () => {
  it('happy path: returns only active directive text, newest first', async () => {
    mockDirectiveFindAll.mockResolvedValue([
      { directive_text: 'newer directive' },
      { directive_text: 'older directive' },
    ]);

    const texts = await getActiveDirectiveTexts('agent-1');

    expect(texts).toEqual(['newer directive', 'older directive']);
    expect(mockDirectiveFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { agent_id: 'agent-1', status: 'active' },
    }));
  });

  it('BREAK: a DB failure fails safe — returns [] rather than throwing (never blocks a reply)', async () => {
    mockDirectiveFindAll.mockRejectedValue(new Error('connection reset'));

    const texts = await getActiveDirectiveTexts('agent-1');

    expect(texts).toEqual([]);
  });
});
