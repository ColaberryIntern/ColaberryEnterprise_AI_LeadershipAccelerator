/**
 * reeseWelcomeService — the guarantees that matter for a message every student
 * receives exactly once, on the login path.
 *
 * The interesting cases are all failure and concurrency, not the happy path:
 * a greeting that arrives twice is worse than one that arrives late, and a
 * greeting that breaks a login is worse than no greeting at all.
 */
jest.mock('../../../models/ReeseWelcome', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));
jest.mock('../reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn() }));
jest.mock('../reeseInitiateDmService', () => ({ initiateDm: jest.fn() }));

import ReeseWelcome from '../../../models/ReeseWelcome';
import Enrollment from '../../../models/Enrollment';
import { getReeseEnrollmentId } from '../reeseIdentitySeed';
import { initiateDm } from '../reeseInitiateDmService';
import { maybeSendWelcome, welcomeMessage, firstNameOf } from '../reeseWelcomeService';

const mockFindOne = ReeseWelcome.findOne as unknown as jest.Mock;
const mockCreate = ReeseWelcome.create as unknown as jest.Mock;
const mockEnrollment = Enrollment.findByPk as unknown as jest.Mock;
const mockReeseId = getReeseEnrollmentId as unknown as jest.Mock;
const mockInitiate = initiateDm as unknown as jest.Mock;

const STUDENT = '11111111-1111-4111-8111-111111111111';
const REESE = '99999999-9999-4999-8999-999999999999';
const ORIGINAL_FLAG = process.env.REESE_WELCOME_ENABLED;

function claimRow() {
  return { update: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REESE_WELCOME_ENABLED;
  mockReeseId.mockResolvedValue(REESE);
  mockFindOne.mockResolvedValue(null);
  mockEnrollment.mockResolvedValue({ full_name: 'Ali Muwwakkil' });
  mockCreate.mockImplementation(async () => claimRow());
  mockInitiate.mockResolvedValue({ roomId: 'room-1', messageId: 'msg-1' });
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.REESE_WELCOME_ENABLED;
  else process.env.REESE_WELCOME_ENABLED = ORIGINAL_FLAG;
});

describe("welcomeMessage — the brief, in Reese's locked voice", () => {
  it('says Reese is with admissions and invites questions', () => {
    const m = welcomeMessage('Ali');
    expect(m).toMatch(/I'm Reese/);
    expect(m).toMatch(/admissions/i);
    expect(m).toMatch(/ask me/i);
  });

  it('discloses it is AI-operated without being asked', () => {
    expect(welcomeMessage('Ali')).toMatch(/AI-operated/i);
  });

  it('addresses the student by first name when known', () => {
    expect(welcomeMessage('Ali').startsWith('Hi Ali — ')).toBe(true);
  });

  it('reads correctly with no name rather than greeting a blank', () => {
    const m = welcomeMessage('');
    expect(m.startsWith('Hi — ')).toBe(true);
    expect(m).not.toMatch(/Hi\s+—\s+—/);
  });

  it('keeps the locked voice: no mascot energy', () => {
    expect(welcomeMessage('Ali')).not.toMatch(/!/);
  });
});

describe('firstNameOf', () => {
  it('takes the first token of a full name', () => {
    expect(firstNameOf('Ali Muwwakkil')).toBe('Ali');
  });
  it('returns empty for null/undefined/blank rather than throwing', () => {
    expect(firstNameOf(null)).toBe('');
    expect(firstNameOf(undefined)).toBe('');
    expect(firstNameOf('   ')).toBe('');
  });
});

describe('maybeSendWelcome — the happy path', () => {
  it('claims the ledger row BEFORE sending, then records the ids', async () => {
    const claim = claimRow();
    mockCreate.mockResolvedValue(claim);

    const r = await maybeSendWelcome(STUDENT);

    expect(r).toEqual({ outcome: 'sent', roomId: 'room-1', messageId: 'msg-1' });
    // Ordering IS the concurrency guarantee, so it is asserted directly rather
    // than assumed from reading the implementation.
    expect(mockCreate.mock.invocationCallOrder[0]).toBeLessThan(mockInitiate.mock.invocationCallOrder[0]);
    expect(claim.update).toHaveBeenCalledWith({ room_id: 'room-1', message_id: 'msg-1' });
  });

  it('sends the deterministic greeting, not a generated one', async () => {
    await maybeSendWelcome(STUDENT);
    expect(mockInitiate).toHaveBeenCalledWith(STUDENT, welcomeMessage('Ali'));
  });
});

describe('maybeSendWelcome — exactly once, ever', () => {
  it('short-circuits for an already-welcomed student without writing or sending', async () => {
    mockFindOne.mockResolvedValue({ id: 'existing' });

    expect(await maybeSendWelcome(STUDENT)).toEqual({ outcome: 'already_welcomed' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('stays silent when it LOSES the unique-index race to a concurrent login', async () => {
    // Both tabs saw no row; the database rejects the second insert.
    mockCreate.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' }),
    );

    expect(await maybeSendWelcome(STUDENT)).toEqual({ outcome: 'already_welcomed' });
    expect(mockInitiate).not.toHaveBeenCalled();
  });
});

describe('maybeSendWelcome — guards', () => {
  it('never welcomes Reese', async () => {
    expect(await maybeSendWelcome(REESE)).toEqual({ outcome: 'is_reese' });
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('does nothing when the Reese identity is not seeded yet', async () => {
    mockReeseId.mockResolvedValue(null);
    expect(await maybeSendWelcome(STUDENT)).toEqual({ outcome: 'reese_not_seeded' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('honours the kill switch without touching the database', async () => {
    process.env.REESE_WELCOME_ENABLED = 'false';
    expect(await maybeSendWelcome(STUDENT)).toEqual({ outcome: 'disabled' });
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('skips a missing enrollment rather than claiming a row for it', async () => {
    mockEnrollment.mockResolvedValue(null);
    expect(await maybeSendWelcome(STUDENT)).toEqual({ outcome: 'enrollment_not_found' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('maybeSendWelcome — never breaks a login', () => {
  it('records a failed send on the claim and resolves rather than throwing', async () => {
    const claim = claimRow();
    mockCreate.mockResolvedValue(claim);
    mockInitiate.mockRejectedValue(new Error('dm room unavailable'));

    expect(await maybeSendWelcome(STUDENT)).toEqual({ outcome: 'send_failed' });
    expect(claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', detail: expect.stringContaining('dm room unavailable') }),
    );
  });

  it('resolves rather than throwing when the identity lookup itself blows up', async () => {
    mockReeseId.mockRejectedValue(new Error('db down'));
    await expect(maybeSendWelcome(STUDENT)).resolves.toEqual({ outcome: 'send_failed' });
  });

  it('does not retry a student whose send previously failed', async () => {
    // The claim row survives a failed send, so the fast path finds it next time.
    // Deliberate: a greeting arriving days late on an unrelated login reads as
    // broken, not as recovery.
    mockFindOne.mockResolvedValue({ id: 'failed-claim', outcome: 'failed' });
    expect(await maybeSendWelcome(STUDENT)).toEqual({ outcome: 'already_welcomed' });
    expect(mockInitiate).not.toHaveBeenCalled();
  });
});
