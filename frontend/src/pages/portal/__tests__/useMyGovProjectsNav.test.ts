import { govNavEntries } from '../useMyGovProjectsNav';
import type { MyGovProjectCard } from '../../../services/govProjectPortalApi';

describe('govNavEntries — intern gov-contract nav entries', () => {
  it('maps each assigned contract to its cockpit deep-link, in order', () => {
    const cards: MyGovProjectCard[] = [
      { projectId: 'p1', name: 'Saratoga Springs Municipal', status: 'in_build' },
      { projectId: 'p2', name: 'Fairfax County ERP', status: 'qualifying' },
    ];
    expect(govNavEntries(cards)).toEqual([
      { label: 'Saratoga Springs Municipal', to: '/portal/gov-projects/p1' },
      { label: 'Fairfax County ERP', to: '/portal/gov-projects/p2' },
    ]);
  });

  it('is empty for an intern with no assigned contracts, so the group is dropped', () => {
    expect(govNavEntries([])).toEqual([]);
  });

  it('falls back to the project id when a name is missing — never a blank label', () => {
    const cards: MyGovProjectCard[] = [{ projectId: 'uuid-9', name: '', status: 'in_build' }];
    expect(govNavEntries(cards)).toEqual([{ label: 'uuid-9', to: '/portal/gov-projects/uuid-9' }]);
  });
});
