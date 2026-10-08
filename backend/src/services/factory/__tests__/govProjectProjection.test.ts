/**
 * govProjectProjection must be STUDENT-SAFE: it exposes the project / tracks / requirements a student works on
 * and NEVER an admin/internal field (tenant/org/brand ids, created_by, track OWNER identity, the raw linked
 * student-project id, content hashes). The loader serves only a non-archived government_public_sector project.
 */
const dpFindByPk = jest.fn();
jest.mock('../../../models/DeliveryProject', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => dpFindByPk(...a) } }));
const ctFindAll = jest.fn();
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findAll: (...a: any[]) => ctFindAll(...a) } }));
const crFindAll = jest.fn();
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: { findAll: (...a: any[]) => crFindAll(...a) } }));

import { toStudentGovProjectView, getStudentGovProjectView } from '../govProjectProjection';

// Rows carrying the FULL set of admin/internal fields that must NOT reach a student.
const projectRow = { id: 'dp-1', name: 'TxDOT Claims Search', slug: 'gov-x', status: 'discovery', project_class: 'government_public_sector',
  tenant_id: 'ten-SECRET', organization_id: 'org-SECRET', brand_id: 'brand-SECRET', created_by_identity_id: 'creator-SECRET', engagement_id: 'eng-SECRET' };
const trackRows = [
  { id: 't1', track_type: 'proposal', status: 'unassessed', owner_identity_id: 'owner-SECRET', solution_student_project_id: null },
  { id: 't2', track_type: 'solution_build', status: 'in_progress', owner_identity_id: 'owner-SECRET2', solution_student_project_id: 'sp-SECRET' },
];
const reqRows = [
  { canonical_req_id: 'REQ-1', statement: 'Provide a search database', priority: 'must', tracks: ['proposal', 'solution_build'], evidence_state: 'unassessed', source_evidence: [{ docId: 'D-SECRET' }], content_sha256: 'hash-SECRET' },
  { canonical_req_id: 'REQ-2', statement: 'Execution of Offer', priority: 'must', tracks: ['proposal'], evidence_state: 'verified' },
];

describe('toStudentGovProjectView (pure) — student-safe', () => {
  const view = toStudentGovProjectView(projectRow, trackRows, reqRows);

  it('exposes the safe project/track/requirement fields', () => {
    expect(view).toMatchObject({ projectId: 'dp-1', name: 'TxDOT Claims Search', status: 'discovery' });
    expect(view.tracks.map((t) => t.trackType).sort()).toEqual(['proposal', 'solution_build']);
    expect(view.requirements.map((r) => r.canonicalReqId)).toEqual(['REQ-1', 'REQ-2']);
    expect(view.requirementCounts).toEqual({ total: 2, proposal: 2, build: 1 });
  });

  it('exposes the build link as a BOOLEAN, never the raw student-project id', () => {
    const build = view.tracks.find((t) => t.trackType === 'solution_build')!;
    expect(build.hasBuild).toBe(true);
    expect(view.tracks.find((t) => t.trackType === 'proposal')!.hasBuild).toBe(false);
    expect(JSON.stringify(view)).not.toContain('sp-SECRET');
  });

  it('NEVER leaks an admin/internal field (serialized view contains none of them)', () => {
    const blob = JSON.stringify(view);
    for (const secret of ['ten-SECRET', 'org-SECRET', 'brand-SECRET', 'creator-SECRET', 'eng-SECRET', 'owner-SECRET', 'owner-SECRET2', 'sp-SECRET', 'hash-SECRET', 'D-SECRET']) {
      expect(blob).not.toContain(secret);
    }
    // and no admin KEYS on the objects
    for (const t of view.tracks) expect(Object.keys(t)).toEqual(['trackType', 'status', 'hasBuild']);
    for (const r of view.requirements) expect(Object.keys(r).sort()).toEqual(['canonicalReqId', 'evidenceState', 'priority', 'statement', 'tracks']);
  });

  it('is total on empty/garbage input', () => {
    expect(toStudentGovProjectView(null, null as any, null as any)).toMatchObject({ projectId: '', tracks: [], requirements: [], requirementCounts: { total: 0, proposal: 0, build: 0 }, build: { releases: [], stories: [], buildStoryCount: 0 } });
  });

  it('P3-T3: surfaces the Build plan — a story+prompt for the solution_build requirement, none for the admin one', () => {
    expect(view.build.buildStoryCount).toBe(1);
    expect(view.build.stories.map((s) => s.requirementId)).toEqual(['REQ-1']); // REQ-2 (proposal-only) has no story
    expect(view.build.stories[0].id).toBe('STORY-REQ-1');
    expect(view.build.stories[0].status).toBe('unassigned');
    expect(view.build.stories[0].prompt).toContain('Provide a search database'); // the prompt cites the requirement verbatim
    expect(view.build.releases[0].storyIds).toEqual(['STORY-REQ-1']);
  });

  it('viewerCanVerify defaults false and threads through when the viewer holds evidence.verify', () => {
    expect(view.viewerCanVerify).toBe(false); // default (the `view` fixture passes no flag)
    expect(toStudentGovProjectView(projectRow, trackRows, reqRows, true).viewerCanVerify).toBe(true);
  });
});

describe('getStudentGovProjectView (loader) — only a non-archived government project', () => {
  beforeEach(() => { jest.clearAllMocks(); ctFindAll.mockResolvedValue(trackRows); crFindAll.mockResolvedValue(reqRows); });

  it('returns the view for a government_public_sector project', async () => {
    dpFindByPk.mockResolvedValue(projectRow);
    const v = await getStudentGovProjectView('dp-1');
    expect(v).not.toBeNull();
    expect(v!.projectId).toBe('dp-1');
  });

  it('returns null for a NON-government project class (this surface serves only gov projects)', async () => {
    dpFindByPk.mockResolvedValue({ ...projectRow, project_class: 'standard' });
    expect(await getStudentGovProjectView('dp-1')).toBeNull();
    expect(ctFindAll).not.toHaveBeenCalled();
  });

  it('returns null for an archived project and for a missing project', async () => {
    dpFindByPk.mockResolvedValue({ ...projectRow, archived_at: new Date() });
    expect(await getStudentGovProjectView('dp-1')).toBeNull();
    dpFindByPk.mockResolvedValue(null);
    expect(await getStudentGovProjectView('nope')).toBeNull();
  });
});
