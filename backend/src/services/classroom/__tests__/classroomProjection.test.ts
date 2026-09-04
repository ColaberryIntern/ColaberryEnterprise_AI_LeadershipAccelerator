/**
 * classroomProjection — resolving each surface's own next action.
 *
 * The behaviour worth guarding is what happens when a surface is unavailable or
 * broken. A card that shows a stale or invented next action is worse than one
 * that falls back to how it was authored, because the student acts on it.
 */
jest.mock('../../projects/projectReadService', () => ({ getActiveProjectTree: jest.fn() }));
jest.mock('../../certPrep/certAvailabilityService', () => ({ getCertAvailability: jest.fn() }));
jest.mock('../../certPrep/certReadinessService', () => ({ computeReadiness: jest.fn() }));

import { getActiveProjectTree } from '../../projects/projectReadService';
import { getCertAvailability } from '../../certPrep/certAvailabilityService';
import { computeReadiness } from '../../certPrep/certReadinessService';
import { resolveProjectNext, resolveCertPrepNext, getClassroomProjection } from '../classroomProjection';

const mTree = getActiveProjectTree as unknown as jest.Mock;
const mAvail = getCertAvailability as unknown as jest.Mock;
const mReadiness = computeReadiness as unknown as jest.Mock;

const tree = (lists: any[]) => ({ id: 'p1', name: 'my-booking-assistant', lists });

beforeEach(() => {
  jest.clearAllMocks();
  mAvail.mockResolvedValue({ available: true, programWeek: 10, startWeek: 7, trackId: 'ccar-f', reason: 'available' });
  mReadiness.mockResolvedValue(null);
});

describe('resolveProjectNext', () => {
  it('offers the first OPEN task in the order the project itself presents', async () => {
    mTree.mockResolvedValue(tree([
      { title: 'Release 0', tasks: [
        { title: 'Already done', status: 'done' },
        { title: 'Add a specialist subagent', status: 'todo' },
        { title: 'Later work', status: 'todo' },
      ] },
    ]));
    const next = await resolveProjectNext('e1');
    expect(next.available).toBe(true);
    expect(next.headline).toBe('Add a specialist subagent');
    expect(next.detail).toContain('my-booking-assistant');
  });

  it('does not invent work when a student has no project', async () => {
    mTree.mockResolvedValue(null);
    const next = await resolveProjectNext('e1');
    expect(next.available).toBe(false);
    expect(next.reason).toBe('no_active_project');
    expect(next.href).toBe('/portal/projects');
  });

  it('says the project is finished rather than showing a blank next step', async () => {
    mTree.mockResolvedValue(tree([{ title: 'Release 0', tasks: [{ title: 'Done', status: 'done' }] }]));
    const next = await resolveProjectNext('e1');
    expect(next.available).toBe(false);
    expect(next.reason).toBe('all_tasks_done');
    expect(next.headline).toContain('my-booking-assistant');
  });

  it('boundary: a project with no lists at all does not throw', async () => {
    mTree.mockResolvedValue(tree([]));
    await expect(resolveProjectNext('e1')).resolves.toMatchObject({ available: false });
  });
});

describe('resolveCertPrepNext', () => {
  it('before the fence, names the week rather than showing a lock', async () => {
    mAvail.mockResolvedValue({ available: false, programWeek: 3, startWeek: 7, trackId: 'ccar-f', reason: 'before_start_week' });
    const next = await resolveCertPrepNext('e1');
    expect(next.available).toBe(false);
    expect(next.headline).toContain('Week 7');
    expect(next.reason).toBe('before_start_week');
  });

  it('with nothing answered, offers the baseline rather than a drill', async () => {
    mReadiness.mockResolvedValue({ answered_total: 0, domain_breakdown: [] });
    const next = await resolveCertPrepNext('e1');
    expect(next.headline).toMatch(/baseline diagnostic/i);
  });

  it('names the weakest ANSWERED domain', async () => {
    mReadiness.mockResolvedValue({
      answered_total: 20,
      domain_breakdown: [
        { domain_id: 'D1', knowledge_pct: 0.8, answered: 10 },
        { domain_id: 'D3', knowledge_pct: 0.3, answered: 10 },
      ],
    });
    const next = await resolveCertPrepNext('e1');
    expect(next.headline).toBe('Drill D3');
    expect(next.detail).toContain('30%');
  });

  it('does NOT treat an unanswered domain as the weakest one', async () => {
    // A domain with no answers is unmeasured, not weak. Drilling it on the
    // strength of a number nobody has is the same mistake as rendering it 0%.
    mReadiness.mockResolvedValue({
      answered_total: 10,
      domain_breakdown: [
        { domain_id: 'D1', knowledge_pct: 0.6, answered: 10 },
        { domain_id: 'D4', knowledge_pct: null, answered: 0 },
      ],
    });
    const next = await resolveCertPrepNext('e1');
    expect(next.headline).toBe('Drill D1');
  });

  it('boundary: readiness unavailable falls back to the baseline, not to silence', async () => {
    mReadiness.mockResolvedValue(null);
    await expect(resolveCertPrepNext('e1')).resolves.toMatchObject({ available: true });
  });
});

describe('getClassroomProjection', () => {
  it('a broken surface degrades ITSELF and nothing else', async () => {
    mTree.mockRejectedValue(new Error('projects are down'));
    mReadiness.mockResolvedValue({ answered_total: 0, domain_breakdown: [] });

    const projection = await getClassroomProjection('e1');
    expect(projection.degraded).toEqual(['project']);
    expect(projection.project).toBeNull();          // falls back to the authored card
    expect(projection.cert_prep).not.toBeNull();    // unaffected
  });

  it('never throws, even when every surface fails — a week must still render', async () => {
    mTree.mockRejectedValue(new Error('down'));
    mAvail.mockRejectedValue(new Error('also down'));

    const projection = await getClassroomProjection('e1');
    expect(projection.degraded.sort()).toEqual(['cert_prep', 'project']);
    expect(projection.project).toBeNull();
    expect(projection.cert_prep).toBeNull();
  });

  it('reports nothing degraded when both surfaces answer', async () => {
    mTree.mockResolvedValue(tree([{ title: 'R0', tasks: [{ title: 'Do it', status: 'todo' }] }]));
    mReadiness.mockResolvedValue({ answered_total: 0, domain_breakdown: [] });
    const projection = await getClassroomProjection('e1');
    expect(projection.degraded).toEqual([]);
  });
});
