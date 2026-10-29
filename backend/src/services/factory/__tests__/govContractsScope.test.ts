import { scopeGovCardsToMembership } from '../govContractsScope';
import type { GovPipelineCard } from '../govPipeline';

/**
 * M1 — the admin Gov Contracts tab scopes pursuits to the caller.
 *
 * A broad (program-holding) viewer sees every active pursuit; a scoped gov viewer sees only
 * the delivery projects they are a member of, and never a pre-approval pursuit (no delivery
 * project) that nobody can be a member of. The section gate alone would show a holder ALL
 * pursuits, so this row-level scope is the real "intern sees only theirs" boundary.
 */
function mk(deliveryProjectId: string | null, key = `op:gov:${deliveryProjectId ?? 'none'}`): GovPipelineCard {
  return {
    key,
    isDecoupled: false,
    biddingEntity: 'colaberry',
    title: 'A pursuit',
    agency: 'An agency',
    decision: 'approved_bid_pursuit',
    version: 1,
    stage: 'in_build',
    deliveryProjectId,
    establishedCount: 3,
    readyToAdvance: true,
    zipAttested: true,
    pursuitKind: 'software',
    build: null,
    closeDate: null,
    assignedInterns: [],
    hasActiveIntern: false,
    updatedAt: null,
    createdAt: null,
  };
}

describe('scopeGovCardsToMembership', () => {
  const p1 = mk('dp-1');
  const p2 = mk('dp-2');
  const p3 = mk('dp-3');
  const preApproval = mk(null); // no delivery project yet — management-only
  const all = [p1, p2, p3, preApproval];

  it('broad caller sees every pursuit, membership ignored', () => {
    expect(scopeGovCardsToMembership(all, [], true)).toEqual(all);
    expect(scopeGovCardsToMembership(all, ['dp-1'], true)).toEqual(all);
  });

  it('scoped caller sees only the delivery projects they are a member of', () => {
    expect(scopeGovCardsToMembership(all, ['dp-1', 'dp-3'], false)).toEqual([p1, p3]);
  });

  it('scoped non-member sees nothing (deny-by-default on empty membership)', () => {
    expect(scopeGovCardsToMembership(all, [], false)).toEqual([]);
  });

  it('scoped caller never sees a pre-approval pursuit (null deliveryProjectId)', () => {
    // Even if, impossibly, the null id were "matched", it must be excluded.
    expect(scopeGovCardsToMembership([preApproval], ['dp-1'], false)).toEqual([]);
    expect(scopeGovCardsToMembership(all, ['dp-1'], false)).toEqual([p1]);
  });

  it('does not mutate the input array', () => {
    const input = [p1, p2];
    scopeGovCardsToMembership(input, ['dp-1'], false);
    expect(input).toEqual([p1, p2]);
  });
});
