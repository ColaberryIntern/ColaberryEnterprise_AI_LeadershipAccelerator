import { adminGovContractNavEntries } from '../useAdminGovContractsNav';
import type { GovContractCard, GovContractAssignedIntern } from '../../../services/adminGovContractsApi';

const omolola: GovContractAssignedIntern = { identityId: 'id-1', name: 'Omolola', email: 'om@x.com' };

function card(partial: Partial<GovContractCard>): GovContractCard {
  return {
    key: 'op:gov:x', isDecoupled: false, biddingEntity: '', title: null, agency: null, decision: '',
    version: 1, stage: 'in_build', deliveryProjectId: null, establishedCount: 0, readyToAdvance: false,
    zipAttested: false, pursuitKind: 'services', build: null, closeDate: null, assignedInterns: [],
    hasActiveIntern: false, updatedAt: null, createdAt: null, ...partial,
  };
}

/** A contract that SHOULD appear: has a build, an active intern, and a far-future close date. */
function live(partial: Partial<GovContractCard>): GovContractCard {
  return card({ deliveryProjectId: 'dp', hasActiveIntern: true, assignedInterns: [omolola], closeDate: '2099-01-01', ...partial });
}

describe('adminGovContractNavEntries — admin per-contract nav sub-items', () => {
  it('lists a sub-item per live contract, with the assigned intern as the owner, linking to the cockpit', () => {
    const cards = [
      live({ key: 'op:gov:a', title: 'Saratoga Springs Municipal', deliveryProjectId: 'dp1' }),
      live({ key: 'op:gov:b', title: 'Fairfax County ERP', deliveryProjectId: 'dp2' }),
    ];
    expect(adminGovContractNavEntries(cards)).toEqual([
      { key: 'dp1', label: 'Saratoga Springs Municipal', to: '/admin/internship/gov-contract/dp1', owner: 'Omolola' },
      { key: 'dp2', label: 'Fairfax County ERP', to: '/admin/internship/gov-contract/dp2', owner: 'Omolola' },
    ]);
  });

  it('drops a contract with no build (no deliveryProjectId)', () => {
    expect(adminGovContractNavEntries([live({ deliveryProjectId: null })])).toEqual([]);
  });

  it('drops a contract with no active intern assigned', () => {
    expect(adminGovContractNavEntries([live({ deliveryProjectId: 'dp3', hasActiveIntern: false, assignedInterns: [] })])).toEqual([]);
  });

  it('drops a contract whose close date has passed', () => {
    expect(adminGovContractNavEntries([live({ deliveryProjectId: 'dp4', closeDate: '2020-01-01' })])).toEqual([]);
  });

  it('shows a contract with no resolvable close date — unknown is not treated as expired', () => {
    expect(adminGovContractNavEntries([live({ deliveryProjectId: 'dp5', title: 'No Date', closeDate: null })]))
      .toEqual([{ key: 'dp5', label: 'No Date', to: '/admin/internship/gov-contract/dp5', owner: 'Omolola' }]);
  });

  it('shows "First +N" for multiple assigned interns, and falls back to the key for a missing title', () => {
    const two: GovContractAssignedIntern[] = [omolola, { identityId: 'id-2', name: 'Obi', email: null }];
    expect(adminGovContractNavEntries([live({ key: 'op:gov:d', title: null, deliveryProjectId: 'dp9', assignedInterns: two })]))
      .toEqual([{ key: 'dp9', label: 'op:gov:d', to: '/admin/internship/gov-contract/dp9', owner: 'Omolola +1' }]);
  });
});
