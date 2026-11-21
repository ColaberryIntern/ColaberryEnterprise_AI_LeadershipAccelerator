const mockUpdate = jest.fn();
const mockFindAll = jest.fn();
const mockSend = jest.fn();
const mockCall = jest.fn();
const mockVoice = jest.fn();
const mockCallable = jest.fn();

jest.mock('../../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai' } }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: { update: (...a: any[]) => mockUpdate(...a), findAll: (...a: any[]) => mockFindAll(...a) },
}));
jest.mock('../enterpriseIntakeService', () => ({
  callable: (i: any) => mockCallable(i),
  voiceConfigured: () => mockVoice(),
  requestEnterpriseIntakeCall: (i: any) => mockCall(i),
}));
jest.mock('../enterpriseIntakeTime', () => ({ meetingWhen: () => 'Monday, November 23 at 9:00 AM Central' }));
jest.mock('../enterpriseIntakeEmails', () => ({ sendInterviewReminder: (d: any) => mockSend(d) }));

import { MAX_REMINDER_ATTEMPTS, interviewLink, remindOne, syncInterviewReminders } from '../enterpriseIntakeReminders';

const NOW = new Date('2026-11-24T15:00:00Z');
const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function intake(over: Record<string, any> = {}): any {
  return {
    id: ID, email: 'pat@acme.com', full_name: 'Pat Doe', company: 'Acme',
    interview_mode: 'later', interview_scheduled_for: new Date('2026-11-24T14:55:00Z'), interviewed_at: null,
    interview_reminder_sent_at: null, interview_reminder_attempts: 0, interview_via_pref: 'chat',
    meeting_start: new Date('2026-11-25T15:00:00Z'), signed_at: null, lost_at: null, ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue([1]);
  mockSend.mockResolvedValue(undefined);
  mockVoice.mockReturnValue(false);
  mockCallable.mockReturnValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('remindOne', () => {
  it('not due before the time, when interviewed, when now-mode, or closed', async () => {
    expect(await remindOne(intake({ interview_scheduled_for: new Date('2026-11-24T16:00:00Z') }), NOW)).toBe('not_due');
    expect(await remindOne(intake({ interviewed_at: NOW }), NOW)).toBe('not_due');
    expect(await remindOne(intake({ interview_mode: 'now' }), NOW)).toBe('not_due');
    expect(await remindOne(intake({ lost_at: NOW }), NOW)).toBe('not_due');
    expect(await remindOne(intake({ interview_reminder_sent_at: NOW }), NOW)).toBe('not_due');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('due: claims, then emails the interview link with the meeting time, once', async () => {
    expect(await remindOne(intake(), NOW)).toBe('sent');
    expect(mockUpdate).toHaveBeenCalledWith(
      { interview_reminder_sent_at: NOW, interview_reminder_attempts: 1 },
      { where: { id: ID, interview_reminder_sent_at: null, interview_reminder_attempts: 0 } },
    );
    expect(mockSend).toHaveBeenCalledWith({
      to: 'pat@acme.com', fullName: 'Pat Doe', company: 'Acme',
      link: `https://enterprise.colaberry.ai/demo-pilot?intake=${ID}`,
      meetingWhen: 'Monday, November 23 at 9:00 AM Central',
    });
  });

  it('a second sweep whose claim loses sends nothing', async () => {
    mockUpdate.mockResolvedValueOnce([0]);
    expect(await remindOne(intake(), NOW)).toBe('claimed_elsewhere');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a failed send releases the claim and counts the attempt', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('smtp down'), { error_class: 'UpstreamUnavailable' }));
    expect(await remindOne(intake(), NOW)).toBe('failed');
    expect(mockUpdate).toHaveBeenLastCalledWith({ interview_reminder_sent_at: null }, { where: { id: ID } });
    const logs = (console.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(logs.some((l) => l.includes('enterprise_interview_reminder_failed'))).toBe(true);
  });

  it(`the ${MAX_REMINDER_ATTEMPTS}rd failure is dead-lettered and never tried again`, async () => {
    mockSend.mockRejectedValue(new Error('smtp down'));
    await remindOne(intake({ interview_reminder_attempts: MAX_REMINDER_ATTEMPTS - 1 }), NOW);
    const logs = (console.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(logs.some((l) => l.includes('enterprise_intake_dead_letter'))).toBe(true);
    mockSend.mockClear();
    expect(await remindOne(intake({ interview_reminder_attempts: MAX_REMINDER_ATTEMPTS }), NOW)).toBe('not_due');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a chosen call is placed when voice is configured, else the email goes', async () => {
    mockVoice.mockReturnValue(true);
    mockCall.mockResolvedValue({ status: 'calling', callId: 'c1' });
    expect(await remindOne(intake({ interview_via_pref: 'call' }), NOW)).toBe('called');
    expect(mockSend).not.toHaveBeenCalled();
    mockCall.mockResolvedValue({ status: 'failed', reason: 'x' });
    expect(await remindOne(intake({ interview_via_pref: 'call' }), NOW)).toBe('sent');
    mockVoice.mockReturnValue(false);
    mockCall.mockClear();
    expect(await remindOne(intake({ interview_via_pref: 'call' }), NOW)).toBe('sent');
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('syncInterviewReminders', () => {
  it('queries only due, open, uncapped rows and counts results', async () => {
    mockFindAll.mockResolvedValue([intake(), intake({ id: 'b' })]);
    mockSend.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x'));
    expect(await syncInterviewReminders(20, NOW)).toEqual({ sent: 1, failed: 1 });
    const where = mockFindAll.mock.calls[0][0].where;
    expect(where).toMatchObject({ interview_mode: 'later', interviewed_at: null, interview_reminder_sent_at: null, signed_at: null, lost_at: null });
  });

  it('builds the link from the frontend url', () => {
    expect(interviewLink('x')).toBe('https://enterprise.colaberry.ai/demo-pilot?intake=x');
  });
});
