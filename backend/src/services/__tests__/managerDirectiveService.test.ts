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

// AF11.8. The real `Op`, not a stand-in: the capability-scoping assertions below read the
// operator symbols out of the where clause, and a locally-defined symbol would never match the
// one the service actually used.
import { Op } from 'sequelize';
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

    // AF11.8 gave `create` a second argument (the optional transaction) and the row a
    // `capability_id`. A four-argument call is still an AGENT-WIDE directive, which is what every
    // caller that predates AF11.8 writes and what this test is about.
    expect(mockDirectiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'agent-1', created_by_org_member_id: 'org-member-1', created_by_email: 'manager@colaberry.com', status: 'active', capability_id: null,
      }),
      expect.anything(),
    );
    expect(result.status).toBe('active');
  });

  it('happy path: a null org member id (superadmin, no resolved org_member) is accepted — email is the real attribution', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockDirectiveCreate.mockResolvedValue({
      id: 'd2', directive_text: 'text', status: 'active', created_by_email: 'ali@colaberry.com',
      created_by_org_member_id: null, created_at: new Date(), revoked_at: null, revoked_by_email: null,
    });

    const result = await createDirective('agent-1', null, 'ali@colaberry.com', 'text');

    expect(mockDirectiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ created_by_org_member_id: null, capability_id: null }),
      expect.anything(),
    );
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
    // AF11.8 added `capability_id` to the where clause, so this matches the keys it cares
    // about rather than the whole object. The scoping itself is asserted in its own block below,
    // where it is the subject rather than an incidental.
    expect(mockDirectiveFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ agent_id: 'agent-1', status: 'active' }),
    }));
  });

  it('BREAK: a DB failure fails safe — returns [] rather than throwing (never blocks a reply)', async () => {
    mockDirectiveFindAll.mockRejectedValue(new Error('connection reset'));

    const texts = await getActiveDirectiveTexts('agent-1');

    expect(texts).toEqual([]);
  });
});

/**
 * AF11.8 — Ali's standing instructions, attached to a CAPABILITY rather than to the whole agent.
 *
 * Ali, 16 Nov 2026: *"when approving the functionality, I should be able to add my details of how
 * the agent should work and respond."*
 *
 * THE PROPERTY THAT MATTERS IS THE NEGATIVE ONE. An agent-wide directive must reach every turn,
 * and a capability-scoped one must reach ONLY the turns running that capability. Getting the
 * second half wrong is worse than not having the feature: "never write a headline longer than
 * eight words" is good guidance while drafting a landing page and is noise the agent will dutifully
 * try to obey on a turn that has nothing to do with headlines.
 *
 * These assert the WHERE CLAUSE rather than a filtered result, because the filtering is the
 * database's job here and a test that filtered in JavaScript would pass while the query returned
 * everything.
 */
describe('AF11.8 — a capability-scoped directive reaches only its own capability', () => {
  /** Pull the `capability_id` condition out of whatever `findAll` was handed. */
  const capabilityClause = () => {
    const call = mockDirectiveFindAll.mock.calls[0][0] as { where: Record<string | symbol, unknown> };
    return call.where.capability_id as Record<symbol, unknown>;
  };

  beforeEach(() => mockDirectiveFindAll.mockResolvedValue([]));

  it('with NO capability, asks only for the agent-wide ones', async () => {
    // The DM paths — Reese, Dara — call it this way. If this ever started returning scoped
    // instructions, every capability's rules would pile into every conversation.
    await getActiveDirectiveTexts('agent-1');
    const clause = capabilityClause();
    expect(clause).toBeDefined();
    expect(Object.getOwnPropertySymbols(clause).map(String)).toContain(String(Op.is));
    expect(clause[Op.is]).toBeNull();
    // And specifically NOT an OR, which is what would let scoped rows through.
    expect(Object.getOwnPropertySymbols(clause).map(String)).not.toContain(String(Op.or));
  });

  it('with a capability, asks for the agent-wide ones AND that capability', async () => {
    await getActiveDirectiveTexts('agent-1', 'marketing.CAP.landing_page_from_brief');
    const clause = capabilityClause();
    const or = clause[Op.or] as Array<Record<symbol, unknown>>;
    expect(Array.isArray(or)).toBe(true);
    expect(or).toHaveLength(2);
    // Agent-wide is always in force; the scoped one is added, never substituted. A query that
    // asked ONLY for the capability would silently drop the agent's standing rules.
    expect(or.some((c) => c[Op.is] === null)).toBe(true);
    expect(or.some((c) => c[Op.eq] === 'marketing.CAP.landing_page_from_brief')).toBe(true);
  });

  it('treats a blank capability as no capability, not as a capability called ""', async () => {
    // An empty string arriving from a form must not become a scope nothing matches, which would
    // quietly drop the agent-wide directives too.
    await getActiveDirectiveTexts('agent-1', '   ');
    expect(capabilityClause()[Op.is]).toBeNull();
  });

  it('trims the capability, so a stray space is not a different capability', async () => {
    await getActiveDirectiveTexts('agent-1', '  marketing.CAP.x  ');
    const or = capabilityClause()[Op.or] as Array<Record<symbol, unknown>>;
    expect(or.some((c) => c[Op.eq] === 'marketing.CAP.x')).toBe(true);
  });

  it('still asks only for ACTIVE rows, so a revoked instruction stops applying', async () => {
    // Revocation is how an instruction is withdrawn, and it has to keep working now that the
    // where clause has a third condition in it.
    await getActiveDirectiveTexts('agent-1', 'marketing.CAP.x');
    const call = mockDirectiveFindAll.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.status).toBe('active');
    expect(call.where.agent_id).toBe('agent-1');
  });
});

describe('AF11.8 — writing a scoped instruction', () => {
  it('records the capability it belongs to', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockDirectiveCreate.mockResolvedValue({
      id: 'd9', directive_text: 'Never write a headline longer than eight words.', status: 'active',
      created_by_email: 'ali@colaberry.com', created_by_org_member_id: null,
      capability_id: 'marketing.CAP.landing_page_from_brief',
      created_at: new Date(), revoked_at: null, revoked_by_email: null,
    });

    const view = await createDirective(
      'agent-1', null, 'ali@colaberry.com',
      'Never write a headline longer than eight words.',
      { capabilityId: 'marketing.CAP.landing_page_from_brief' },
    );

    expect(mockDirectiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ capability_id: 'marketing.CAP.landing_page_from_brief' }),
      expect.anything(),
    );
    // The view carries it too, so the console can say which capability an instruction governs
    // rather than listing a pile of unattributed sentences.
    expect(view.capabilityId).toBe('marketing.CAP.landing_page_from_brief');
  });

  it('writes a blank capability as agent-wide rather than as an empty scope', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockDirectiveCreate.mockResolvedValue({
      id: 'd10', directive_text: 't', status: 'active', created_by_email: 'a@b.com',
      created_by_org_member_id: null, capability_id: null,
      created_at: new Date(), revoked_at: null, revoked_by_email: null,
    });
    await createDirective('agent-1', null, 'a@b.com', 't', { capabilityId: '  ' });
    expect(mockDirectiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ capability_id: null }),
      expect.anything(),
    );
  });

  it('passes the transaction through, because an approval and its conditions are one act', async () => {
    // `toolRequestDecisionService` writes the decision and this directive in one transaction: an
    // approval whose conditions silently failed to save is an approval Ali did not give.
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockDirectiveCreate.mockResolvedValue({
      id: 'd11', directive_text: 't', status: 'active', created_by_email: 'a@b.com',
      created_by_org_member_id: null, capability_id: null,
      created_at: new Date(), revoked_at: null, revoked_by_email: null,
    });
    const transaction = { id: 'txn-1' } as never;
    await createDirective('agent-1', null, 'a@b.com', 't', { transaction });
    expect(mockDirectiveCreate).toHaveBeenCalledWith(expect.anything(), { transaction });
    // and the existence check has to join the same transaction, or it reads outside it.
    expect(mockAiAgentFindByPk).toHaveBeenCalledWith('agent-1', expect.objectContaining({ transaction }));
  });
});
