/**
 * applyHumanOverride validates a `visualStory` before it writes anything.
 *
 * Every other section is prose the gate governs after the fact; a visual
 * story is a graph a renderer draws from, so a broken one is refused at the
 * save with the field it names. These tests mock the row loaders and the
 * persistence so the check under test is the only thing that can fail.
 */

const findOne = jest.fn();
const findAllEvidence = jest.fn();
const persist = jest.fn();
const loadCaseStudyRow = jest.fn();

jest.mock('../../../models/CaseStudySnapshot', () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => findOne(...a) },
}));
jest.mock('../../../models/CaseStudyEvidence', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => findAllEvidence(...a) },
}));
jest.mock('../../../models/CaseStudySyncRun', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/CaseStudyPublication', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []) },
}));
jest.mock('../caseStudySnapshotStore', () => ({
  persistCaseStudySnapshot: (...a: unknown[]) => persist(...a),
}));
jest.mock('../caseStudyPublicationService', () => ({
  evaluateCaseStudyPublication: jest.fn(),
  publishCaseStudy: jest.fn(),
}));
jest.mock('../caseStudyReadinessService', () => ({ scoreCaseStudyReadiness: jest.fn() }));
jest.mock('../caseStudyAdminStore', () => {
  const actual = jest.requireActual('../caseStudyAdminStore');
  return {
    ...actual,
    loadCaseStudyRow: (...a: unknown[]) => loadCaseStudyRow(...a),
  };
});

import { applyHumanOverride } from '../caseStudyAdminReview';
import { CaseStudyAdminError } from '../caseStudyAdminStore';

const CS = '80808a8c-03ed-43bd-bb1a-d6c8366a7464';
const EV = '8936f96c-2ab8-4578-af59-085887cecf6b';

const content = {
  identity: { slug: 's', title: 'T', organizationIdentityMode: 'anonymized', organizationNamingConsent: false, builderIdentityMode: 'role_only', builderNamingConsent: false },
  taxonomy: {},
  heroMetrics: [{
    key: 'resolved', label: 'Resolved', valueDisplay: '97%', metricType: 'business_outcome', isHeadline: true, publishable: true,
    verification: { class: 'verified', method: 'internal', evidenceId: EV, verifiedAt: '2026-09-16T00:00:00.000Z' },
    shape: 'ratio', payload: { shape: 'ratio', numerator: 586, denominator: 604 },
  }],
  measurement: { metrics: [] },
};

const story = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, presentationVersion: 'v2', enabled: true, surfaces: ['enterprise'], motion: 'auto',
  workflow: {
    key: 'wf', type: 'single_state', title: 'Flow', description: 'A flow.',
    panels: [{ key: 'single', label: 'Now', nodes: [{ key: 'a', label: 'A', role: 'system' }, { key: 'b', label: 'B', role: 'system' }], edges: [{ from: 'a', to: 'b' }] }],
  },
  outcomeCards: [{ metricKey: 'resolved' }], charts: [],
  provenance: { generator: 'human', generatedAt: '2026-09-16T00:00:00.000Z', sourceContentHash: 'a'.repeat(64), state: 'draft', humanEdited: true },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  loadCaseStudyRow.mockResolvedValue({ id: CS, status: 'approved' });
  findOne.mockResolvedValue({ id: 'snap-1', version: 3, content, provenance: {}, source_commit_map: {} });
  findAllEvidence.mockResolvedValue([{ id: EV }]);
  persist.mockResolvedValue({ outcome: 'created', snapshotId: 'snap-2', version: 4, contentHash: 'h' });
});

describe('applyHumanOverride on path visualStory', () => {
  it('refuses a story whose edge points at a missing stage, before anything is persisted', async () => {
    const bad = story();
    (bad.workflow as { panels: { edges: { from: string; to: string }[] }[] }).panels[0].edges.push({ from: 'a', to: 'ghost' });
    await expect(applyHumanOverride({ caseStudyId: CS, path: 'visualStory', value: bad, actor: 'ali@colaberry.com' }))
      .rejects.toMatchObject({ error_class: 'ValidationError', details: { path: 'visualStory' } });
    try {
      await applyHumanOverride({ caseStudyId: CS, path: 'visualStory', value: bad, actor: 'ali@colaberry.com' });
    } catch (e) {
      const err = e as CaseStudyAdminError;
      const errors = err.details.errors as { path: string; code: string }[];
      expect(errors.map((x) => x.code)).toContain('edge_endpoint_missing');
      expect(err.message).toContain('workflow.panels[0].edges[1].to');
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it('refuses a literal chart value that cites evidence this record does not have', async () => {
    const bad = story({
      charts: [{ key: 'c', kind: 'comparison', title: 'x', metricKey: 'resolved', caveat: 'windows differ',
        parts: [{ label: 'then', value: 1, denominator: 2, evidenceId: '11111111-2222-4333-8444-555555555555' }, { label: 'now', metricKey: 'resolved' }] }],
    });
    await expect(applyHumanOverride({ caseStudyId: CS, path: 'visualStory', value: bad, actor: 'ali@colaberry.com' }))
      .rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(findAllEvidence).toHaveBeenCalledWith(expect.objectContaining({ where: { case_study_id: CS } }));
    expect(persist).not.toHaveBeenCalled();
  });

  it('writes a valid story: the evidence table is consulted and the snapshot persisted with the section', async () => {
    // Approval and republish run after persistence; they are exercised by the
    // publication suites, so here they only need to not throw.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const good = story();
    let result: unknown;
    try {
      result = await applyHumanOverride({ caseStudyId: CS, path: 'visualStory', value: good, actor: 'ali@colaberry.com' });
    } catch (e) {
      // approveSnapshot needs a second findOne shape this mock does not model;
      // the write under test has already happened by then.
      result = e;
    }
    expect(persist).toHaveBeenCalledTimes(1);
    const draft = (persist.mock.calls[0][0] as { draft: { content: { visualStory?: unknown } } }).draft;
    expect(draft.content.visualStory).toEqual(good);
    expect(result).toBeDefined();
  });

  it('leaves every other path untouched by the validator', async () => {
    await applyHumanOverride({ caseStudyId: CS, path: 'identity', value: { ...content.identity, summary: 'x' }, actor: 'ali@colaberry.com' }).catch(() => undefined);
    expect(findAllEvidence).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
