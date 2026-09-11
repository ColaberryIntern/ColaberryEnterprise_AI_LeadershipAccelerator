/**
 * Reply-by-email. A reply used to create a CommunityNotification row and stop
 * there — in-app bell only — so a student not already in the portal never
 * learned anyone had answered. Across 74 visible posts on production, exactly
 * one had ever received a reply.
 *
 * The risky parts of sending mail on someone's behalf are all here: does the
 * opt-out hold, does a missing column silently mute people, and can a failure
 * take the reply down with it.
 */
jest.mock('../../../models/index', () => ({}));

const mockMemberFindByPk = jest.fn();
const mockEnrollmentFindByPk = jest.fn();
const mockSend = jest.fn();

jest.mock('../../../models/CommunityMember', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockMemberFindByPk(...a) },
}));
jest.mock('../../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockEnrollmentFindByPk(...a) },
}));
jest.mock('../../emailService', () => ({
  sendCommunityReplyEmail: (...a: any[]) => mockSend(...a),
}));

import { notifyReplyByEmail, wantsReplyEmail, previewOf } from '../replyNotificationService';

const INPUT = {
  commentId: 'c-1',
  recipientMemberId: 'm-1',
  actorDisplayName: 'Marcus Lee',
  commentBody: 'How long did the triage skill take you to get right?',
  postId: 'p-1',
  onOwnPost: true,
};

const enrollmentWith = (prefs: Record<string, unknown> | null) => ({
  id: 'e-1',
  email: 'hellen@example.com',
  intake_data_json: prefs ? { preferences: prefs } : null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberFindByPk.mockResolvedValue({ id: 'm-1', display_name: 'Hellen Muhonja', enrollment_id: 'e-1' });
  mockEnrollmentFindByPk.mockResolvedValue(enrollmentWith({ reply_notifications: true }));
  mockSend.mockResolvedValue({ sent: true, messageId: 'msg-1' });
});

describe('wantsReplyEmail', () => {
  it('treats an unset preference as opted IN', () => {
    // No migration, no backfill. If "unset" read as "off", every existing
    // student would silently stop hearing about replies — the exact failure
    // this feature exists to fix. Matches how portalSettingsService already
    // resolves every other boolean preference.
    expect(wantsReplyEmail({})).toBe(true);
    expect(wantsReplyEmail(null)).toBe(true);
    expect(wantsReplyEmail(undefined)).toBe(true);
  });

  it('honours an explicit opt-out, and only an explicit one', () => {
    expect(wantsReplyEmail({ reply_notifications: false })).toBe(false);
    expect(wantsReplyEmail({ reply_notifications: true })).toBe(true);
  });

  it('ignores the other preferences — turning off the weekly digest is not this', () => {
    expect(wantsReplyEmail({ email_updates: false, weekly_digest: false })).toBe(true);
  });
});

describe('previewOf', () => {
  it('collapses whitespace so an inbox preview reads as one line', () => {
    expect(previewOf('line one\n\n  line two')).toBe('line one line two');
  });

  it('truncates on a word boundary and marks the elision', () => {
    const s = previewOf('word '.repeat(80), 40);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(41);
  });

  it('returns an empty string for an empty body', () => {
    expect(previewOf('')).toBe('');
    expect(previewOf(null)).toBe('');
  });
});

describe('notifyReplyByEmail', () => {
  it('sends to the person who was replied to, with the reply as the preview', async () => {
    const r = await notifyReplyByEmail(INPUT);

    expect(r).toEqual({ sent: true, reason: 'sent' });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toBe('hellen@example.com');
    expect(arg.recipientName).toBe('Hellen Muhonja');
    expect(arg.actorName).toBe('Marcus Lee');
    expect(arg.preview).toContain('triage skill');
    expect(arg.eventId).toBe('c-1');       // idempotency key = the comment
  });

  it('sends nothing when the student opted out in Settings', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(enrollmentWith({ reply_notifications: false }));

    const r = await notifyReplyByEmail(INPUT);

    expect(r).toEqual({ sent: false, reason: 'opted_out' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('still sends when the preference has never been set', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(enrollmentWith(null));
    await expect(notifyReplyByEmail(INPUT)).resolves.toEqual({ sent: true, reason: 'sent' });
  });

  it('reports rather than throws when there is no recipient or no address', async () => {
    mockMemberFindByPk.mockResolvedValue(null);
    await expect(notifyReplyByEmail(INPUT)).resolves.toEqual({ sent: false, reason: 'no_recipient' });

    mockMemberFindByPk.mockResolvedValue({ id: 'm-1', display_name: 'H', enrollment_id: 'e-1' });
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e-1', email: null });
    await expect(notifyReplyByEmail(INPUT)).resolves.toEqual({ sent: false, reason: 'no_email' });
  });

  it('NEVER throws — a mail outage must not take the reply down with it', async () => {
    mockSend.mockRejectedValue(new Error('Mandrill 503'));
    await expect(notifyReplyByEmail(INPUT)).resolves.toEqual({ sent: false, reason: 'error' });

    mockMemberFindByPk.mockRejectedValue(new Error('connection terminated'));
    await expect(notifyReplyByEmail(INPUT)).resolves.toEqual({ sent: false, reason: 'error' });
  });

  it('labels a reply-to-a-comment differently from a reply-to-a-post', async () => {
    await notifyReplyByEmail({ ...INPUT, onOwnPost: false });
    expect(mockSend.mock.calls[0][0].onOwnPost).toBe(false);
  });
});
