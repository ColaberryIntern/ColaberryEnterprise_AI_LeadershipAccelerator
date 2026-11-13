const vettingFindAll = jest.fn();
jest.mock('../../../models/GovAiVetting', () => ({ __esModule: true, default: { findAll: (...a: unknown[]) => vettingFindAll(...a) } }));

import { buildGrowthSeries, GROWTH_QUARTERS } from '../serviceEvidenceSummaryBuild';
import { extractOpenFitGaps, countOpenMatches, loadOpenFitGaps } from '../serviceEvidenceDemand';
import { analysisYear } from '../serviceEvidenceLoad';

const NOW = new Date('2026-11-13T00:00:00Z');
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('buildGrowthSeries', () => {
  it('is empty when there is no dated event - no invented history', () => {
    expect(buildGrowthSeries([], [], NOW)).toEqual([]);
    expect(buildGrowthSeries([null], [null], NOW)).toEqual([]);
  });

  it('starts at the first real event quarter and runs to the current quarter with running totals', () => {
    const s = buildGrowthSeries([d('2026-02-10'), d('2026-08-01')], [d('2026-08-15'), d('2026-11-01')], NOW);
    expect(s).toEqual([
      { quarter: '2026-Q1', servicesAdded: 1, servicesTotal: 1, linksConfirmed: 0, linksTotal: 0 },
      { quarter: '2026-Q2', servicesAdded: 0, servicesTotal: 1, linksConfirmed: 0, linksTotal: 0 },
      { quarter: '2026-Q3', servicesAdded: 1, servicesTotal: 2, linksConfirmed: 1, linksTotal: 1 },
      { quarter: '2026-Q4', servicesAdded: 0, servicesTotal: 2, linksConfirmed: 1, linksTotal: 2 },
    ]);
  });

  it('shows at most the last 12 quarters, folding older history into the totals', () => {
    const s = buildGrowthSeries([d('2015-01-01'), d('2026-10-01')], [], NOW);
    expect(s).toHaveLength(GROWTH_QUARTERS);
    expect(s[0]).toMatchObject({ quarter: '2024-Q1', servicesTotal: 1 });
    expect(s[s.length - 1]).toMatchObject({ quarter: '2026-Q4', servicesAdded: 1, servicesTotal: 2 });
  });
});

describe('extractOpenFitGaps', () => {
  const cap = (id: string, assessment: string) => ({ id, name: `N${id}`, assessment, matchedServiceId: assessment === 'new' ? null : 's1' });
  const row = (key: string, completed: string, closeDate: string | null, caps: unknown[]) =>
    ({ qualification_key: key, completed_at: d(completed), fit_json: { capabilities: caps }, opportunity_json: { title: `T${key}`, agency: 'Agency', closeDate } });

  it('keeps only the LATEST vetting per pursuit, only open pursuits, only partial/new; soonest first', () => {
    const gaps = extractOpenFitGaps([
      row('q1', '2026-10-01', '2026-12-20', [cap('C1', 'new')]),                     // older row of q1 - ignored
      row('q1', '2026-11-01', '2026-12-20', [cap('C2', 'partial'), cap('C3', 'have')]),
      row('q2', '2026-11-02', '2026-11-30', [cap('C4', 'new')]),
      row('q3', '2026-11-02', '2026-11-12', [cap('C5', 'new')]),                     // closed yesterday
      row('q4', '2026-11-02', null, [cap('C6', 'new')]),                             // unknown close date
    ], '2026-11-13');
    expect(gaps.map((g) => [g.qualificationKey, g.capabilityId, g.closeDate])).toEqual([['q2', 'C4', '2026-11-30'], ['q1', 'C2', '2026-12-20']]);
    expect(gaps[1]).toMatchObject({ title: 'Tq1', buyer: 'Agency', assessment: 'partial', matchedServiceId: 's1' });
  });

  it('is total on garbage rows', () => {
    expect(extractOpenFitGaps([{ qualification_key: 'x', completed_at: null, fit_json: null, opportunity_json: null }], '2026-11-13')).toEqual([]);
  });
});

describe('countOpenMatches', () => {
  it('counts a service once per open opportunity it matches strong or moderate', () => {
    const services = [{ id: 's1', name: 'S1', naicsCodes: [], category: 'Data', keywords: ['dashboards'] }];
    const opps = [{ uuid: 'u', title: 'Dashboards', agency: 'A', closeDate: '2026-11-13', fitScore: null, estimatedValue: null, sourceUrl: null, category: 'Data' }];
    expect(countOpenMatches(opps, services, '2026-11-13')).toEqual({ openCount: 1, byService: new Map([['s1', 1]]) });
  });
});

describe('analysisYear', () => {
  it.each([[2024, 2024], ['2023', 2023], [1980, null], [2030, null], ['twenty', null], [null, null]])('%p -> %p', (v, out) => {
    expect(analysisYear(v, 2026)).toBe(out);
  });
});

describe('loadOpenFitGaps', () => {
  it('returns null (not []) and logs one classified line when the vetting read throws', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    vettingFindAll.mockRejectedValueOnce(new TypeError('relation "gov_ai_vettings" does not exist'));
    expect(await loadOpenFitGaps('t1', '2026-11-13')).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ event: 'service_evidence_fit_gaps_failed', error_class: 'TypeError' });
    err.mockRestore();
  });

  it("reads only this tenant's completed rows, bounded, and extracts the open gaps", async () => {
    vettingFindAll.mockResolvedValueOnce([{ qualification_key: 'q', completed_at: d('2026-11-01'), opportunity_json: { closeDate: '2026-12-01' },
      fit_json: { capabilities: [{ id: 'C1', name: 'n', assessment: 'new', matchedServiceId: null }] } }]);
    expect(await loadOpenFitGaps('t1', '2026-11-13')).toHaveLength(1);
    expect(vettingFindAll).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenant_id: 't1', status: 'completed' }, limit: 200 }));
  });
});
