/**
 * AF6.4 — an agent cannot be given an accountable human who does not exist.
 *
 * ## The asymmetry this closes
 *
 * `resolveReportsToChainWithTrail` validates the two target types differently. For
 * `type: 'agent'` it does an `AiAgent.findByPk` and returns null on a dangling target. For
 * `type: 'human'` it RETURNS THE ID IT WAS HANDED, with no `org_members` lookup. So
 * `setAgentReportsTo`'s existing `if (!resolvedHumanId)` guard rejected only an empty id, and any
 * non-empty string was accepted as an accountable human.
 *
 * T16 hit this and worked around it with a pre-flight check in its own caller, which protects one
 * caller and no others. The check now lives in the service.
 *
 * ## Why not in the resolver
 *
 * The resolver is also the read path for `enforceReportsToGate`, the live ticket-creation gate.
 * Adding a lookup there would start rejecting ticket creation for any agent whose chain already
 * ends at a missing human — changing live behaviour to close a latent hole. The last test in this
 * file asserts the resolver is untouched, so that distinction cannot be quietly collapsed later.
 *
 * ## Measured before the change
 *
 * Production, 2026-10-15: of 10 agents with a human target, all 10 resolve to a real org_members
 * row and ZERO dangle. This closes a latent hole rather than repairing damage — which is worth
 * stating, because "we fixed the dangling reports_to" would be a claim about rows that do not
 * exist.
 */
import * as fs from 'fs';
import * as path from 'path';

const mockAgentFindByPk = jest.fn();
const mockOrgFindByPk = jest.fn();
const mockResolveChain = jest.fn();

jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockAgentFindByPk(...a) },
}));
jest.mock('../../../models/OrgMember', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockOrgFindByPk(...a) },
}));
jest.mock('../../ticketCreatorReportsToResolver', () => ({
  resolveReportsToChainWithTrail: (...a: unknown[]) => mockResolveChain(...a),
}));
jest.mock('../../reese/agentDetailService', () => ({
  buildReportsToView: jest.fn().mockResolvedValue({ type: 'human', id: 'x', label: 'x' }),
}));

import { setAgentReportsTo } from '../agentReportsToService';

const SERVICE_SRC = path.join(__dirname, '..', 'agentReportsToService.ts');
const RESOLVER_SRC = path.join(
  __dirname, '..', '..', 'ticketCreatorReportsToResolver.ts',
);

function agent(over: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    agent_name: 'DeptCampaignPerformanceAgent',
    reports_to_type: null,
    reports_to_id: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => {
  mockAgentFindByPk.mockReset();
  mockOrgFindByPk.mockReset();
  mockResolveChain.mockReset();
  // The resolver would accept anything for a human target; that is the point.
  mockResolveChain.mockResolvedValue({ resolvedHumanId: 'whatever-it-was-handed', trail: [] });
});

describe('AF6.4 a human target must exist', () => {
  it('REFUSES a human id with no org_members row, and never writes', async () => {
    const a = agent();
    mockAgentFindByPk.mockResolvedValue(a);
    mockOrgFindByPk.mockResolvedValue(null);          // no such human

    const res = await setAgentReportsTo('agent-1', 'human', 'not-a-real-person', 'ali@colaberry.com');

    expect(res.updated).toBe(false);
    expect(res.error).toMatch(/does not exist/i);
    expect(res.error).toMatch(/org_members/);
    // The discriminating assertion: no write was attempted at all.
    expect(a.update).not.toHaveBeenCalled();
  });

  it('POSITIVE CONTROL: the same call SUCCEEDS once the human exists', async () => {
    // Proves the refusal above is about the missing row, not about broken wiring.
    const a = agent();
    mockAgentFindByPk.mockResolvedValue(a);
    mockOrgFindByPk.mockResolvedValue({ id: 'real-person', email: 'taiwo@colaberry.com' });

    const res = await setAgentReportsTo('agent-1', 'human', 'real-person', 'ali@colaberry.com');

    expect(res.error).toBeNull();
    expect(res.updated).toBe(true);
    expect(a.update).toHaveBeenCalledTimes(1);
  });

  it('checks the ORG MEMBER table, with the id it was given', async () => {
    mockAgentFindByPk.mockResolvedValue(agent());
    mockOrgFindByPk.mockResolvedValue({ id: 'real-person' });
    await setAgentReportsTo('agent-1', 'human', 'real-person', 'ali@colaberry.com');
    expect(mockOrgFindByPk).toHaveBeenCalledWith('real-person');
  });

  it('does NOT look up org_members for an AGENT target, which the resolver already validates',
    async () => {
      mockAgentFindByPk.mockResolvedValue(agent());
      await setAgentReportsTo('agent-1', 'agent', 'agent-2', 'ali@colaberry.com');
      expect(mockOrgFindByPk).not.toHaveBeenCalled();
    });

  it('still refuses an agent target whose own chain does not resolve', async () => {
    // The pre-existing protection must survive the new one.
    mockAgentFindByPk.mockResolvedValue(agent());
    mockResolveChain.mockResolvedValue({ resolvedHumanId: null, trail: [] });
    const res = await setAgentReportsTo('agent-1', 'agent', 'agent-2', 'ali@colaberry.com');
    expect(res.updated).toBe(false);
    expect(res.error).toMatch(/chain does not resolve/i);
  });

  it('still refuses an agent reporting to itself', async () => {
    mockAgentFindByPk.mockResolvedValue(agent({ id: 'agent-1' }));
    const res = await setAgentReportsTo('agent-1', 'agent', 'agent-1', 'ali@colaberry.com');
    expect(res.error).toMatch(/cannot report to itself/i);
  });
});

describe('AF6.4 the check is on the WRITE path, not the read path', () => {
  it('the service does the org_members lookup', () => {
    const src = fs.readFileSync(SERVICE_SRC, 'utf8');
    expect(src).toMatch(/OrgMember\.findByPk/);
  });

  it('THE RESOLVER IS UNTOUCHED, so the live ticket-creation gate does not change', () => {
    // enforceReportsToGate reads through this resolver. A lookup added here would start rejecting
    // ticket creation for any agent whose chain already ends at a missing human — changing live
    // behaviour to close a latent hole. If someone later "completes" the fix by moving the check
    // into the resolver, this fails and they have to think about the gate first.
    const src = fs.readFileSync(RESOLVER_SRC, 'utf8');
    expect(src).not.toMatch(/OrgMember/);
  });

  it('the service header no longer claims the resolver validates a human', () => {
    // The old comment said a candidate is "rejected if it doesn't resolve to a real human", which
    // was true of the agent branch and false of the human one.
    const src = fs.readFileSync(SERVICE_SRC, 'utf8');
    expect(src).toMatch(/FALSE OF THE 'human' ONE/);
    // Whitespace-insensitive on purpose: the sentence wraps across a comment line AND the file is
    // CRLF on disk, so a regex spanning a literal \n matches nothing. My first draft did that.
    expect(src.replace(/\s+/g, ' ')).toContain('RETURNS THE // ID IT WAS HANDED');
  });
});
