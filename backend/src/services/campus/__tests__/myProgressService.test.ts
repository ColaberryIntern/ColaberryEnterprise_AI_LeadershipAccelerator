// C120: getMyProgress wires the existing sources to the pure model, bound to ONE enrollment, and never writes.
import { getMyProgress, __setMyProgressDepsForTests, MyProgressDeps } from '../myProgressService';

function deps(over: Partial<MyProgressDeps> = {}): MyProgressDeps & { calls: string[] } {
  const calls: string[] = [];
  const track = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) => (...a: A) => { calls.push(`${name}:${a.join(',')}`); return fn(...a); };
  return {
    calls,
    enrollment: track('enrollment', async () => ({ full_name: 'Ali M', cohort_id: 'coh-1', cohort_name: 'Cohort 12', intake_data_json: null })),
    weeks: track('weeks', async () => ({ scheduledWeek: 1, rows: [{ week: 1, publishedCardCount: 4, completed: 1 }, { week: 12, publishedCardCount: 1, completed: 0 }] })),
    pointsTotal: track('pointsTotal', async () => 1379),
    rung: track('rung', async () => 'AI Enabled II'),
    xp: track('xp', async () => ({ builder: 93, learning: 130, community: 35 })),
    milestones: track('milestones', async () => []),
    latestCard: track('latestCard', async () => null),
    profile: track('profile', async () => ({ resume_file_name: null, extracted: { phone: '555', location: 'Dallas' } })),
    ...over,
  };
}

afterEach(() => __setMyProgressDepsForTests(null));

it('reads every source for the given enrollment only, and builds the payload', async () => {
  const d = deps();
  __setMyProgressDepsForTests(d);
  const p = await getMyProgress('enr-9');
  expect(p).toMatchObject({ firstName: 'Ali', week: { current: 1, total: 12, cohortName: 'Cohort 12', cardsDoneThisWeek: 1, cardsThisWeek: 4 },
    points: { total: 1379, level: 4, levelName: 'AI Enabled II' }, background: null, hasResume: false });
  expect(d.calls.sort()).toEqual(['enrollment:enr-9', 'latestCard:enr-9', 'milestones:enr-9', 'pointsTotal:enr-9', 'profile:enr-9', 'rung:enr-9,1379', 'weeks:coh-1,enr-9', 'xp:enr-9']);
});

it('no cohort: the week is not read and comes back null', async () => {
  const d = deps({ enrollment: async () => ({ full_name: 'A', cohort_id: null, cohort_name: null, intake_data_json: null }) });
  __setMyProgressDepsForTests(d);
  const p = await getMyProgress('enr-9');
  expect(p.week).toBeNull();
  expect(d.calls.some((c) => c.startsWith('weeks'))).toBe(false);
});

it('a missing enrollment is EnrollmentNotFound', async () => {
  __setMyProgressDepsForTests(deps({ enrollment: async () => null }));
  await expect(getMyProgress('gone')).rejects.toMatchObject({ name: 'MyProgressError', error_class: 'EnrollmentNotFound' });
});

it('a failing read propagates (the route answers 500)', async () => {
  __setMyProgressDepsForTests(deps({ xp: async () => { throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }); } }));
  await expect(getMyProgress('enr-9')).rejects.toMatchObject({ name: 'SequelizeConnectionError' });
});
