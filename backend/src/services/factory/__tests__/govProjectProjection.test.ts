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
const evFindAll = jest.fn();
jest.mock('../../../models/GovBuildStoryEvidence', () => ({ __esModule: true, default: { findAll: (...a: any[]) => evFindAll(...a) } }));
const asFindAll = jest.fn();
jest.mock('../../../models/GovBuildStoryAssignment', () => ({ __esModule: true, default: { findAll: (...a: any[]) => asFindAll(...a) } }));
const gprFindAll = jest.fn();
jest.mock('../../../models/GovProposalResponse', () => ({ __esModule: true, default: { findAll: (...a: any[]) => gprFindAll(...a), findOne: jest.fn() } }));
const gpsgFindOne = jest.fn();
jest.mock('../../../models/GovProposalShareGrant', () => ({ __esModule: true, default: { findOne: (...a: any[]) => gpsgFindOne(...a) } }));
const gqFindOne = jest.fn();
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => gqFindOne(...a) } }));
const plain = (v: any) => ({ get: () => ({ ...v }) });

import { toStudentGovProjectView, getStudentGovProjectView, toStudentSubmissionChecklist } from '../govProjectProjection';

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

  it('P5: drops a pricing requirement entirely — its dollar figures never reach a student', () => {
    const withPricing = toStudentGovProjectView(projectRow, trackRows, [
      ...reqRows,
      { canonical_req_id: 'REQ-PRICE', statement: 'Total not to exceed $4,200,000 over the base year.', priority: 'must', tracks: ['proposal'], evidence_state: 'unassessed', kind: 'pricing' },
    ]);
    expect(withPricing.requirements.map((r) => r.canonicalReqId)).not.toContain('REQ-PRICE');
    expect(JSON.stringify(withPricing)).not.toContain('4,200,000'); // the price is not anywhere in the projection
    expect(withPricing.requirementCounts.total).toBe(2);            // pricing is not counted either
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

  it('P6: the pure view defaults to NOTHING shared and NOTHING owed until the loader resolves them', () => {
    expect(view.proposal).toEqual({ level: 'none', canComment: false, canEdit: false, responses: [] });
    expect(view.submissionChecklist.ready).toBe(false);
    expect(view.submissionChecklist.items).toEqual([]);
  });
});

describe('toStudentSubmissionChecklist (pure) — PRICE-FREE', () => {
  const established = [
    { canonical_req_id: 'REQ-1', kind: 'scope' },
    { canonical_req_id: 'REQ-2', kind: 'rule' },
    { canonical_req_id: 'REQ-PRICE', kind: 'pricing' },
  ];
  const slots = [
    { requirementId: 'REQ-1', statement: 'Search DB', status: 'approved', gaps: [] },
    { requirementId: 'REQ-2', statement: 'Offer', status: 'draft', gaps: [{ resolution: 'filler' }] },
    { requirementId: 'REQ-PRICE', statement: 'Total not to exceed $4,200,000.', status: 'approved', gaps: [] },
  ];

  it('drops the pricing slot, scores approved vs remaining, and never carries a price', () => {
    const c = toStudentSubmissionChecklist(slots, established);
    expect(c.items.map((i) => i.requirementId)).toEqual(['REQ-1', 'REQ-2']); // REQ-PRICE dropped
    expect(JSON.stringify(c)).not.toContain('4,200,000');
    expect(c.items.find((i) => i.requirementId === 'REQ-1')!.approved).toBe(true);
    expect(c.items.find((i) => i.requirementId === 'REQ-2')!.approved).toBe(false); // a filler gap blocks it
    expect(c.counts).toEqual({ total: 2, approved: 1, remaining: 1 });
    expect(c.ready).toBe(false);
    // COCKPIT: proposal tasks are human-owned; approved ⇒ `done`, an in-progress draft ⇒ `build`; never `matched`.
    expect(c.items.find((i) => i.requirementId === 'REQ-1')!).toMatchObject({ stage: 'done', owner: 'human' });
    expect(c.items.find((i) => i.requirementId === 'REQ-2')!.stage).toBe('build');
  });

  it('COCKPIT: `mine` tracks the viewer\'s edit grant (canEdit)', () => {
    expect(toStudentSubmissionChecklist(slots, established, true).items.every((i) => i.mine === true)).toBe(true);
    expect(toStudentSubmissionChecklist(slots, established, false).items.every((i) => i.mine === false)).toBe(true);
  });

  it('is ready only when every non-pricing response is approved with no open/filler gap', () => {
    const allApproved = [
      { requirementId: 'REQ-1', statement: 'a', status: 'approved', gaps: [] },
      { requirementId: 'REQ-2', statement: 'b', status: 'approved', gaps: [{ resolution: 'answered' }] },
    ];
    expect(toStudentSubmissionChecklist(allApproved, established).ready).toBe(true);
  });

  it('is total on garbage', () => {
    expect(toStudentSubmissionChecklist(undefined as any, undefined as any)).toEqual({ items: [], counts: { total: 0, approved: 0, remaining: 0 }, ready: false });
  });
});

describe('getStudentGovProjectView (loader) — only a non-archived government project', () => {
  beforeEach(() => { jest.clearAllMocks(); ctFindAll.mockResolvedValue(trackRows); crFindAll.mockResolvedValue(reqRows); evFindAll.mockResolvedValue([]); asFindAll.mockResolvedValue([]); gprFindAll.mockResolvedValue([]); gpsgFindOne.mockResolvedValue(null); gqFindOne.mockResolvedValue(null); });

  it('returns the view for a government_public_sector project', async () => {
    dpFindByPk.mockResolvedValue(projectRow);
    const v = await getStudentGovProjectView('dp-1');
    expect(v).not.toBeNull();
    expect(v!.projectId).toBe('dp-1');
  });

  it('P3-T2/T4: overlays assignment STATUS to the student but NEVER leaks the assignee identity, and surfaces orphaned work', async () => {
    dpFindByPk.mockResolvedValue(projectRow);
    // STORY-REQ-1 is derived (REQ-1 is solution_build) and assigned to a builder; it also has evidence.
    asFindAll.mockResolvedValue([plain({ id: 'as-1', story_id: 'STORY-REQ-1', canonical_req_id: 'REQ-1', assignee_identity_id: 'builder-SECRET', assigned_by_identity_id: 'op-1', assigned_at: new Date('2026-10-08T00:00:00Z') })]);
    // Evidence exists for the derived story AND for a story whose requirement is no longer established (orphan).
    evFindAll.mockResolvedValue([
      plain({ id: 'ev-1', story_id: 'STORY-REQ-1', canonical_req_id: 'REQ-1', description: 'built it', artifact_ref: null, status: 'verified', submitted_by_identity_id: 'sub-SECRET', submitted_at: new Date('2026-10-08T00:00:00Z') }),
      plain({ id: 'ev-2', story_id: 'STORY-REQ-GONE', canonical_req_id: 'REQ-GONE', description: 'work on a revised-away requirement', artifact_ref: null, status: 'submitted', submitted_by_identity_id: 'sub-SECRET', submitted_at: new Date('2026-10-08T00:00:00Z') }),
    ]);
    const v = await getStudentGovProjectView('dp-1');
    const story = v!.build.stories.find((s) => s.id === 'STORY-REQ-1')!;
    expect(story.status).toBe('assigned');                 // the STATUS overlays through
    expect(story.assigneeIdentityId).toBeNull();           // but the student never learns WHO (no leak)
    expect(story.evidence.map((e) => e.id)).toEqual(['ev-1']); // the student's evidence is attached to the live story
    expect(JSON.stringify(v)).not.toContain('builder-SECRET'); // the assignee identity is nowhere in the student payload
    // The orphaned work (requirement revised away) is PRESERVED, not dropped.
    expect(v!.build.orphanedStories.map((s) => s.id)).toEqual(['STORY-REQ-GONE']);
    expect(v!.build.orphanedStories[0].orphaned).toBe(true);
    expect(v!.build.orphanedStories[0].evidence.map((e) => e.id)).toEqual(['ev-2']);
    // COCKPIT: verified evidence ⇒ stage `done`; owner is `ai`; no viewer ⇒ not mine; no github_push ⇒ no commit/feed.
    expect(story.stage).toBe('done');
    expect(story.owner).toBe('ai');
    expect(story.mine).toBe(false);
    expect(story.commit).toBeNull();
    expect(v!.commitFeed).toEqual([]); // ev-1/ev-2 are manual hand-ins (source `student`), not pushes
  });

  it('COCKPIT: a github_push evidence row makes the story `matched`, carries the commit, and shows in the feed; mine is true for the assignee-viewer', async () => {
    dpFindByPk.mockResolvedValue(projectRow);
    asFindAll.mockResolvedValue([plain({ id: 'as-1', story_id: 'STORY-REQ-1', canonical_req_id: 'REQ-1', assignee_identity_id: 'viewer-1', assigned_by_identity_id: 'op-1', assigned_at: new Date('2026-10-08T00:00:00Z') })]);
    evFindAll.mockResolvedValue([
      plain({ id: 'ev-1', story_id: 'STORY-REQ-1', canonical_req_id: 'REQ-1', description: 'feat: search [REQ-1]', artifact_ref: 'https://github.com/o/r/commit/abc123', status: 'submitted', source: 'github_push', commit_sha: 'abc123', submitted_by_identity_id: 'viewer-1', submitted_at: new Date('2026-10-09T00:00:00Z') }),
    ]);
    const v = await getStudentGovProjectView('dp-1', false, 'viewer-1'); // the viewer IS the assignee
    const story = v!.build.stories.find((s) => s.id === 'STORY-REQ-1')!;
    expect(story.stage).toBe('matched');                        // a commit proposes completion — matched, not done
    expect(story.commit).toEqual({ sha: 'abc123', message: 'feat: search [REQ-1]' });
    expect(story.mine).toBe(true);                              // viewer === assignee
    expect(story.assigneeIdentityId).toBeNull();               // but the id itself is still stripped
    expect(v!.commitFeed).toEqual([{ sha: 'abc123', message: 'feat: search [REQ-1]', storyKey: 'REQ-1', at: '2026-10-09T00:00:00.000Z', verified: false }]);
  });

  it('COCKPIT: surfaces the agency + key dates from the qualification (public facts only)', async () => {
    dpFindByPk.mockResolvedValue(projectRow);
    gqFindOne.mockResolvedValue({ requirements_json: {
      provenance: { agency: 'TxDOT Office of General Counsel' },
      dossier: { keyDates: [{ date: '2026-11-06', text: 'Proposals due' }], contacts: [{ email: 'phishing@irs.gov' }] },
    } });
    const v = await getStudentGovProjectView('dp-1', false, 'id-1');
    expect(v!.agency).toBe('TxDOT Office of General Counsel');
    expect(v!.keyDates).toEqual([{ date: '2026-11-06', text: 'Proposals due' }]);
    expect(JSON.stringify(v)).not.toContain('phishing@irs.gov'); // dossier contacts are NOT carried to the student
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

  it('P6: with NO viewer identity the proposal stays hidden (level none) but the price-free checklist still populates', async () => {
    dpFindByPk.mockResolvedValue(projectRow);
    const v = await getStudentGovProjectView('dp-1'); // no viewerIdentityId
    expect(v!.proposal.level).toBe('none');
    expect(v!.proposal.responses).toEqual([]);
    expect(gpsgFindOne).not.toHaveBeenCalled();                 // no identity ⇒ no grant lookup
    expect(v!.submissionChecklist.counts.total).toBe(2);        // REQ-1 + REQ-2 (REQ-PRICE is not in this fixture)
    expect(v!.submissionChecklist.ready).toBe(false);           // all unanswered
  });

  it('P6: threads the viewer identity to the share grant — a "view" grant reveals the responses read-only', async () => {
    dpFindByPk.mockResolvedValue(projectRow);
    gpsgFindOne.mockResolvedValue(plain({ delivery_project_id: 'dp-1', member_identity_id: 'id-1', level: 'view', updated_at: null }));
    const v = await getStudentGovProjectView('dp-1', false, 'id-1');
    expect(v!.proposal.level).toBe('view');
    expect(v!.proposal.canComment).toBe(false);                 // view is read-only
    expect(v!.proposal.responses.map((r) => r.requirementId)).toEqual(['REQ-1', 'REQ-2']); // no responses yet, slots unanswered
    expect(v!.proposal.responses.every((r) => r.status === 'unanswered')).toBe(true);
  });
});
