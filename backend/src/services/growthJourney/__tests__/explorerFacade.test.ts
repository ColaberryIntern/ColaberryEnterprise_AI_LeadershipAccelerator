import * as fs from 'fs';
import * as path from 'path';

const resolveSubject = jest.fn();
const enrollmentFindAll = jest.fn();
const enrollmentCreate = jest.fn();
const enrollmentUpdate = jest.fn();
const getLearnerProfile = jest.fn();
const getLearnerScores = jest.fn();
const getLearnerSignals = jest.fn();
const getLearnerDecisions = jest.fn();
const getEligibility = jest.fn();
const getExplorerWhy = jest.fn();

jest.mock('../subjectResolver', () => ({
  resolveSubject: (...a: unknown[]) => resolveSubject(...a),
}));

jest.mock('../../../models', () => ({
  GrowthJourneyEnrollment: {
    findAll: (...a: unknown[]) => enrollmentFindAll(...a),
    create: (...a: unknown[]) => enrollmentCreate(...a),
    update: (...a: unknown[]) => enrollmentUpdate(...a),
    upsert: (...a: unknown[]) => enrollmentCreate(...a),
    destroy: (...a: unknown[]) => enrollmentUpdate(...a),
  },
}));

jest.mock('../../explorerGrowth/explorerLearnerService', () => ({
  getLearnerProfile: (...a: unknown[]) => getLearnerProfile(...a),
  getLearnerScores: (...a: unknown[]) => getLearnerScores(...a),
  getLearnerSignals: (...a: unknown[]) => getLearnerSignals(...a),
  getLearnerDecisions: (...a: unknown[]) => getLearnerDecisions(...a),
  getEligibility: (...a: unknown[]) => getEligibility(...a),
}));

jest.mock('../../explorerGrowth/explorerWhyService', () => ({
  getExplorerWhy: (...a: unknown[]) => getExplorerWhy(...a),
}));

import {
  getLearnerJourney,
  getLearnerScoreSeries,
  getLearnerSignalSummary,
  getLearnerDecisionHistory,
  getLearnerWhy,
} from '../explorerFacade';

/**
 * T206 — the Explorer compatibility facade.
 *
 * The acceptance criterion that matters is not in this file: it is that
 * Explorer's entire existing suite passes with ZERO edits after this module
 * exists. What this file pins is the other half — that the facade is a pure
 * translation (subject → enrollment id → Explorer's own read services), that it
 * reimplements nothing, and that it writes nothing.
 */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'explorerFacade.ts'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const resolved = (over: Record<string, unknown> = {}) => ({
  status: 'resolved',
  sources: ['enrollment', 'lead'],
  subject: {
    lead_id: 42,
    enrollment_id: 'enr-1',
    visitor_id: null,
    org_member_id: null,
    email_normalized: 'a@example.test',
    brand_relationships: [],
    ...over,
  },
});

const participation = (over: Record<string, unknown> = {}) => ({
  id: 'gje-1',
  tenant_id: 'tenant-1',
  brand_id: 'brand-training',
  program_id: 'program-learner',
  path_id: null,
  status: 'active',
  source: 'explorer_backfill',
  enrolled_at: new Date('2026-09-10T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  resolveSubject.mockReset().mockResolvedValue(resolved());
  enrollmentFindAll.mockReset().mockResolvedValue([participation()]);
  enrollmentCreate.mockReset();
  enrollmentUpdate.mockReset();
  getLearnerProfile.mockReset().mockResolvedValue({ enrollment_id: 'enr-1', primary_state: 'ACTIVE_LEARNER' });
  getLearnerScores.mockReset().mockResolvedValue({ enrollment_id: 'enr-1', series: [] });
  getLearnerSignals.mockReset().mockResolvedValue({ enrollment_id: 'enr-1' });
  getLearnerDecisions.mockReset().mockResolvedValue({ rows: [], total: 0, limit: 10, offset: 0 });
  getEligibility.mockReset().mockResolvedValue({ enrollment_id: 'enr-1', eligible: true });
  getExplorerWhy.mockReset().mockResolvedValue({ found: false });
});

afterEach(() => {
  // The no-write invariant, after every scenario.
  expect(enrollmentCreate).not.toHaveBeenCalled();
  expect(enrollmentUpdate).not.toHaveBeenCalled();
});

describe('it is a translation, not a second Explorer', () => {
  it('hands Explorer the enrollment id and nothing else', async () => {
    await getLearnerJourney({ leadId: 42 });
    expect(getLearnerProfile).toHaveBeenCalledWith('enr-1');
    expect(getEligibility).toHaveBeenCalledWith('enr-1');
  });

  it('passes every read through to the matching Explorer service, unchanged', async () => {
    await getLearnerScoreSeries({ leadId: 42 }, 30);
    expect(getLearnerScores).toHaveBeenCalledWith('enr-1', 30);

    await getLearnerSignalSummary({ leadId: 42 }, 7);
    expect(getLearnerSignals).toHaveBeenCalledWith('enr-1', 7);

    await getLearnerDecisionHistory({ leadId: 42 }, 25, 50);
    expect(getLearnerDecisions).toHaveBeenCalledWith('enr-1', 25, 50);

    await getLearnerWhy({ leadId: 42 }, '2026-09-10');
    expect(getExplorerWhy).toHaveBeenCalledWith('enr-1', '2026-09-10');
  });

  it('returns Explorer’s own objects, not a re-derived copy', async () => {
    const profile = { enrollment_id: 'enr-1', primary_state: 'ENGAGED_LEARNER', e_score: 71 };
    getLearnerProfile.mockResolvedValue(profile);
    const r = await getLearnerJourney({ enrollmentId: 'enr-1' });
    if (r.status !== 'learner') throw new Error('expected learner');
    expect(r.profile).toBe(profile);
  });

  it('resolves the subject through T204, never through its own lookup', async () => {
    await getLearnerJourney({ visitorId: 'vis-1' });
    expect(resolveSubject).toHaveBeenCalledWith({ visitorId: 'vis-1' });
  });
});

describe('a subject without an enrollment is NOT an error', () => {
  it('returns not_a_learner for a lead with no enrollment', async () => {
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: null }));
    const r = await getLearnerJourney({ leadId: 42 });
    expect(r.status).toBe('not_a_learner');
  });

  it('never calls an Explorer service for a non-learner', async () => {
    // The specific failure this guards: calling getLearnerProfile(null).
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: null }));
    await getLearnerJourney({ leadId: 42 });
    await getLearnerScoreSeries({ leadId: 42 }, 30);
    await getLearnerSignalSummary({ leadId: 42 }, 7);
    await getLearnerDecisionHistory({ leadId: 42 }, 10, 0);
    await getLearnerWhy({ leadId: 42 });
    expect(getLearnerProfile).not.toHaveBeenCalled();
    expect(getLearnerScores).not.toHaveBeenCalled();
    expect(getLearnerSignals).not.toHaveBeenCalled();
    expect(getLearnerDecisions).not.toHaveBeenCalled();
    expect(getExplorerWhy).not.toHaveBeenCalled();
  });

  it('still returns the generic participations for a non-learner', async () => {
    // A business lead on Colaberry Enterprise's programme has participations
    // and no Explorer profile. Both facts belong in the answer.
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: null }));
    enrollmentFindAll.mockResolvedValue([participation({ program_id: 'program-business-growth', source: 'live' })]);
    const r = await getLearnerJourney({ leadId: 42 });
    if (r.status !== 'not_a_learner') throw new Error('expected not_a_learner');
    expect(r.participations).toHaveLength(1);
    expect(r.participations[0].from_explorer_backfill).toBe(false);
  });

  it('distinguishes an enrollment Explorer has not profiled yet', async () => {
    getLearnerProfile.mockResolvedValue(null);
    const r = await getLearnerJourney({ enrollmentId: 'enr-1' });
    expect(r.status).toBe('learner_without_profile');
    if (r.status !== 'learner_without_profile') throw new Error('unreachable');
    expect(r.enrollment_id).toBe('enr-1');
  });

  it('propagates an unresolved subject with its reason, and calls nothing', async () => {
    resolveSubject.mockResolvedValue({ status: 'unresolved', reason: 'anchor_not_found' });
    const r = await getLearnerJourney({ leadId: 999 });
    expect(r).toEqual({ status: 'unresolved', reason: 'anchor_not_found' });
    expect(enrollmentFindAll).not.toHaveBeenCalled();
    expect(getLearnerProfile).not.toHaveBeenCalled();
  });

  it('keeps all four statuses distinct', async () => {
    const seen = new Set<string>();

    seen.add((await getLearnerJourney({ enrollmentId: 'enr-1' })).status);

    getLearnerProfile.mockResolvedValue(null);
    seen.add((await getLearnerJourney({ enrollmentId: 'enr-1' })).status);

    resolveSubject.mockResolvedValue(resolved({ enrollment_id: null }));
    seen.add((await getLearnerJourney({ leadId: 42 })).status);

    resolveSubject.mockResolvedValue({ status: 'unresolved', reason: 'no_anchor_supplied' });
    seen.add((await getLearnerJourney({})).status);

    expect(seen.size).toBe(4);
  });

  it('returns null from every per-read helper for a non-learner, rather than throwing', async () => {
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: null }));
    await expect(getLearnerScoreSeries({ leadId: 42 }, 30)).resolves.toBeNull();
    await expect(getLearnerSignalSummary({ leadId: 42 }, 7)).resolves.toBeNull();
    await expect(getLearnerDecisionHistory({ leadId: 42 }, 10, 0)).resolves.toBeNull();
    await expect(getLearnerWhy({ leadId: 42 })).resolves.toBeNull();
  });
});

describe('participations come from the derived key, both spellings', () => {
  it('queries by enrollment: and lead: refs together', async () => {
    await getLearnerJourney({ leadId: 42 });
    expect(enrollmentFindAll).toHaveBeenCalledWith({
      where: { subject_ref: ['enrollment:enr-1', 'lead:42'] },
    });
  });

  it('queries by lead alone when there is no enrollment', async () => {
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: null }));
    await getLearnerJourney({ leadId: 42 });
    expect(enrollmentFindAll).toHaveBeenCalledWith({ where: { subject_ref: ['lead:42'] } });
  });

  it('does not query at all when the subject has neither anchor', async () => {
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: null, lead_id: null }));
    const r = await getLearnerJourney({ visitorId: 'vis-1' });
    expect(enrollmentFindAll).not.toHaveBeenCalled();
    if (r.status !== 'not_a_learner') throw new Error('expected not_a_learner');
    expect(r.participations).toEqual([]);
  });

  it('marks backfilled rows so they stay distinguishable from live enrolments', async () => {
    enrollmentFindAll.mockResolvedValue([
      participation({ id: 'a', source: 'explorer_backfill' }),
      participation({ id: 'b', source: 'live_signup' }),
    ]);
    const r = await getLearnerJourney({ enrollmentId: 'enr-1' });
    if (r.status !== 'learner') throw new Error('expected learner');
    expect(r.participations.map((p) => p.from_explorer_backfill)).toEqual([true, false]);
  });

  it('carries brand and tenant through, for T207 to scope on', async () => {
    const r = await getLearnerJourney({ enrollmentId: 'enr-1' });
    if (r.status !== 'learner') throw new Error('expected learner');
    expect(r.participations[0]).toMatchObject({ tenant_id: 'tenant-1', brand_id: 'brand-training' });
  });
});

describe('it reimplements nothing and writes nothing — a source scan', () => {
  it('imports Explorer’s SERVICES, never its models', () => {
    expect(CODE).toMatch(/from '\.\.\/explorerGrowth\/explorerLearnerService'/);
    expect(CODE).toMatch(/from '\.\.\/explorerGrowth\/explorerWhyService'/);
    // The models the four services read. Reaching for any of these here would
    // be a second Explorer.
    expect(CODE).not.toMatch(/ExplorerJourneyProfile/);
    expect(CODE).not.toMatch(/ExplorerJourneyDecision/);
    expect(CODE).not.toMatch(/ExplorerSignal/);
    expect(CODE).not.toMatch(/explorer_journey/);
  });

  it('contains no write call of any kind', () => {
    expect(CODE).not.toMatch(/\.(create|update|upsert|destroy|bulkCreate|increment|decrement|save)\s*\(/);
  });

  it('touches only one model, and only to read it', () => {
    const modelReads = CODE.match(/GrowthJourneyEnrollment\.(\w+)\(/g) ?? [];
    expect(modelReads.length).toBeGreaterThan(0);
    for (const call of modelReads) expect(call).toBe('GrowthJourneyEnrollment.findAll(');
  });

  it('derives no score, state or eligibility of its own', () => {
    // Words that would mean logic had crept in beside the pass-through.
    expect(CODE).not.toMatch(/e_score|i_score|f_score|primary_state|overlays|contactability/);
  });
});
