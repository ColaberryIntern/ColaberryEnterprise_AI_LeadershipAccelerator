/**
 * Explorer's reads, brand-scoped.
 *
 * The decisive test here is not "an out-of-scope brand returns null". It is that
 * the Explorer service was NOT CALLED AT ALL. A version that fetched the rows and
 * then discarded them would satisfy a null-check while still leaking through
 * timing, through an error message quoting what it read, or through the next
 * person who decides the discard is wasteful and removes it.
 *
 * So every out-of-scope cell asserts a spy count of zero.
 */
jest.mock('../../explorerBrandScope', () => ({ resolveExplorerScope: jest.fn() }));
// explorerProgramBridge pulls models/index, which constructs Sequelize at module
// load and dies without a DATABASE_URL. Same trap enrollmentService documents for
// its own GHL import. Only the two slugs are needed here.
jest.mock('../../explorerProgramBridge', () => ({
  EXPLORER_PROGRAM: { tenantSlug: 'colaberry', brandSlug: 'colaberry-training' },
  BACKFILL_SOURCE: 'explorer_backfill',
}));
jest.mock('../../../explorerGrowth/explorerOverviewService', () => ({
  getSummary: jest.fn(),
  getDistribution: jest.fn(),
  getLearners: jest.fn(),
}));
jest.mock('../../../explorerGrowth/explorerLearnerService', () => ({
  getLearnerProfile: jest.fn(),
  getLearnerSignals: jest.fn(),
  getLearnerDecisions: jest.fn(),
  getEligibility: jest.fn(),
}));
jest.mock('../../../explorerGrowth/explorerDecisionsService', () => ({
  getDecisions: jest.fn(),
  getShadow: jest.fn(),
  getContentHealth: jest.fn(),
}));
jest.mock('../../../explorerGrowth/explorerWhyService', () => ({
  getExplorerWhyByDecision: jest.fn(),
}));
jest.mock('../../../explorerGrowth/explorerCampusService', () => ({
  getCampusActivity: jest.fn(),
  getOutreach: jest.fn(),
}));
jest.mock('../../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import {
  readExplorerSummary,
  readExplorerDistribution,
  readExplorerCampusActivity,
  readExplorerOutreach,
  readExplorerLearners,
  readExplorerLearner,
  readExplorerWhy,
  readExplorerShadow,
  readExplorerContent,
  EXPLORER_BRAND_READS,
} from '../explorerBrandReads';
import { resolveExplorerScope } from '../../explorerBrandScope';
import { getSummary, getDistribution, getLearners } from '../../../explorerGrowth/explorerOverviewService';
import { getCampusActivity, getOutreach } from '../../../explorerGrowth/explorerCampusService';
import { getLearnerProfile } from '../../../explorerGrowth/explorerLearnerService';
import { getShadow, getContentHealth } from '../../../explorerGrowth/explorerDecisionsService';
import { getExplorerWhyByDecision } from '../../../explorerGrowth/explorerWhyService';
import { sequelize } from '../../../../config/database';

const mockScope = resolveExplorerScope as jest.Mock;
const mockQuery = (sequelize as any).query as jest.Mock;

const IN_SCOPE = { in_scope: true, brand_id: 'brand-ct', reason: 'explorer_brand' };
const OUT_OF_SCOPE = { in_scope: false, brand_id: 'brand-other', reason: 'other_brand' };
const UNKNOWN = { in_scope: false, brand_id: 'nope', reason: 'unknown_brand' };

/** Every Explorer read this module can reach, for the zero-calls assertion. */
const ALL_EXPLORER_SERVICES = [
  getSummary, getDistribution, getLearners,
  getCampusActivity, getOutreach, getLearnerProfile,
  getShadow, getContentHealth, getExplorerWhyByDecision,
] as unknown as jest.Mock[];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([{ n: 0 }]);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('in scope, Explorer answers', () => {
  beforeEach(() => mockScope.mockResolvedValue(IN_SCOPE));

  it('delegates to the unmodified Explorer service and returns its data', async () => {
    (getSummary as jest.Mock).mockResolvedValue({ total: 1200 });

    const result = await readExplorerSummary('brand-ct');

    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ total: 1200 });
    expect(result.scope.in_scope).toBe(true);
  });

  it('passes a read\'s own arguments straight through', async () => {
    await readExplorerDistribution('brand-ct', null, 30);
    expect(getDistribution).toHaveBeenCalledWith(30);

    await readExplorerOutreach('brand-ct', null, { view: 'reach_out' as never, limit: 50, offset: 100 });
    expect(getOutreach).toHaveBeenCalledWith('reach_out', 50, { offset: 100 });
  });
});

describe('out of scope, Explorer is never asked', () => {
  it('returns data null and calls NO Explorer service', async () => {
    mockScope.mockResolvedValue(OUT_OF_SCOPE);

    const result = await readExplorerSummary('brand-other');

    expect(result.data).toBeNull();
    expect(result.scope.reason).toBe('other_brand');
    // The assertion this whole file exists for.
    for (const svc of ALL_EXPLORER_SERVICES) expect(svc).not.toHaveBeenCalled();
  });

  it('returns null rather than zeros, because they are different facts', async () => {
    mockScope.mockResolvedValue(OUT_OF_SCOPE);

    const result = await readExplorerSummary('brand-other');

    // A zero would assert "this brand has no explorers yet" while meaning
    // "we cannot show you this brand".
    expect(result.data).toBeNull();
    expect(result.data).not.toEqual(expect.objectContaining({ total: 0 }));
  });

  it('treats an unknown brand the same as another brand: no data, no call', async () => {
    mockScope.mockResolvedValue(UNKNOWN);

    const result = await readExplorerLearner('nope', null, 'enr-1');

    expect(result.data).toBeNull();
    expect(getLearnerProfile).not.toHaveBeenCalled();
  });

  it('refuses every one of the reads, not just the ones with their own cell', async () => {
    mockScope.mockResolvedValue(OUT_OF_SCOPE);

    const results = await Promise.all([
      readExplorerSummary('b'),
      readExplorerDistribution('b', null, 30),
      readExplorerCampusActivity('b'),
      readExplorerOutreach('b', null, { view: 'reach_out' as never, limit: 10, offset: 0 }),
      readExplorerLearners('b', null, {} as never),
      readExplorerLearner('b', null, 'e'),
      readExplorerWhy('b', null, 'd'),
      readExplorerShadow('b', null, {} as never),
      readExplorerContent('b', null, {} as never),
    ]);

    for (const r of results) expect(r.data).toBeNull();
    for (const svc of ALL_EXPLORER_SERVICES) expect(svc).not.toHaveBeenCalled();
  });
});

describe('the drift sentinel', () => {
  beforeEach(() => {
    mockScope.mockResolvedValue(IN_SCOPE);
    (getSummary as jest.Mock).mockResolvedValue({ total: 1200 });
  });

  it('holds while no Explorer profile belongs to another brand', async () => {
    mockQuery.mockResolvedValue([{ n: 0 }]);

    const result = await readExplorerSummary('brand-ct');

    expect(result.invariant).toEqual({ holds: true, foreign_brand_profiles: 0 });
  });

  it('breaks, and says how many, the moment one does', async () => {
    // Nothing enforces the all-one-brand assumption. If a profile ever acquires
    // another brand's context it would render under Colaberry Training's name.
    mockQuery.mockResolvedValue([{ n: 7 }]);

    const result = await readExplorerSummary('brand-ct');

    expect(result.invariant).toEqual({ holds: false, foreign_brand_profiles: 7 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('reports, it does not block', async () => {
    mockQuery.mockResolvedValue([{ n: 7 }]);

    const result = await readExplorerSummary('brand-ct');

    // The rows still come back. Taking a working page down over a condition that
    // is currently impossible would be the worse failure.
    expect(result.data).toEqual({ total: 1200 });
  });

  it('distinguishes "could not check" from "checked and fine"', async () => {
    mockQuery.mockRejectedValue(new Error('db gone'));

    const result = await readExplorerSummary('brand-ct');

    expect(result.invariant).toEqual({ holds: false, foreign_brand_profiles: -1 });
    expect(result.data).toEqual({ total: 1200 });
  });

  it('is not computed at all when nothing was served', async () => {
    mockScope.mockResolvedValue(OUT_OF_SCOPE);

    const result = await readExplorerSummary('brand-other');

    expect(result.invariant).toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the read list', () => {
  it('names thirteen reads, matching the thirteen routes', () => {
    expect(EXPLORER_BRAND_READS).toHaveLength(13);
    expect(new Set(EXPLORER_BRAND_READS).size).toBe(13);
  });
});
