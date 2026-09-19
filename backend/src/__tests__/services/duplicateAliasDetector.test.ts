/**
 * Same person, two emails, one cohort. Found 2026-09-19: one learner's first
 * row held her project and attendance, her second row held the paid
 * subscription, 10 auto-absents, and 8 "Missed Session" emails for classes
 * she attended. A second learner had the same split via a `+2` alias.
 * The exact-email sweep ran daily and never saw either.
 */
jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findAll: jest.fn() },
  CommunityMember: {},
  Subscription: { findAll: jest.fn() },
  AttendanceRecord: { findAll: jest.fn() },
}));

import { Enrollment, Subscription, AttendanceRecord } from '../../models';
import { nameKey, localKey, groupAliasRows, findAliasDuplicates } from '../../services/duplicateAliasDetector';

const C1 = 'cohort-1';
const C2 = 'cohort-2';
const row = (id: string, email: string, full_name: string, cohort_id: string | null = C1) => ({ id, email, full_name, cohort_id });

describe('keys', () => {
  it('normalises names and refuses a single word', () => {
    expect(nameKey('  Learner   One ')).toBe('learner one');
    expect(nameKey('LEARNER ONE')).toBe('learner one');
    expect(nameKey('José Núñez-García')).toBe('jose nunez garcia');
    expect(nameKey('Madonna')).toBeNull();
    expect(nameKey(null)).toBeNull();
  });

  it('strips a +tag from the local part and refuses one too short to mean a person', () => {
    expect(localKey('learner.two+2@gmail.com')).toBe('learner.two');
    expect(localKey('Learner.One@Yahoo.co.uk')).toBe('learner.one');
    expect(localKey('info@acme.com')).toBeNull();
    expect(localKey('john@x.com')).toBeNull();
  });
});

describe('groupAliasRows', () => {
  it('groups the two real cases from 2026-09-19', () => {
    const groups = groupAliasRows([
      row('b1', 'learner.one@gmail.com', 'Learner One'),
      row('b2', 'learner.one@yahoo.co.uk', 'Learner One'),
      row('j1', 'learner.two@gmail.com', 'Learner Two'),
      row('j2', 'learner.two+2@gmail.com', 'Learner Two'),
      row('x1', 'someone.else@gmail.com', 'Someone Else'),
    ]);
    expect(groups.map((g) => g.rows.map((r) => r.id).sort())).toEqual([['b1', 'b2'], ['j1', 'j2']]);
    expect(groups[0].matchedOn).toEqual(['name', 'email']);
  });

  it('matches on the local part alone when the name was typed differently', () => {
    const groups = groupAliasRows([row('a', 'prospect.three@gmail.com', 'Prospect Three'), row('b', 'prospect.three@hotmail.com', 'Prospect W. Three')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].matchedOn).toEqual(['email']);
  });

  it('links transitively: a name match and a local-part match make one group, not two', () => {
    const groups = groupAliasRows([
      row('a', 'person.four@yahoo.com', 'Person Four'),
      row('b', 'pfour509@gmail.com', 'Person Four'),
      row('c', 'pfour509@outlook.com', 'P Four'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('never groups across cohorts (that is a different bug with its own detector)', () => {
    expect(groupAliasRows([row('a', 'learner.one@gmail.com', 'Learner One', C1), row('b', 'learner.one@yahoo.co.uk', 'Learner One', C2)])).toEqual([]);
  });

  it('leaves same-email duplicates to the existing sweep', () => {
    expect(groupAliasRows([row('a', 'dup.person@gmail.com', 'Dup Person'), row('b', 'DUP.person@gmail.com ', 'Dup Person')])).toEqual([]);
  });

  it('ignores rows with no cohort and short generic local parts', () => {
    expect(groupAliasRows([row('a', 'info@one.com', 'A', null), row('b', 'info@two.com', 'B', null)])).toEqual([]);
    expect(groupAliasRows([row('a', 'info@one.com', 'Anne'), row('b', 'info@two.com', 'Bob')])).toEqual([]);
  });

  it('is empty on empty input', () => {
    expect(groupAliasRows([])).toEqual([]);
  });
});

describe('findAliasDuplicates', () => {
  const enr = Enrollment.findAll as jest.Mock;
  const att = AttendanceRecord.findAll as jest.Mock;
  const subs = Subscription.findAll as jest.Mock;
  beforeEach(() => { enr.mockReset(); att.mockReset(); subs.mockReset(); });

  it('reports which row is used and which row pays, and excludes staff, test domains and internship rows', async () => {
    enr.mockResolvedValue([
      { id: 'b1', email: 'learner.one@gmail.com', full_name: 'Learner One', cohort_id: C1 },
      { id: 'b2', email: 'learner.one@yahoo.co.uk', full_name: 'Learner One', cohort_id: C1 },
      { id: 's1', email: 'staffer@colaberry.com', full_name: 'Staff Person', cohort_id: C1 },
      { id: 's2', email: 'staffer567@gmail.com', full_name: 'Staff Person', cohort_id: C1 },
      { id: 't1', email: 'admin.five@gmail.com', full_name: 'Admin Five', cohort_id: C1, communityMember: { mgmt_role: 'admin' } },
      { id: 't2', email: 'admin.five+1@gmail.com', full_name: 'Admin Five', cohort_id: C1 },
      { id: 'i1', email: 'intern.person@gmail.com', full_name: 'Intern Person', cohort_id: C1, enrollment_type: 'internship' },
      { id: 'i2', email: 'intern.person@yahoo.com', full_name: 'Intern Person', cohort_id: C1 },
    ]);
    att.mockResolvedValue([
      ...Array.from({ length: 15 }, () => ({ enrollment_id: 'b1', status: 'late', marked_by: 'self' })),
      { enrollment_id: 'b1', status: 'absent', marked_by: 'system' },
      ...Array.from({ length: 10 }, () => ({ enrollment_id: 'b2', status: 'absent', marked_by: 'system' })),
      { enrollment_id: 'b2', status: 'absent', marked_by: 'admin' },
    ]);
    subs.mockResolvedValue([{ enrollment_id: 'b2', paysimple_payment_id: '156542362' }, { enrollment_id: 'b1', paysimple_payment_id: null }]);

    const out = await findAliasDuplicates();
    expect(out).toEqual([
      {
        cohortId: C1,
        name: 'Learner One',
        matchedOn: ['name', 'email'],
        rows: [
          { id: 'b1', email: 'learner.one@gmail.com', attended: 15, autoAbsent: 1, paid: false },
          { id: 'b2', email: 'learner.one@yahoo.co.uk', attended: 0, autoAbsent: 10, paid: true },
        ],
      },
    ]);
  });

  it('does not report two free signups with no classes and no payment (9 of 11 groups on 2026-09-19)', async () => {
    enr.mockResolvedValue([
      { id: 'f1', email: 'prospect.three@gmail.com', full_name: 'Prospect Three', cohort_id: 'explorer' },
      { id: 'f2', email: 'prospect.three@hotmail.com', full_name: 'Prospect Three', cohort_id: 'explorer' },
    ]);
    att.mockResolvedValue([]);
    subs.mockResolvedValue([{ enrollment_id: 'f2', paysimple_payment_id: null }]);
    await expect(findAliasDuplicates()).resolves.toEqual([]);
  });

  it('does report a pair where only a payment marks it as real', async () => {
    enr.mockResolvedValue([
      { id: 'p1', email: 'new.member@gmail.com', full_name: 'New Member', cohort_id: C1 },
      { id: 'p2', email: 'new.member@yahoo.com', full_name: 'New Member', cohort_id: C1 },
    ]);
    att.mockResolvedValue([]);
    subs.mockResolvedValue([{ enrollment_id: 'p2', paysimple_payment_id: '1' }]);
    const out = await findAliasDuplicates();
    expect(out.map((g) => g.rows.map((r) => `${r.id}:${r.paid}`))).toEqual([['p1:false', 'p2:true']]);
  });

  it('reads nothing else when there is nothing to report', async () => {
    enr.mockResolvedValue([{ id: 'a', email: 'only.one@gmail.com', full_name: 'Only One', cohort_id: C1 }]);
    await expect(findAliasDuplicates()).resolves.toEqual([]);
    expect(att).not.toHaveBeenCalled();
    expect(subs).not.toHaveBeenCalled();
  });

  it('survives an empty or missing result', async () => {
    enr.mockResolvedValue(undefined);
    await expect(findAliasDuplicates()).resolves.toEqual([]);
  });
});
