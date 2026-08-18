/**
 * sendSessionReminder() must leave a queryable audit row.
 *
 * The 2026-08-13 incident (a reminder headed "Tomorrow" for a class that
 * evening, sent to 55 active enrollments) could not be investigated by query:
 * `communication_logs` had zero rows for it, because this was the one outbound
 * email path in the codebase that never logged. Who received it, and what day
 * word each copy carried, had to be reconstructed from Docker container
 * timestamps. These tests hold that gap closed.
 *
 * The delivery-vs-audit precedence tests matter as much as the happy path:
 * logCommunication() rethrows by contract, and it now runs inside the send path.
 * No SMTP or DB I/O — nodemailer and the log service are mocked.
 */

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-abc', accepted: ['s@x.com'], rejected: [] });
const logCommunicationMock = jest.fn().mockResolvedValue({});
const getTestOverridesMock = jest.fn().mockResolvedValue({ enabled: false, email: null });

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: sendMailMock })) },
}));
jest.mock('../../config/env', () => ({
  env: {
    mandrillApiKey: 'test-key',
    emailFrom: 'info@colaberry.com',
    smtpUser: undefined, smtpPass: undefined, smtpHost: undefined, smtpPort: undefined,
  },
}));
jest.mock('../../services/settingsService', () => ({
  getTestOverrides: (...a: any[]) => getTestOverridesMock(...a),
  getSetting: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => s }));
jest.mock('../../services/communicationLogService', () => ({
  logCommunication: (...a: any[]) => logCommunicationMock(...a),
}));

import { sendSessionReminder } from '../../services/emailService';

// Session 7, the class from the incident.
const session7 = {
  to: 'student@example.com',
  fullName: 'Ada Lovelace',
  sessionTitle: 'Week 3 · Build Day — Claude API + Workflow Assistant',
  sessionNumber: 7,
  sessionDate: '2026-08-13',
  startTime: '18:30:00',
  meetingLink: 'https://meet.example/abc',
  materialsJson: null,
  isOneHour: false,
};

function loggedRow(): any {
  return logCommunicationMock.mock.calls[0][0];
}

describe('sendSessionReminder audit logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({ messageId: 'msg-abc', accepted: ['s@x.com'], rejected: [] });
    getTestOverridesMock.mockResolvedValue({ enabled: false, email: null });
  });

  it('writes one row per send, with the recipient and subject that actually went out', async () => {
    await sendSessionReminder(session7 as any);

    expect(logCommunicationMock).toHaveBeenCalledTimes(1);
    const row = loggedRow();
    expect(row.channel).toBe('email');
    expect(row.direction).toBe('outbound');
    expect(row.status).toBe('sent');
    expect(row.to_address).toBe('student@example.com');
    expect(row.from_address).toBe('info@colaberry.com');
    expect(row.provider_message_id).toBe('msg-abc');
    // The exact query that returned nothing during the incident must now hit.
    expect(row.subject).toContain('Session 7');
  });

  it('records the day word that was rendered, so the incident is queryable', async () => {
    // Same instant the bad email went out: 2026-08-13 09:30 Central.
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-13T14:30:00Z'));
    try {
      await sendSessionReminder(session7 as any);
    } finally {
      (Date.now as any).mockRestore();
    }

    const row = loggedRow();
    expect(row.metadata.urgency_label).toBe('Today');
    expect(row.metadata.reminder_type).toBe('24h');
    expect(row.metadata.session_number).toBe(7);
    expect(row.metadata.session_date).toBe('2026-08-13');
    expect(row.subject).toContain('Today');
  });

  it('distinguishes a live send from a test-mode redirect', async () => {
    await sendSessionReminder(session7 as any);
    expect(loggedRow().delivery_mode).toBe('live');

    jest.clearAllMocks();
    getTestOverridesMock.mockResolvedValue({ enabled: true, email: 'qa@colaberry.com' });
    await sendSessionReminder(session7 as any);

    const row = loggedRow();
    // The difference between "55 students were mailed" and "55 copies went to
    // one QA inbox" — invisible without this field.
    expect(row.delivery_mode).toBe('test_redirect');
    expect(row.to_address).toBe('qa@colaberry.com');
    expect(row.metadata.intended_to).toBe('student@example.com');
  });

  it('tags the 1-hour reminder distinctly from the 24-hour one', async () => {
    await sendSessionReminder({ ...session7, isOneHour: true } as any);
    const row = loggedRow();
    expect(row.metadata.reminder_type).toBe('1h');
    expect(row.metadata.urgency_label).toBe('Starting in 1 Hour');
  });

  it('logs a failed send as failed, with the error, and still rethrows', async () => {
    sendMailMock.mockRejectedValue(new Error('smtp 421 service unavailable'));

    await expect(sendSessionReminder(session7 as any)).rejects.toThrow('smtp 421');

    const row = loggedRow();
    expect(row.status).toBe('failed');
    expect(row.error_message).toContain('smtp 421');
    expect(row.provider_message_id).toBeNull();
  });

  it('never lets an audit-log failure break a delivered email', async () => {
    // logCommunication rethrows by contract. A DB hiccup must not turn a
    // delivered reminder into a thrown one — the scheduler would then log it as
    // a send failure that never happened.
    logCommunicationMock.mockRejectedValue(new Error('db connection reset'));

    await expect(sendSessionReminder(session7 as any)).resolves.toBeUndefined();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('does not swallow the send error when the audit log also fails', async () => {
    sendMailMock.mockRejectedValue(new Error('smtp 421 service unavailable'));
    logCommunicationMock.mockRejectedValue(new Error('db connection reset'));

    // The real failure must still surface, not be masked by the logging failure.
    await expect(sendSessionReminder(session7 as any)).rejects.toThrow('smtp 421');
  });
});
