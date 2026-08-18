/**
 * reeseWelcomeService — two intros, each exactly once, neither able to break a
 * login.
 *
 * The interesting cases are failure and concurrency, not the happy path: an
 * intro that arrives twice is worse than one that arrives late, and one that
 * breaks a login is worse than no intro at all.
 */
jest.mock('../../../models/ReeseWelcome', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));
jest.mock('../../../models/Cohort', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));
jest.mock('../reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn() }));
jest.mock('../reeseInitiateDmService', () => ({ initiateDm: jest.fn() }));

import ReeseWelcome from '../../../models/ReeseWelcome';
import Enrollment from '../../../models/Enrollment';
import Cohort from '../../../models/Cohort';
import { getReeseEnrollmentId } from '../reeseIdentitySeed';
import { initiateDm } from '../reeseInitiateDmService';
import {
  maybeSendWelcomes,
  accountWelcomeMessage,
  studentWelcomeMessage,
  isRealClassCohort,
  firstNameOf,
} from '../reeseWelcomeService';

const mockFindOne = ReeseWelcome.findOne as unknown as jest.Mock;
const mockCreate = ReeseWelcome.create as unknown as jest.Mock;
const mockEnrollment = Enrollment.findByPk as unknown as jest.Mock;
const mockCohort = Cohort.findByPk as unknown as jest.Mock;
const mockReeseId = getReeseEnrollmentId as unknown as jest.Mock;
const mockInitiate = initiateDm as unknown as jest.Mock;

const PERSON = '11111111-1111-4111-8111-111111111111';
const REESE = '99999999-9999-4999-8999-999999999999';
const ORIGINAL_FLAG = process.env.REESE_WELCOME_ENABLED;

const claimRow = () => ({ update: jest.fn().mockResolvedValue(undefined) });
const outcomes = (rs: Array<{ kind: string; outcome: string }>) =>
  Object.fromEntries(rs.map((r) => [r.kind, r.outcome]));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REESE_WELCOME_ENABLED;
  mockReeseId.mockResolvedValue(REESE);
  mockFindOne.mockResolvedValue(null);
  mockEnrollment.mockResolvedValue({ full_name: 'Ali Muwwakkil', tier: 'guest', cohort_id: null });
  mockCohort.mockResolvedValue(null);
  mockCreate.mockImplementation(async () => claimRow());
  mockInitiate.mockResolvedValue({ roomId: 'room-1', messageId: 'msg-1' });
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.REESE_WELCOME_ENABLED;
  else process.env.REESE_WELCOME_ENABLED = ORIGINAL_FLAG;
});

describe('the two messages', () => {
  it('both lead with mentor, not admissions', () => {
    expect(accountWelcomeMessage('Ali')).toMatch(/AI Systems Architect mentor/);
    expect(studentWelcomeMessage('Ali', 'July 2026')).toMatch(/your mentor/i);
  });

  it('mentions admissions only as something Reese can also help with', () => {
    const m = accountWelcomeMessage('Ali');
    expect(m).toMatch(/admissions/i);
    // Not the opening claim — mentor is.
    expect(m.indexOf('mentor')).toBeLessThan(m.indexOf('admissions'));
  });

  it('does not repeat the account pitch in the student intro', () => {
    expect(studentWelcomeMessage('Ali', 'July 2026')).not.toMatch(/admissions/i);
  });

  it('names the cohort when known, and reads correctly when not', () => {
    expect(studentWelcomeMessage('Ali', 'July 2026')).toMatch(/July 2026/);
    expect(studentWelcomeMessage('Ali', null)).toMatch(/You're in\./);
  });

  it('discloses AI operation on first contact', () => {
    expect(accountWelcomeMessage('Ali')).toMatch(/AI-operated/i);
  });

  it('addresses by first name, and reads correctly with none', () => {
    expect(accountWelcomeMessage('Ali').startsWith('Hi Ali — ')).toBe(true);
    expect(accountWelcomeMessage('').startsWith('Hi — ')).toBe(true);
  });

  it('keeps the locked voice: no mascot energy', () => {
    expect(accountWelcomeMessage('Ali')).not.toMatch(/!/);
    expect(studentWelcomeMessage('Ali', 'July 2026')).not.toMatch(/!/);
  });
});

describe('firstNameOf', () => {
  it('takes the first token, and tolerates nothing', () => {
    expect(firstNameOf('Ali Muwwakkil')).toBe('Ali');
    expect(firstNameOf(null)).toBe('');
    expect(firstNameOf('   ')).toBe('');
  });
});

describe('isRealClassCohort — who counts as a student', () => {
  it('accepts a real class', () => {
    expect(isRealClassCohort({ name: 'July 2026', cohort_type: 'standard' })).toBe(true);
  });
  it('rejects the Explorer/prospect/demo buckets', () => {
    expect(isRealClassCohort({ name: 'Explorer' })).toBe(false);
    expect(isRealClassCohort({ name: 'Open House Prospects' })).toBe(false);
  });
  it('rejects a private business workspace', () => {
    expect(isRealClassCohort({ name: 'Acme', cohort_type: 'business' })).toBe(false);
  });
  it('rejects nothing at all', () => {
    expect(isRealClassCohort(null)).toBe(false);
  });
});

describe('a fresh account, not yet a student', () => {
  it('sends the account intro only', async () => {
    const r = await maybeSendWelcomes(PERSON);

    expect(outcomes(r)).toEqual({ account: 'sent', student: 'not_applicable' });
    expect(mockInitiate).toHaveBeenCalledTimes(1);
    expect(mockInitiate).toHaveBeenCalledWith(PERSON, accountWelcomeMessage('Ali'));
  });
});

describe('joining a class', () => {
  beforeEach(() => {
    mockEnrollment.mockResolvedValue({ full_name: 'Ali Muwwakkil', tier: 'member', cohort_id: 'c1' });
    mockCohort.mockResolvedValue({ name: 'July 2026', cohort_type: 'standard' });
  });

  it('sends the student intro once the account intro already exists', async () => {
    // Account intro on file; student intro not.
    mockFindOne.mockImplementation(async ({ where }: any) =>
      where.kind === 'account' ? { id: 'existing' } : null);

    const r = await maybeSendWelcomes(PERSON);

    expect(outcomes(r)).toEqual({ account: 'already_sent', student: 'sent' });
    expect(mockInitiate).toHaveBeenCalledTimes(1);
    expect(mockInitiate).toHaveBeenCalledWith(PERSON, studentWelcomeMessage('Ali', 'July 2026'));
  });

  it('gives someone who arrives already enrolled BOTH intros, account first', async () => {
    const r = await maybeSendWelcomes(PERSON);

    expect(outcomes(r)).toEqual({ account: 'sent', student: 'sent' });
    expect(mockInitiate).toHaveBeenCalledTimes(2);
    expect(mockInitiate.mock.calls[0][1]).toBe(accountWelcomeMessage('Ali'));
    expect(mockInitiate.mock.calls[1][1]).toBe(studentWelcomeMessage('Ali', 'July 2026'));
  });

  it('counts a member with no cohort as a student', async () => {
    mockEnrollment.mockResolvedValue({ full_name: 'Ali M', tier: 'member', cohort_id: null });
    mockCohort.mockResolvedValue(null);

    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'sent', student: 'sent' });
  });

  it('does NOT count an Explorer-cohort guest as a student', async () => {
    mockEnrollment.mockResolvedValue({ full_name: 'Ali M', tier: 'guest', cohort_id: 'c9' });
    mockCohort.mockResolvedValue({ name: 'Explorer', cohort_type: 'standard' });

    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'sent', student: 'not_applicable' });
  });
});

describe('each intro exactly once, ever', () => {
  it('sends nothing when both are already on file', async () => {
    mockFindOne.mockResolvedValue({ id: 'existing' });
    mockEnrollment.mockResolvedValue({ full_name: 'Ali M', tier: 'member', cohort_id: null });

    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'already_sent', student: 'already_sent' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('claims the row BEFORE sending', async () => {
    const claim = claimRow();
    mockCreate.mockResolvedValue(claim);

    await maybeSendWelcomes(PERSON);

    // Ordering IS the concurrency guarantee, so it is asserted rather than
    // inferred from reading the implementation.
    expect(mockCreate.mock.invocationCallOrder[0]).toBeLessThan(mockInitiate.mock.invocationCallOrder[0]);
    expect(claim.update).toHaveBeenCalledWith({ room_id: 'room-1', message_id: 'msg-1' });
  });

  it('stays silent when it LOSES the unique-index race to a concurrent login', async () => {
    mockCreate.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' }),
    );

    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'already_sent', student: 'not_applicable' });
    expect(mockInitiate).not.toHaveBeenCalled();
  });
});

describe('guards', () => {
  it('never introduces Reese to Reese', async () => {
    expect(outcomes(await maybeSendWelcomes(REESE))).toEqual({ account: 'is_reese' });
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('does nothing when the Reese identity is not seeded yet', async () => {
    mockReeseId.mockResolvedValue(null);
    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'reese_not_seeded' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('honours the kill switch without touching the database', async () => {
    process.env.REESE_WELCOME_ENABLED = 'false';
    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'disabled' });
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('skips a missing enrollment rather than claiming rows for it', async () => {
    mockEnrollment.mockResolvedValue(null);
    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'enrollment_not_found' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('never breaks a login', () => {
  it('records a failed send on the claim and resolves rather than throwing', async () => {
    const claim = claimRow();
    mockCreate.mockResolvedValue(claim);
    mockInitiate.mockRejectedValue(new Error('dm room unavailable'));

    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'send_failed', student: 'not_applicable' });
    expect(claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', detail: expect.stringContaining('dm room unavailable') }),
    );
  });

  it('resolves rather than throwing when the identity lookup itself blows up', async () => {
    mockReeseId.mockRejectedValue(new Error('db down'));
    await expect(maybeSendWelcomes(PERSON)).resolves.toEqual([{ kind: 'account', outcome: 'send_failed' }]);
  });

  it('does not retry an intro whose send previously failed', async () => {
    // The claim row survives a failed send, so the fast path finds it next
    // time. Deliberate: an intro arriving days late reads as broken, not as
    // recovery.
    mockFindOne.mockResolvedValue({ id: 'failed-claim', outcome: 'failed' });
    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'already_sent', student: 'not_applicable' });
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('still sends the student intro if the account intro failed', async () => {
    // One intro failing must not suppress the other.
    mockEnrollment.mockResolvedValue({ full_name: 'Ali M', tier: 'member', cohort_id: null });
    mockInitiate
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ roomId: 'room-2', messageId: 'msg-2' });

    expect(outcomes(await maybeSendWelcomes(PERSON))).toEqual({ account: 'send_failed', student: 'sent' });
  });
});
