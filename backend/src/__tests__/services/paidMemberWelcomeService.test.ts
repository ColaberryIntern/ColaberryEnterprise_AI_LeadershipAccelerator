/**
 * The paid-member welcome sweep (C10.18).
 *
 * The copy is tested as copy in `paidMemberWelcomeCopy.test.ts`. What is tested here is the
 * sweep: who it selects, who it refuses to mail, that the switch really is off, that one bad
 * member does not end the run, and above all that the dedup key is the PAID event and not the
 * sign-in-link set - because getting that wrong silently skips exactly the people the ticket is
 * about, and nothing fails loudly when it does.
 */
jest.mock('../../models', () => ({
  Cohort: { findByPk: jest.fn() },
  Enrollment: { findAll: jest.fn() },
}));
jest.mock('../../config/env', () => ({ env: {
  paidMemberWelcomeEnabled: true,
  frontendUrl: 'https://enterprise.colaberry.ai',
  trainingWelcomeFromEmail: 'training@colaberry.com',
} }));
jest.mock('../../services/welcome/sendPortalWelcome', () => ({
  alreadyWelcomed: jest.fn().mockResolvedValue(false),
  WELCOME_EVENTS: ['portal_welcome', 'open_house_welcome'],
}));
jest.mock('../../services/emailService', () => ({
  guardedSendMail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
  resolveEmailRecipient: jest.fn(async (to: string, subject: string) => ({ to, subject })),
}));
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn() }));
jest.mock('../../services/communityRooms/cohortRoomService', () => ({
  ensureRoomForCohort: jest.fn().mockResolvedValue({ id: 'room-1' }),
}));

import { Op } from 'sequelize';
import { Cohort, Enrollment } from '../../models';
import { env } from '../../config/env';
import { alreadyWelcomed } from '../../services/welcome/sendPortalWelcome';
import { guardedSendMail, resolveEmailRecipient } from '../../services/emailService';
import { logCommunication } from '../../services/communicationLogService';
import { ensureRoomForCohort } from '../../services/communityRooms/cohortRoomService';
import {
  PAID_MEMBER_WELCOME_EVENT,
  runPaidMemberWelcomeSweep,
  welcomeOnePaidMember,
} from '../../services/welcome/paidMemberWelcomeService';

const findAllMembers = Enrollment.findAll as unknown as jest.Mock;
const findCohort = Cohort.findByPk as unknown as jest.Mock;
const welcomed = alreadyWelcomed as unknown as jest.Mock;
const send = guardedSendMail as unknown as jest.Mock;
const logged = logCommunication as unknown as jest.Mock;
const ensureRoom = ensureRoomForCohort as unknown as jest.Mock;

const NOV = {
  id: 'c-nov',
  name: 'Cohort - November 2026',
  cohort_type: 'accelerator',
  settings_json: { batch_month: '2026-11', schedule: { start_time: '18:30' } },
  start_date: '2026-11-12',
};

const member = (over: Record<string, unknown> = {}) => ({
  id: 'enr-1', email: 'dana@example.com', full_name: 'Dana Okonkwo', cohort_id: 'c-nov', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (env as any).paidMemberWelcomeEnabled = true;
  welcomed.mockResolvedValue(false);
  findCohort.mockResolvedValue(NOV);
  ensureRoom.mockResolvedValue({ id: 'room-1' });
  send.mockResolvedValue({ messageId: 'msg-1' });
  (resolveEmailRecipient as unknown as jest.Mock).mockImplementation(async (to: string, subject: string) => ({ to, subject }));
});

describe('the dedup key, which is the whole trap in this ticket', () => {
  it('asks only about the PAID event, never the sign-in-link set', async () => {
    await welcomeOnePaidMember(member(), true);
    expect(welcomed).toHaveBeenCalledWith('dana@example.com', [PAID_MEMBER_WELCOME_EVENT]);
    // A paying ex-Explorer already has open_house_welcome. Had the default set been used, this
    // person would be skipped and nothing would fail.
    expect(welcomed.mock.calls[0][1]).not.toContain('open_house_welcome');
    expect(welcomed.mock.calls[0][1]).not.toContain('portal_welcome');
  });

  it('skips somebody who already has a paid welcome, and sends nothing', async () => {
    welcomed.mockResolvedValue(true);
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.outcome).toBe('already-welcomed');
    expect(send).not.toHaveBeenCalled();
  });

  it('a failing idempotency check does NOT send', async () => {
    // Mailing somebody twice is worse than mailing them a sweep interval later, so an unknown
    // state is a refusal. Same stance as sendPortalWelcome.
    welcomed.mockRejectedValue(new Error('connection reset'));
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.outcome).toBe('failed');
    expect(row.error).toContain('idempotency_check_failed');
    expect(send).not.toHaveBeenCalled();
  });

  it('records the paid event so the NEXT run dedups, with the enrollment on it', async () => {
    await welcomeOnePaidMember(member(), true);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toMatchObject({
      status: 'sent',
      to_address: 'dana@example.com',
      metadata: { event: PAID_MEMBER_WELCOME_EVENT, enrollment_id: 'enr-1' },
    });
  });

  it('a FAILED send is recorded as failed, so the next sweep retries it', async () => {
    send.mockRejectedValue(Object.assign(new Error('relay refused'), { name: 'SMTPError' }));
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.outcome).toBe('failed');
    expect(logged.mock.calls[0][0]).toMatchObject({ status: 'failed' });
    expect(logged.mock.calls[0][0].error_message).toContain('relay refused');
  });

  it('the kill switch inside guardedSendMail is detected, not reported as sent', async () => {
    // The global switch returns a stub with an empty messageId rather than throwing.
    send.mockResolvedValue({ messageId: '' });
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.outcome).toBe('failed');
    expect(row.error).toBe('no_message_id');
    expect(logged.mock.calls[0][0]).toMatchObject({ status: 'failed' });
  });
});

describe('who it refuses to mail', () => {
  it('a member whose placement has not landed is left alone', async () => {
    // The batch room is privacy: 'cohort', and the email's whole subject is which batch they are
    // in. Mailing before placement would promise a room they cannot open.
    const row = await welcomeOnePaidMember(member({ cohort_id: null }), true);
    expect(row.outcome).toBe('not-in-a-batch');
    expect(send).not.toHaveBeenCalled();
  });

  it('a member in a cohort that is not a batch is left alone', async () => {
    findCohort.mockResolvedValue({ id: 'c-exp', name: 'Explorer - Prospects', cohort_type: 'explorer' });
    const row = await welcomeOnePaidMember(member({ cohort_id: 'c-exp' }), true);
    expect(row.outcome).toBe('not-in-a-batch');
    expect(send).not.toHaveBeenCalled();
  });

  it('a member with no email address is counted, not crashed on', async () => {
    for (const bad of [null, undefined, '']) {
      const row = await welcomeOnePaidMember(member({ email: bad }), true);
      expect(row.outcome).toBe('no-email');
    }
    expect(send).not.toHaveBeenCalled();
  });
});

describe('what the email is actually given', () => {
  // The November batch's first session depends on the Central date it is sent on, so every test
  // here pins the clock. Unpinned, these would change answer on 13 November 2026.
  const at = (iso: string) => jest.spyOn(Date, 'now').mockReturnValue(new Date(iso).getTime());
  afterEach(() => jest.restoreAllMocks());

  it('after 12 November: the real batch, the orientation from the convention, and the room URL', async () => {
    at('2026-11-13T18:00:00Z');
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.outcome).toBe('sent');
    expect(row.batchLabel).toBe('November 2026');
    expect(row.orientation).toBe('Monday, December 7, 2026 at 6:30 PM CT');
    const sent = send.mock.calls[0][0];
    expect(sent.subject).toContain('November 2026');
    expect(sent.html).toContain('/portal/rooms/room-1');
    expect(sent.text).toContain('Monday, December 7, 2026 at 6:30 PM CT');
  });

  it('on or before 12 November (Central): the November batch is told 12 November', async () => {
    // 05:00 UTC on the 13th is still the evening of the 12th in Central: the boundary is Central.
    at('2026-11-13T05:00:00Z');
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.orientation).toBe('Thursday, November 12, 2026 at 6:30 PM CT');
    expect(send.mock.calls[0][0].text).toContain('Your first live session is Thursday, November 12, 2026 at 6:30 PM CT.');
  });

  it('still sends when the batch has no room, dropping the room paragraph', async () => {
    ensureRoom.mockResolvedValue(null);
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.outcome).toBe('sent');
    expect(row.hasRoom).toBe(false);
    expect(send.mock.calls[0][0].text).not.toMatch(/own room in the portal/i);
  });

  it('a room lookup that throws does not cost the member their welcome', async () => {
    ensureRoom.mockRejectedValue(new Error('rooms down'));
    const row = await welcomeOnePaidMember(member(), true);
    expect(row.outcome).toBe('sent');
    expect(row.hasRoom).toBe(false);
  });

  it('honours the test sink, because this email carries no credential', async () => {
    // sendTrainingWelcome passes neverRedirect because its body holds a magic-link token. This
    // one holds only links that require a login, so it must behave like ordinary mail.
    await welcomeOnePaidMember(member(), true);
    expect((resolveEmailRecipient as unknown as jest.Mock).mock.calls[0][2]).toBeUndefined();
  });

  it('sends no List-Unsubscribe header, which would archive it out of the inbox', async () => {
    await welcomeOnePaidMember(member(), true);
    const headers = send.mock.calls[0][0].headers || {};
    expect(Object.keys(headers)).toEqual(['X-MC-Tags']);
  });
});

describe('the sweep around it', () => {
  it('selects paid, active, placed members with an address, oldest first', async () => {
    findAllMembers.mockResolvedValue([]);
    await runPaidMemberWelcomeSweep({ execute: false });

    const query = findAllMembers.mock.calls[0][0];
    const and: any[] = query.where[Op.and];
    expect(and).toContainEqual({ payment_status: 'paid' });
    expect(and).toContainEqual({ status: 'active' });
    expect(and).toContainEqual({ cohort_id: { [Op.ne]: null } });
    expect(query.order).toEqual([['enrolled_at', 'ASC'], ['id', 'ASC']]);
    expect(query.limit).toBe(50);
  });

  it('a dry run sends nothing and names everyone it would mail', async () => {
    findAllMembers.mockResolvedValue([member(), member({ id: 'enr-2', email: 'b@example.com' })]);
    const report = await runPaidMemberWelcomeSweep({ execute: false });
    expect(report.executed).toBe(false);
    expect(report.rows.map((r) => r.outcome)).toEqual(['would-send', 'would-send']);
    expect(report.rows[0].batchLabel).toBe('November 2026');
    expect(send).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it('REFUSES to execute while the switch is off, and says so', async () => {
    (env as any).paidMemberWelcomeEnabled = false;
    findAllMembers.mockResolvedValue([member()]);
    const report = await runPaidMemberWelcomeSweep({ execute: true });
    expect(report.executed).toBe(false);
    expect(report.rows[0].outcome).toBe('disabled');
    expect(findAllMembers).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('a dry run is allowed while the switch is off, because it sends nothing', async () => {
    (env as any).paidMemberWelcomeEnabled = false;
    findAllMembers.mockResolvedValue([member()]);
    const report = await runPaidMemberWelcomeSweep({ execute: false });
    expect(report.rows[0].outcome).toBe('would-send');
  });

  it('one bad member does not end the run', async () => {
    findAllMembers.mockResolvedValue([
      member({ id: 'enr-bad', email: 'bad@example.com' }),
      member({ id: 'enr-ok', email: 'ok@example.com' }),
    ]);
    send.mockRejectedValueOnce(new Error('relay refused')).mockResolvedValue({ messageId: 'msg-2' });

    const report = await runPaidMemberWelcomeSweep({ execute: true });

    expect(report.rows.map((r) => r.outcome)).toEqual(['failed', 'sent']);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('caps the batch so a backlog cannot empty into the provider at once', async () => {
    findAllMembers.mockResolvedValue([]);
    await runPaidMemberWelcomeSweep({ execute: false, limit: 5 });
    expect(findAllMembers.mock.calls[0][0].limit).toBe(5);
    findAllMembers.mockClear();
    await runPaidMemberWelcomeSweep({ execute: false, limit: 0 });
    expect(findAllMembers.mock.calls[0][0].limit).toBe(50);
  });

  it('is idempotent across runs: the second sweep finds them welcomed and sends nothing', async () => {
    findAllMembers.mockResolvedValue([member()]);
    await runPaidMemberWelcomeSweep({ execute: true });
    expect(send).toHaveBeenCalledTimes(1);

    welcomed.mockResolvedValue(true); // the row the first run wrote
    send.mockClear();
    const second = await runPaidMemberWelcomeSweep({ execute: true });
    expect(second.rows[0].outcome).toBe('already-welcomed');
    expect(send).not.toHaveBeenCalled();
  });
});
