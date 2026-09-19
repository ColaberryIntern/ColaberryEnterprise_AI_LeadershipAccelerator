/**
 * demoEvidenceService — the completion and points path for demo-prep tasks.
 *
 * Before this service, no PREP task on the platform had ever been completed
 * (186 existed, all not_started): the client is refused `complete`, and the
 * repo verifier only judges stories. These tests pin the two paths and, above
 * all, what each REFUSES — a service that completes tasks is a service that
 * pays points, and the guard it must not weaken is "granted on evidence,
 * never claimed".
 */
const mockProjectFindByPk = jest.fn();
const mockTaskFindByPk = jest.fn();
const mockTaskFindOne = jest.fn();
const mockTaskUpdate = jest.fn();
const mockAward = jest.fn();
const mockGetTypeXp = jest.fn();

jest.mock('../../../config/env', () => ({ env: { portalPointsAwardEnabled: true, projectApiEnabled: true } }));
jest.mock('../../../config/database', () => ({ sequelize: { transaction: jest.fn(), query: jest.fn() } }));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) } }));
jest.mock('../../../models/StudentTaskList', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: any[]) => mockTaskFindByPk(...a),
    findOne: (...a: any[]) => mockTaskFindOne(...a),
    update: (...a: any[]) => mockTaskUpdate(...a),
    findOrCreate: jest.fn(), create: jest.fn(),
  },
}));
jest.mock('../../projectService', () => ({ createProjectForEnrollment: jest.fn(), getProjectByEnrollment: jest.fn() }));
jest.mock('../projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../pointsService', () => ({ award: (...a: any[]) => mockAward(...a) }));
jest.mock('../../progression/pointsConfigService', () => ({ getTypeXp: (...a: any[]) => mockGetTypeXp(...a) }));

import { submitDemoEvidence, markDemoDayPresented, validateDemoEvidence, isHttpUrl, isPrivateLink } from '../demoEvidenceService';

const ENROLLMENT = 'enr-1';
const PROJECT = 'proj-1';
const task = (over: Record<string, unknown>) => ({
  id: 'task-1', project_id: PROJECT, story_id: 'PREP-2', status: 'not_started',
  verified_at: null, verified_by: null, verified_ref: null, verification_json: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockProjectFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: ENROLLMENT });
  mockTaskUpdate.mockResolvedValue([1]);
  mockAward.mockResolvedValue({ awarded: true, points: 40 });
  mockGetTypeXp.mockImplementation(async (key: string) => ({ learning: 0, community: 0, builder: key === 'presentation' ? 60 : key === 'demo' ? 40 : 0 }));
});
afterEach(() => { (console.log as jest.Mock).mockRestore?.(); });

describe('validateDemoEvidence', () => {
  it('a recording task takes only a link', () => {
    expect(validateDemoEvidence('PREP-2', { kind: 'link', value: 'https://youtu.be/abc' })).toEqual({ ok: true });
    expect(validateDemoEvidence('PREP-5', { kind: 'text', value: 'x'.repeat(200) }).ok).toBe(false);
    expect(validateDemoEvidence('PREP-2', { kind: 'link', value: 'youtu.be/abc' }).ok).toBe(false); // not a full URL
  });

  it('a narrative, slides or notes task takes a link OR enough text', () => {
    expect(validateDemoEvidence('PREP-1', { kind: 'text', value: 'The problem is X. The one moment is Y. The guardrail is Z.' })).toEqual({ ok: true });
    expect(validateDemoEvidence('PREP-3', { kind: 'link', value: 'https://docs.google.com/presentation/d/1' })).toEqual({ ok: true });
    expect(validateDemoEvidence('PREP-4', { kind: 'text', value: 'too short' }).ok).toBe(false);
    expect(validateDemoEvidence('PREP-1', { kind: 'text', value: '   ' }).ok).toBe(false);
    expect(validateDemoEvidence('PREP-1', { kind: 'text', value: 'x'.repeat(5001) }).ok).toBe(false);
  });

  // A link is evidence only if someone else can open it. One learner's
  // narrative went in as http://localhost:8420/command-center/... on
  // 2026-09-17 and was accepted; nobody but him can ever open it.
  it('refuses a link that only opens on the student\'s own machine, and says what to do instead', () => {
    for (const v of [
      'http://localhost:8420/command-center/index.html#card-guardrails',
      'http://127.0.0.1:3000/demo.mp4',
      'http://0.0.0.0:8080/',
      'http://[::1]:5173/',
      'http://192.168.1.20/video.mp4',
      'http://10.0.0.5/x',
      'http://172.20.3.4/x',
      'http://my-laptop:8420/',
      'http://printer.local/x',
      'http://app.localhost:3000/',
    ]) {
      const r = validateDemoEvidence('PREP-2', { kind: 'link', value: v });
      expect({ v, ok: r.ok }).toEqual({ v, ok: false });
      if (!r.ok) expect(r.reason).toMatch(/only opens on your own computer.*Anyone with the link/);
    }
  });

  it('still accepts the hosts real recordings live on', () => {
    for (const v of [
      'https://drive.google.com/file/d/abc/view?usp=sharing',
      'https://1drv.ms/v/s!abc',
      'https://youtu.be/abc',
      'https://www.loom.com/share/abc',
      'https://172.217.0.1.nip.io/x',
      'https://fcbarcelona.com/',
    ]) expect({ v, ok: validateDemoEvidence('PREP-5', { kind: 'link', value: v }).ok }).toEqual({ v, ok: true });
  });

  it('isPrivateLink draws the private ranges exactly, not by prefix guesswork', () => {
    expect(isPrivateLink('http://172.15.0.1/')).toBe(false);
    expect(isPrivateLink('http://172.16.0.1/')).toBe(true);
    expect(isPrivateLink('http://172.31.255.1/')).toBe(true);
    expect(isPrivateLink('http://172.32.0.1/')).toBe(false);
    expect(isPrivateLink('http://169.254.1.1/')).toBe(true);
    expect(isPrivateLink('http://[fe80::1]/')).toBe(true);
    expect(isPrivateLink('https://[2001:4860:4860::8888]/')).toBe(false);
    expect(isPrivateLink('not a url')).toBe(false); // isHttpUrl refuses it first
  });

  it('isHttpUrl accepts http(s) only', () => {
    expect(isHttpUrl('https://a.b/c?d=1')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('ftp://x')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});

describe('submitDemoEvidence', () => {
  it('verifies the task from the submission, stores the evidence on the row, and pays the demo rate under the Today ref', async () => {
    const t = task({ story_id: 'PREP-2' });
    mockTaskFindOne.mockResolvedValue(t);
    // The service resolves by (project, story id); markTaskVerifiedComplete re-reads the same way.
    const r = await submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'link', value: ' https://youtu.be/run1 ' });
    expect(r).toMatchObject({ id: 'task-1', story_id: 'PREP-2', status: 'complete', points_awarded: 40, already_verified: false });
    // The row carries the evidence: who verified it, the link, and the detail.
    const [attrs] = mockTaskUpdate.mock.calls[0];
    expect(attrs).toMatchObject({ status: 'complete', verified_by: 'demo_evidence', verified_ref: 'https://youtu.be/run1' });
    expect(attrs.verification_json).toMatchObject({ kind: 'link', value: 'https://youtu.be/run1' });
    expect(attrs.verified_at).toBeInstanceOf(Date);
    // Paid from the `demo` row, keyed exactly as the Today feed refs the tile.
    expect(mockAward).toHaveBeenCalledWith(ENROLLMENT, expect.objectContaining({ eventType: 'demo', eventKey: 'project:task-1', points: 40 }));
  });

  it('refuses a STORY: those are verified from the repo, and this must not become a second way in', async () => {
    mockTaskFindOne.mockResolvedValue(task({ story_id: 'STORY-003' }));
    await expect(submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'link', value: 'https://x.y' })).rejects.toMatchObject({ status: 409, error_class: 'NotAPrepTask' });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('refuses Demo Day: a student cannot vouch for their own presentation', async () => {
    mockTaskFindOne.mockResolvedValue(task({ story_id: 'PREP-6' }));
    await expect(submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'text', value: 'I presented, honest. '.repeat(5) })).rejects.toMatchObject({ status: 409, error_class: 'StaffVerifiedTask' });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it('answers 404 for a task the student does not own, exactly like a task that does not exist', async () => {
    mockTaskFindOne.mockResolvedValue(task({}));
    mockProjectFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: 'someone-else' });
    expect(await submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'link', value: 'https://x.y' })).toBeNull();
    mockTaskFindOne.mockResolvedValue(null);
    expect(await submitDemoEvidence(ENROLLMENT, PROJECT, 'nope', { kind: 'link', value: 'https://x.y' })).toBeNull();
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it('answers 422 with the reason when the evidence does not satisfy the task, and writes nothing', async () => {
    mockTaskFindOne.mockResolvedValue(task({ story_id: 'PREP-5' }));
    await expect(submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'text', value: 'x'.repeat(100) }))
      .rejects.toMatchObject({ status: 422, error_class: 'InvalidEvidence', message: 'This task needs a link to your recording.' });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('is idempotent: a second submission on a verified task changes nothing and pays nothing', async () => {
    mockTaskFindOne.mockResolvedValue(task({ story_id: 'PREP-1', verified_at: new Date('2026-09-01T00:00:00Z'), verified_by: 'demo_evidence' }));
    const r = await submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'text', value: 'A different narrative this time, long enough to pass the floor.' });
    expect(r).toMatchObject({ already_verified: true, points_awarded: 0, status: 'complete' });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('a failed points mirror does not fail the submission — the verification is the truth', async () => {
    const t = task({ story_id: 'PREP-3' });
    mockTaskFindOne.mockResolvedValue(t); mockTaskFindOne.mockResolvedValue(t);
    mockAward.mockRejectedValue(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    const r = await submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'link', value: 'https://slides.example/deck' });
    expect(r).toMatchObject({ status: 'complete', points_awarded: 0, already_verified: false });
    expect(mockTaskUpdate).toHaveBeenCalledTimes(1);
    const logged = (console.log as jest.Mock).mock.calls.map((c) => String(c[0])).find((s) => s.includes('demo_points_award_failed'));
    expect(logged).toContain('"error_class":"SequelizeConnectionError"');
  });

  it('pays nothing, but still verifies, when the demo rate is unset', async () => {
    mockGetTypeXp.mockResolvedValue({ learning: 0, builder: 0, community: 0 });
    const t = task({ story_id: 'PREP-4' });
    mockTaskFindOne.mockResolvedValue(t); mockTaskFindOne.mockResolvedValue(t);
    const r = await submitDemoEvidence(ENROLLMENT, PROJECT, 'PREP-X', { kind: 'text', value: 'Rehearsed with Firas; notes: slow down on the metric slide, cut the intro by half.' });
    expect(r).toMatchObject({ status: 'complete', points_awarded: 0 });
    expect(mockAward).not.toHaveBeenCalled();
  });
});

describe('markDemoDayPresented', () => {
  it('marks PREP-6 with the admin as the ref and pays the presentation rate to the OWNER', async () => {
    const t = task({ story_id: 'PREP-6' });
    mockTaskFindByPk.mockResolvedValue(t); mockTaskFindOne.mockResolvedValue(t);
    mockAward.mockResolvedValue({ awarded: true, points: 60 });
    const r = await markDemoDayPresented('ali@colaberry.com', 'task-1', 'Strong demo, clear metric.');
    expect(r).toMatchObject({ story_id: 'PREP-6', status: 'complete', points_awarded: 60 });
    const [attrs] = mockTaskUpdate.mock.calls[0];
    expect(attrs).toMatchObject({ verified_by: 'staff', verified_ref: 'ali@colaberry.com' });
    expect(attrs.verification_json).toMatchObject({ marked_by: 'ali@colaberry.com', note: 'Strong demo, clear metric.' });
    expect(mockAward).toHaveBeenCalledWith(ENROLLMENT, expect.objectContaining({ eventType: 'presentation', eventKey: 'project:task-1', points: 60 }));
  });

  it('refuses anything but Demo Day', async () => {
    mockTaskFindByPk.mockResolvedValue(task({ story_id: 'PREP-2' }));
    await expect(markDemoDayPresented('ali@colaberry.com', 'task-1')).rejects.toMatchObject({ status: 409, error_class: 'NotDemoDayTask' });
    mockTaskFindByPk.mockResolvedValue(task({ story_id: 'STORY-000' }));
    await expect(markDemoDayPresented('ali@colaberry.com', 'task-1')).rejects.toMatchObject({ status: 409 });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent on a second mark', async () => {
    mockTaskFindByPk.mockResolvedValue(task({ story_id: 'PREP-6', verified_at: new Date(), verified_by: 'staff' }));
    const r = await markDemoDayPresented('ali@colaberry.com', 'task-1');
    expect(r).toMatchObject({ already_verified: true, points_awarded: 0 });
    expect(mockAward).not.toHaveBeenCalled();
  });
});
