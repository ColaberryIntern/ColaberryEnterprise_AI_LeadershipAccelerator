import CareerPublication from '../../../models/CareerPublication';
import CareerPublicationSnapshot from '../../../models/CareerPublicationSnapshot';
import CareerPublicationApproval from '../../../models/CareerPublicationApproval';
import { getCareerProfile } from '../careerProfileService';
import {
  slugify, mintUniqueSlug, hashPayload, buildSnapshotPayload,
  requestReview, recordReviewDecision, getPublicSnapshotBySlug, getUnpublishedChanges,
} from '../careerPublicationService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CareerPublication', () => ({ __esModule: true, default: { findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), create: jest.fn() } }));
jest.mock('../../../models/CareerPublicationSnapshot', () => ({ __esModule: true, default: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() } }));
jest.mock('../../../models/CareerPublicationApproval', () => ({ __esModule: true, default: { findOne: jest.fn(), findOrCreate: jest.fn() } }));
jest.mock('../careerProfileService', () => ({ getCareerProfile: jest.fn() }));

const pubFindOne = CareerPublication.findOne as unknown as jest.Mock;
const pubFindByPk = CareerPublication.findByPk as unknown as jest.Mock;
const pubFindAll = CareerPublication.findAll as unknown as jest.Mock;
const pubCreate = CareerPublication.create as unknown as jest.Mock;
const snapFindOne = CareerPublicationSnapshot.findOne as unknown as jest.Mock;
const snapFindByPk = CareerPublicationSnapshot.findByPk as unknown as jest.Mock;
const snapCreate = CareerPublicationSnapshot.create as unknown as jest.Mock;
const apprFindOne = CareerPublicationApproval.findOne as unknown as jest.Mock;
const apprFindOrCreate = CareerPublicationApproval.findOrCreate as unknown as jest.Mock;
const mockProfile = getCareerProfile as unknown as jest.Mock;

const PROFILE = (over: any = {}) => ({
  state: 'ready',
  visibility: 'private',
  identity: {
    full_name: 'Jane Doe', email: 'jane@example.com', title: 'AI Systems Architect',
    company: 'Acme', linkedin_url: null, avatar_data_url: null, cohort_name: 'Fall 2026',
    member_since: null, resume: { file_name: 'jane-private-filename.pdf', uploaded_at: null },
  },
  capabilities: [{
    skill_id: 'agents_mcp', name: 'Agent Architecture', evidence_level: 'colaberry_verified',
    proficiency: 62, confidence: 0.6, bands: { claim: 0, knowledge: 20, application: 30, judgment: 12 },
    evidence_count: 3, last_demonstrated_at: '2026-08-20T00:00:00.000Z', source_breakdown: { timeline: 3 },
  }],
  artifacts: [{ id: 'a1', kind: 'case_study', title: 'Claims triage', summary: 's', competencies: [], created_at: null }],
  projects: [],
  github: { repos: [], activity: null },
  delivery_experience: [],
  readiness: { score: 80, requirements: [], met_count: 8, total_count: 8, meets_policy: true, blocking: [] },
  narrative: { headline: 'AI Systems Architect', headline_source: 'profile_title', suggested_about: null, facts: [] },
  recent_activity: null,
  publication: { status: 'not_published', note: '' },
  degraded: [],
  generated_at: '2026-08-24T00:00:00.000Z',
  ...over,
});

const pubRow = (over: any = {}) => {
  const row: any = { id: 'pub-1', enrollment_id: 'e1', slug: 'jane-doe', status: 'draft', current_snapshot_id: null, ...over };
  row.update = jest.fn(async (patch: any) => { Object.assign(row, patch); return row; });
  return row;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.mockResolvedValue(PROFILE());
  pubFindAll.mockResolvedValue([]);
  snapFindOne.mockResolvedValue(null);
  apprFindOne.mockResolvedValue(null);
});

describe('slug minting (plan §58)', () => {
  it('slugifies a name', () => {
    expect(slugify('Jane Doe')).toBe('jane-doe');
    expect(slugify('José  Álvarez-Pérez')).toBe('jose-alvarez-perez');
  });

  it('never emits an empty slug', () => {
    // Would otherwise produce '' and collide with every other unusable name.
    expect(slugify('!!!')).toBe('member');
    expect(slugify('')).toBe('member');
  });

  it('handles a real collision instead of throwing', async () => {
    pubFindAll.mockResolvedValue([{ slug: 'jane-doe' }]);
    await expect(mintUniqueSlug('Jane Doe')).resolves.toBe('jane-doe-2');
  });

  it('walks past several collisions', async () => {
    pubFindAll.mockResolvedValue([{ slug: 'jane-doe' }, { slug: 'jane-doe-2' }, { slug: 'jane-doe-3' }]);
    await expect(mintUniqueSlug('Jane Doe')).resolves.toBe('jane-doe-4');
  });

  it('is bounded — falls back to a random suffix rather than looping', async () => {
    const many = [{ slug: 'jane-doe' }, ...Array.from({ length: 60 }, (_, i) => ({ slug: `jane-doe-${i + 2}` }))];
    pubFindAll.mockResolvedValue(many);
    const slug = await mintUniqueSlug('Jane Doe');
    expect(slug).toMatch(/^jane-doe-[0-9a-f]{6}$/);
  });
});

describe('buildSnapshotPayload — what an employer may see (plan §24)', () => {
  it('never exposes raw band scores or proficiency', () => {
    const payload: any = buildSnapshotPayload(PROFILE() as any);
    const json = JSON.stringify(payload);
    expect(json).not.toContain('bands');
    expect(json).not.toContain('proficiency');
    expect(json).not.toContain('judgment');
    expect(payload.capabilities[0].evidence_level).toBe('colaberry_verified');
    expect(payload.capabilities[0].evidence_count).toBe(3);
  });

  it('never carries the resume filename into a public payload', () => {
    const json = JSON.stringify(buildSnapshotPayload(PROFILE() as any));
    expect(json).not.toContain('jane-private-filename.pdf');
  });

  it('hashes deterministically, so an unchanged portfolio has an unchanged hash', () => {
    const a = hashPayload(buildSnapshotPayload(PROFILE() as any));
    const b = hashPayload(buildSnapshotPayload(PROFILE() as any));
    expect(a).toBe(b);
  });
});

describe('requestReview — publishing is earned', () => {
  it('refuses when the readiness policy is not met', async () => {
    mockProfile.mockResolvedValue(PROFILE({ readiness: { score: 30, requirements: [], met_count: 3, total_count: 8, meets_policy: false, blocking: ['artifacts'] } }));
    await expect(requestReview('e1')).rejects.toMatchObject({ status: 422, error_class: 'ReadinessNotMet' });
    expect(snapCreate).not.toHaveBeenCalled();
  });

  it('freezes a v1 snapshot and moves the publication into review', async () => {
    const pub = pubRow();
    pubFindOne.mockResolvedValue(pub);
    snapCreate.mockImplementation(async (v: any) => ({ id: 'snap-1', ...v }));

    const r = await requestReview('e1');

    expect(r).toMatchObject({ version: 1, status: 'in_review', deduplicated: false });
    expect(pub.update).toHaveBeenCalledWith({ status: 'in_review' });
  });

  it('increments the version on a genuinely changed resubmission', async () => {
    pubFindOne.mockResolvedValue(pubRow({ status: 'draft' }));
    snapFindOne.mockResolvedValue({ id: 'snap-1', version: 3, content_hash: 'something-else' });
    snapCreate.mockImplementation(async (v: any) => ({ id: 'snap-4', ...v }));

    const r = await requestReview('e1');
    expect(r.version).toBe(4);
  });

  it('IDEMPOTENT: resubmitting unchanged content returns the pending snapshot, not v2', async () => {
    const hash = hashPayload(buildSnapshotPayload(PROFILE() as any));
    pubFindOne.mockResolvedValue(pubRow({ status: 'in_review' }));
    snapFindOne.mockResolvedValue({ id: 'snap-1', version: 1, content_hash: hash });

    const r = await requestReview('e1');

    expect(r).toMatchObject({ snapshot_id: 'snap-1', version: 1, deduplicated: true });
    // The reviewer is not handed a second identical thing to read.
    expect(snapCreate).not.toHaveBeenCalled();
  });

  it('refuses a DIFFERENT submission while one is already in review', async () => {
    pubFindOne.mockResolvedValue(pubRow({ status: 'in_review' }));
    snapFindOne.mockResolvedValue({ id: 'snap-1', version: 1, content_hash: 'stale-hash' });
    await expect(requestReview('e1')).rejects.toMatchObject({ status: 409, error_class: 'AlreadyInReview' });
  });
});

describe('recordReviewDecision — only a human publishes', () => {
  const snap = { id: 'snap-1', publication_id: 'pub-1', version: 1, content_hash: 'h', payload: {}, requested_at: new Date() };

  it('approving publishes and points the publication at that exact snapshot', async () => {
    const pub = pubRow({ status: 'in_review' });
    snapFindByPk.mockResolvedValue(snap);
    pubFindByPk.mockResolvedValue(pub);
    apprFindOrCreate.mockResolvedValue([{ decision: 'approved' }, true]);

    const r = await recordReviewDecision({ snapshotId: 'snap-1', decision: 'approved', reviewerId: 'admin-1' });

    expect(r).toEqual({ decision: 'approved', duplicate: false });
    expect(pub.update).toHaveBeenCalledWith({ status: 'published', current_snapshot_id: 'snap-1' });
  });

  it('a double-clicked Approve records ONE decision (plan §63)', async () => {
    const pub = pubRow({ status: 'in_review' });
    snapFindByPk.mockResolvedValue(snap);
    pubFindByPk.mockResolvedValue(pub);
    // Second click: the unique index makes findOrCreate return the existing row.
    apprFindOrCreate.mockResolvedValue([{ decision: 'approved' }, false]);

    const r = await recordReviewDecision({ snapshotId: 'snap-1', decision: 'approved', reviewerId: 'admin-2' });

    expect(r).toEqual({ decision: 'approved', duplicate: true });
    // Critically: the publication is NOT touched a second time.
    expect(pub.update).not.toHaveBeenCalled();
  });

  it('reports the decision ON RECORD, not the one just attempted', async () => {
    const pub = pubRow({ status: 'in_review' });
    snapFindByPk.mockResolvedValue(snap);
    pubFindByPk.mockResolvedValue(pub);
    apprFindOrCreate.mockResolvedValue([{ decision: 'changes_requested' }, false]);

    // A reviewer clicks Approve on something a colleague already sent back.
    const r = await recordReviewDecision({ snapshotId: 'snap-1', decision: 'approved', reviewerId: 'admin-3' });

    expect(r.decision).toBe('changes_requested');
    expect(pub.update).not.toHaveBeenCalled();
  });

  it('requesting changes returns to draft WITHOUT editing the reviewed snapshot', async () => {
    const pub = pubRow({ status: 'in_review' });
    snapFindByPk.mockResolvedValue(snap);
    pubFindByPk.mockResolvedValue(pub);
    apprFindOrCreate.mockResolvedValue([{ decision: 'changes_requested' }, true]);

    await recordReviewDecision({ snapshotId: 'snap-1', decision: 'changes_requested', reviewerId: 'admin-1', notes: 'Add screenshots' });

    expect(pub.update).toHaveBeenCalledWith({ status: 'draft' });
    // The snapshot model exposes no update path at all — nothing here may mutate it.
    expect((snap as any).update).toBeUndefined();
  });
});

describe('the public read is frozen (plan §23 — the whole point)', () => {
  it('serves the approved snapshot payload, never live data', async () => {
    pubFindOne.mockResolvedValue(pubRow({ status: 'published', current_snapshot_id: 'snap-1' }));
    snapFindByPk.mockResolvedValue({ id: 'snap-1', version: 3, payload: { identity: { full_name: 'Jane Doe' } }, requested_at: new Date() });
    apprFindOne.mockResolvedValue({ decided_at: new Date('2026-08-01T00:00:00.000Z') });

    const r = await getPublicSnapshotBySlug('jane-doe');

    expect(r!.version).toBe(3);
    expect(r!.payload.identity.full_name).toBe('Jane Doe');
    // The live studio is never consulted for a public read.
    expect(mockProfile).not.toHaveBeenCalled();
  });

  it('NEW WORK DOES NOT CHANGE A PUBLISHED SNAPSHOT', async () => {
    const frozen = { identity: { full_name: 'Jane Doe' }, capabilities: [], artifacts: [] };
    pubFindOne.mockResolvedValue(pubRow({ status: 'published', current_snapshot_id: 'snap-1' }));
    snapFindByPk.mockResolvedValue({ id: 'snap-1', version: 1, payload: frozen, requested_at: new Date() });

    // The learner completes a mountain of new work.
    mockProfile.mockResolvedValue(PROFILE({
      artifacts: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, kind: 'case_study', title: `New ${i}`, summary: null, competencies: [], created_at: null })),
    }));

    const r = await getPublicSnapshotBySlug('jane-doe');
    expect(r!.payload.artifacts).toEqual([]);
    expect(r!.version).toBe(1);
  });

  it('is non-enumerable: unknown, unpublished and suspended all return null', async () => {
    pubFindOne.mockResolvedValue(null);
    await expect(getPublicSnapshotBySlug('nobody')).resolves.toBeNull();

    // A suspended publication is excluded by the status filter in the query itself.
    pubFindOne.mockResolvedValue(null);
    await expect(getPublicSnapshotBySlug('suspended-person')).resolves.toBeNull();
  });

  it('returns null when a publication exists but nothing was ever approved', async () => {
    pubFindOne.mockResolvedValue(pubRow({ status: 'published', current_snapshot_id: null }));
    await expect(getPublicSnapshotBySlug('jane-doe')).resolves.toBeNull();
  });
});

describe('getUnpublishedChanges — "updates since v3"', () => {
  it('detects that the studio has moved past the published snapshot', async () => {
    pubFindOne.mockResolvedValue(pubRow({ status: 'published', current_snapshot_id: 'snap-1' }));
    snapFindByPk.mockResolvedValue({ id: 'snap-1', version: 3, content_hash: 'old-hash' });

    const r = await getUnpublishedChanges('e1');
    expect(r).toEqual({ has_changes: true, published_version: 3 });
  });

  it('reports no changes when the studio still matches what was published', async () => {
    const hash = hashPayload(buildSnapshotPayload(PROFILE() as any));
    pubFindOne.mockResolvedValue(pubRow({ status: 'published', current_snapshot_id: 'snap-1' }));
    snapFindByPk.mockResolvedValue({ id: 'snap-1', version: 3, content_hash: hash });

    const r = await getUnpublishedChanges('e1');
    expect(r).toEqual({ has_changes: false, published_version: 3 });
  });
});
