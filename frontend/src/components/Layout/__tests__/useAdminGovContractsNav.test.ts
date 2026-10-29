import { adminGovContractNavEntries } from '../useAdminGovContractsNav';
import type { GovContractCard } from '../../../services/adminGovContractsApi';

function card(partial: Partial<GovContractCard>): GovContractCard {
  return {
    key: 'op:gov:x', isDecoupled: false, biddingEntity: '', title: null, agency: null, decision: '',
    version: 1, stage: 'in_build', deliveryProjectId: null, establishedCount: 0, readyToAdvance: false,
    zipAttested: false, pursuitKind: 'services', build: null, updatedAt: null, createdAt: null, ...partial,
  };
}

describe('adminGovContractNavEntries — admin per-contract nav sub-items', () => {
  it('lists a sub-item per contract that has a build, linking to its read-only cockpit', () => {
    const cards = [
      card({ key: 'op:gov:a', title: 'Saratoga Springs Municipal', deliveryProjectId: 'dp1' }),
      card({ key: 'op:gov:b', title: 'Fairfax County ERP', deliveryProjectId: 'dp2' }),
    ];
    expect(adminGovContractNavEntries(cards)).toEqual([
      { key: 'dp1', label: 'Saratoga Springs Municipal', to: '/admin/internship/gov-contract/dp1' },
      { key: 'dp2', label: 'Fairfax County ERP', to: '/admin/internship/gov-contract/dp2' },
    ]);
  });

  it('drops early-stage pursuits with no build yet (no deliveryProjectId) — they have no intern cockpit', () => {
    expect(adminGovContractNavEntries([card({ key: 'op:gov:c', deliveryProjectId: null })])).toEqual([]);
  });

  it('falls back to the pursuit key when a contract has no title', () => {
    expect(adminGovContractNavEntries([card({ key: 'op:gov:d', title: null, deliveryProjectId: 'dp9' })]))
      .toEqual([{ key: 'dp9', label: 'op:gov:d', to: '/admin/internship/gov-contract/dp9' }]);
  });
});
