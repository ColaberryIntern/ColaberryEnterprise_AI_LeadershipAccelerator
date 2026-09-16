/**
 * The Studio's read side for the visual story: what is stored, whether it is
 * still valid and current, and what the generator would propose. Both calls
 * are read-only; the tests pin that nothing here can reach a write path.
 */

const findOne = jest.fn();
const findAllEvidence = jest.fn();
const loadCaseStudyRow = jest.fn();

jest.mock('../../../models/CaseStudySnapshot', () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => findOne(...a) },
}));
jest.mock('../../../models/CaseStudyEvidence', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => findAllEvidence(...a) },
}));
jest.mock('../caseStudyAdminStore', () => {
  const actual = jest.requireActual('../caseStudyAdminStore');
  return {
    ...actual,
    loadCaseStudyRow: (...a: unknown[]) => loadCaseStudyRow(...a),
  };
});

import fs from 'fs';
import path from 'path';
import { draftVisualStory, readVisualStoryState } from '../caseStudyVisualStoryService';
import { generateVisualStory } from '../caseStudyVisualStoryGenerate';
import { CaseStudyAdminError } from '../caseStudyAdminStore';

const CS = '80808a8c-03ed-43bd-bb1a-d6c8366a7464';
const EV = '8936f96c-2ab8-4578-af59-085887cecf6b';
const AT = '2026-09-16T13:00:00.000Z';

const content = () => ({
  identity: { slug: 's', title: 'T', organizationIdentityMode: 'anonymized', organizationNamingConsent: false, builderIdentityMode: 'role_only', builderNamingConsent: false },
  taxonomy: {},
  heroMetrics: [{
    key: 'resolved', label: 'Resolved', valueDisplay: '97%', metricType: 'business_outcome', isHeadline: true, publishable: true,
    verification: { class: 'verified', method: 'internal', evidenceId: EV, verifiedAt: AT },
    shape: 'ratio', payload: { shape: 'ratio', numerator: 586, denominator: 604 },
  }],
  measurement: { metrics: [] },
  architecture: {
    narrative: ['x'], stack: [], capabilities: [], integrations: [], dataStores: [],
    diagram: { nodes: [{ id: 'a', label: 'A', kind: 'job' }, { id: 'b', label: 'B', kind: 'ui' }], edges: [{ from: 'a', to: 'b' }] },
    verification: { class: 'verified', method: 'repo', evidenceId: EV, verifiedAt: AT },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  loadCaseStudyRow.mockResolvedValue({ id: CS, status: 'approved' });
  findAllEvidence.mockResolvedValue([{ id: EV }]);
});

describe('readVisualStoryState', () => {
  it('reports no story, not stale, valid, with the limits, on a legacy record', async () => {
    findOne.mockResolvedValue({ id: 'snap-1', version: 3, content: content() });
    const state = await readVisualStoryState(CS);
    expect(state).toMatchObject({ snapshotId: 'snap-1', version: 3, current: null, stale: false, validation: { ok: true, errors: [] } });
    expect(state.limits.nodesPerPanel).toBe(16);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { case_study_id: CS }, order: [['version', 'DESC']] }));
  });

  it('returns the stored story, current when its source hash still matches, stale when the source moved', async () => {
    const base = content();
    const generated = generateVisualStory(base as never, { generatedAt: AT }).section!;
    findOne.mockResolvedValue({ id: 'snap-2', version: 4, content: { ...base, visualStory: generated } });
    const fresh = await readVisualStoryState(CS);
    expect(fresh.current?.workflow?.panels[0].nodes.map((n) => n.key)).toEqual(['a', 'b']);
    expect(fresh.stale).toBe(false);
    expect(fresh.validation.ok).toBe(true);

    const moved = content();
    moved.architecture.narrative = ['rewritten'];
    findOne.mockResolvedValue({ id: 'snap-3', version: 5, content: { ...moved, visualStory: generated } });
    expect((await readVisualStoryState(CS)).stale).toBe(true);
  });

  it('returns an invalid stored story as-is with its errors named, never null', async () => {
    const base = content();
    const generated = generateVisualStory(base as never, { generatedAt: AT }).section!;
    const broken = { ...generated, outcomeCards: [{ metricKey: 'ghost' }] };
    findOne.mockResolvedValue({ id: 'snap-2', version: 4, content: { ...base, visualStory: broken } });
    const state = await readVisualStoryState(CS);
    expect(state.validation.ok).toBe(false);
    expect(state.validation.errors.map((e) => e.code)).toContain('metric_missing');
    expect(state.current).toEqual(broken);
  });

  it('is a 404 when the record has no snapshot, and propagates an unknown record', async () => {
    findOne.mockResolvedValue(null);
    await expect(readVisualStoryState(CS)).rejects.toMatchObject({ error_class: 'SnapshotNotFound', http_status: 404 });
    loadCaseStudyRow.mockRejectedValue(new CaseStudyAdminError('CaseStudyNotFound', 'no'));
    await expect(readVisualStoryState(CS)).rejects.toMatchObject({ error_class: 'CaseStudyNotFound' });
  });
});

describe('draftVisualStory', () => {
  it('drafts from the latest snapshot, stamps the caller clock and the snapshot id, and validates the draft', async () => {
    findOne.mockResolvedValue({ id: 'snap-7', version: 9, content: content() });
    const out = await draftVisualStory(CS, () => new Date(AT));
    expect(out.draft?.provenance).toMatchObject({ generator: 'evidence', generatedAt: AT, sourceSnapshotId: 'snap-7', state: 'draft', humanEdited: false });
    expect(out.draft?.enabled).toBe(false);
    expect(out.draftValidation).toEqual({ ok: true, errors: [] });
    expect(out.current).toBeNull();
    expect(out.reasons).toEqual([]);
    // One read: the state and the draft cannot describe two different snapshots.
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findAllEvidence).toHaveBeenCalledTimes(1);
    expect(out.snapshotId).toBe(out.draft?.provenance.sourceSnapshotId);
  });

  it('explains an empty draft instead of inventing one', async () => {
    const c = content() as Record<string, unknown>;
    delete c.architecture;
    findOne.mockResolvedValue({ id: 'snap-7', version: 9, content: c });
    const out = await draftVisualStory(CS, () => new Date(AT));
    expect(out.draft).toBeNull();
    expect(out.reasons[0]).toMatch(/nothing to illustrate/);
    expect(out.draftValidation.ok).toBe(false);
  });

  it('never writes: the module imports no persistence and no publication path', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'caseStudyVisualStoryService.ts'), 'utf8');
    const imports = source.split('\n').filter((l) => /^\s*import /.test(l) || /^\s*} from /.test(l)).join('\n');
    expect(imports.length).toBeGreaterThan(100);
    expect(imports).not.toMatch(/caseStudySnapshotStore|caseStudyPublicationService|caseStudyAdminReview|applyHumanOverride/);
    expect(source).not.toMatch(/\.(create|update|save|destroy|upsert)\(/);
  });
});
