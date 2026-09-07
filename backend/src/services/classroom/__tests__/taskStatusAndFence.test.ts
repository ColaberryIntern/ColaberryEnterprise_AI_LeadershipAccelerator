/**
 * Two bugs found by looking at the running page, and the tests that would have
 * caught them.
 *
 * Both had the same shape: code that was confidently wrong and failed silently.
 * The project rail told a student with twenty-two open stories that everything
 * was closed, and the certification rail appeared in Week 1. Neither threw,
 * neither logged, and no test noticed, because every test I had written mocked
 * the data instead of asserting against the real vocabulary and the real fence.
 */
jest.mock('../../certPrep/certAvailabilityService', () => ({ getCertAvailability: jest.fn() }));
jest.mock('../../certPrep/certReadinessService', () => ({ computeReadiness: jest.fn() }));

import { isTaskOpen, OPEN_TASK_STATUSES } from '../taskStatus';
import { resolveCertPrepRail } from '../rails/certPrepRail';
import { getCertAvailability } from '../../certPrep/certAvailabilityService';
import { computeReadiness } from '../../certPrep/certReadinessService';
import { RailContext } from '../rails/types';

const mAvail = getCertAvailability as unknown as jest.Mock;
const mReadiness = computeReadiness as unknown as jest.Mock;

const ctx = (week: number): RailContext =>
  ({ enrollmentId: 'e1', cohortId: 'c1', week, isStaff: false });

beforeEach(() => {
  jest.clearAllMocks();
  mReadiness.mockResolvedValue({ items_answered: 0 });
});

describe('open task statuses — the vocabulary bug', () => {
  it('not_started is OPEN — this is the one that was missing', () => {
    // Every untouched story in a fresh project carries this status, so omitting
    // it meant "nothing open" for a project where nothing had been started.
    expect(isTaskOpen('not_started')).toBe(true);
    expect(OPEN_TASK_STATUSES.has('not_started')).toBe(true);
  });

  it('in_progress and blocked are open', () => {
    expect(isTaskOpen('in_progress')).toBe(true);
    expect(isTaskOpen('blocked')).toBe(true);
  });

  it('complete is the only closed state', () => {
    expect(isTaskOpen('complete')).toBe(false);
  });

  it('treats an unrecognised status as OPEN, not closed', () => {
    // Failing open matters here: a status this code has not met should surface
    // the work, not hide it. Hiding a student's task is the worse error.
    expect(isTaskOpen('some_future_status')).toBe(true);
    expect(isTaskOpen(null)).toBe(true);
    expect(isTaskOpen(undefined)).toBe(true);
  });

  it('contains no status the model cannot produce', () => {
    // The first version had 'todo', 'pending' and 'open' -- three words that
    // read as plausible and that StudentTaskStatus has never emitted.
    const real = new Set(['not_started', 'in_progress', 'complete', 'blocked']);
    for (const s of OPEN_TASK_STATUSES) expect(real.has(s)).toBe(true);
  });
});

describe('the certification rail belongs to a week, not only to a student', () => {
  it('is ABSENT in Week 1 even for a student who is past the fence', async () => {
    // The bug exactly: a Week 9 student paging back to Week 1 saw certification
    // sitting in Week 1, which reads as "certification starts in week one".
    mAvail.mockResolvedValue({ available: true, programWeek: 9, startWeek: 7, trackId: 'ccar-f' });
    await expect(resolveCertPrepRail(ctx(1))).resolves.toBeNull();
  });

  it('is absent in every week before the fence', async () => {
    mAvail.mockResolvedValue({ available: true, programWeek: 9, startWeek: 7, trackId: 'ccar-f' });
    for (const week of [1, 2, 3, 4, 5, 6]) {
      await expect(resolveCertPrepRail(ctx(week))).resolves.toBeNull();
    }
  });

  it('appears from the fence week onward', async () => {
    mAvail.mockResolvedValue({ available: true, programWeek: 9, startWeek: 7, trackId: 'ccar-f' });
    for (const week of [7, 8, 12]) {
      const rail = await resolveCertPrepRail(ctx(week));
      expect(rail?.surface).toBe('cert_prep');
    }
  });

  it('stays absent for a student who is NOT past the fence, whatever week they view', async () => {
    // Eligibility and the week gate are different questions; failing either
    // must hide the rail.
    mAvail.mockResolvedValue({ available: false, programWeek: 3, startWeek: 7, trackId: 'ccar-f' });
    await expect(resolveCertPrepRail(ctx(9))).resolves.toBeNull();
  });

  it('uses the track\'s own start week rather than a 7 written in the rail', async () => {
    // Moving the fence in the track must move the rail with it.
    mAvail.mockResolvedValue({ available: true, programWeek: 9, startWeek: 5, trackId: 'ccar-f' });
    expect((await resolveCertPrepRail(ctx(5)))?.surface).toBe('cert_prep');
    expect(await resolveCertPrepRail(ctx(4))).toBeNull();
  });

  it('does not hide the rail when the track has no configured start week', async () => {
    // A null startWeek means the fence is unset, not that it is infinite.
    // Availability has already said yes, so the rail shows.
    mAvail.mockResolvedValue({ available: true, programWeek: 9, startWeek: null, trackId: 'ccar-f' });
    expect((await resolveCertPrepRail(ctx(1)))?.surface).toBe('cert_prep');
  });
});
