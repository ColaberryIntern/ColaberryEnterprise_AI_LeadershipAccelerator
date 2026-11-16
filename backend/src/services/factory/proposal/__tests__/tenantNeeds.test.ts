const collectProjectNeeds = jest.fn();
jest.mock('../collectProjectNeeds', () => ({ collectProjectNeeds: (...a: any[]) => collectProjectNeeds(...a) }));

import { mergeTenantNeeds, collectTenantNeeds } from '../tenantNeeds';
import type { HumanNeed } from '../proposalReviewTypes';

const need = (over: Partial<HumanNeed>): HumanNeed => ({
  key: 'fact:x', kind: 'fact', ask: 'ask', why: 'why', usedIn: [{ docKey: 'd' }], format: 'a value', blocking: 'score', ...over,
});

describe('mergeTenantNeeds (pure)', () => {
  it('dedupes by key across bids, unions the bids that ask it, and counts them', () => {
    const out = mergeTenantNeeds([
      { projectId: 'p1', projectName: 'Harris County', needs: [need({ key: 'fact:duns', ask: 'DUNS?' })] },
      { projectId: 'p2', projectName: 'Dallas ISD', needs: [need({ key: 'fact:duns', ask: 'DUNS?' }), need({ key: 'fact:uei', ask: 'UEI?' })] },
    ]);
    const duns = out.find((n) => n.key === 'fact:duns')!;
    expect(duns.projects.map((p) => p.projectName).sort()).toEqual(['Dallas ISD', 'Harris County']);
    const uei = out.find((n) => n.key === 'fact:uei')!;
    expect(uei.projects).toEqual([{ projectId: 'p2', projectName: 'Dallas ISD' }]);
  });

  it('fatal wins when any bid blocks export, and the most-shared need sorts first', () => {
    const out = mergeTenantNeeds([
      { projectId: 'p1', projectName: 'A', needs: [need({ key: 'fact:shared' }), need({ key: 'fact:duns', blocking: 'score' })] },
      { projectId: 'p2', projectName: 'B', needs: [need({ key: 'fact:shared' })] },
      { projectId: 'p3', projectName: 'C', needs: [need({ key: 'fact:duns', blocking: 'fatal' })] },
    ]);
    expect(out[0].key).toBe('fact:duns'); // fatal sorts first
    expect(out[0].blocking).toBe('fatal'); // fatal from p3 wins over p1's score
    expect(out[1].key).toBe('fact:shared'); // asked on 2 bids, score
    expect(out.find((n) => n.key === 'fact:shared')!.projects).toHaveLength(2);
  });

  it('is total on empty / garbage', () => {
    expect(mergeTenantNeeds([])).toEqual([]);
    expect(mergeTenantNeeds(undefined as never)).toEqual([]);
  });
});

describe('collectTenantNeeds', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('collects each bid and merges, staying fail-soft when one bid read throws', async () => {
    collectProjectNeeds.mockImplementation((id: string) =>
      id === 'p1' ? Promise.resolve([need({ key: 'fact:duns', ask: 'DUNS?' })]) : Promise.reject(new Error('db blip')));
    const out = await collectTenantNeeds([
      { projectId: 'p1', projectName: 'Harris County' },
      { projectId: 'p2', projectName: 'Dallas ISD' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('fact:duns');
    expect(out[0].projects).toEqual([{ projectId: 'p1', projectName: 'Harris County' }]);
  });

  it('skips entries without a project id and returns [] for no projects', async () => {
    expect(await collectTenantNeeds([])).toEqual([]);
    await collectTenantNeeds([{ projectId: '', projectName: 'x' }]);
    expect(collectProjectNeeds).not.toHaveBeenCalled();
  });
});
