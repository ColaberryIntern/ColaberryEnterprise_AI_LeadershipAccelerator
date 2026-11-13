/**
 * Who hears about a Hire interview (kit §4.2 notifications), with every boundary mocked at its
 * module: the database, the mailer, the send ledger, the lead ingest and the room provider.
 * The .ics and the email copy run for real, so the privacy rules are checked on real output.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../emailService', () => ({ guardedSendMail: jest.fn(), resolveEmailRecipient: jest.fn() }));
jest.mock('../../email/idempotentSend', () => ({ sendOnce: jest.fn() }));
jest.mock('../../leadIngestionService', () => ({ handleIngest: jest.fn() }));
jest.mock('../../communityRooms/meetingProvider', () => ({ getMeetingProvider: jest.fn() }));
jest.mock('../../caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
jest.mock('../hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));

import { sequelize } from '../../../config/database';
import { guardedSendMail, resolveEmailRecipient } from '../../emailService';
import { sendOnce } from '../../email/idempotentSend';
import { handleIngest } from '../../leadIngestionService';
import { getMeetingProvider } from '../../communityRooms/meetingProvider';
import { loadHireIndex } from '../hireTalentIndex';
import {
  notifyInterviewConfirmed, notifyInterviewDeclined, notifyInterviewProposed, notifyInterviewRequested,
} from '../hireInterviewNotify';
import { buildInterviewIcs, icsEscape, icsFold } from '../hireInterviewIcs';
import { acceptToken } from '../hireInterviewAccept';

const m = (f: unknown) => f as jest.Mock;
const ID = '22222222-2222-4222-8222-222222222222';
const START = '2026-11-16T15:00:00.000Z';
const ROW = {
  id: ID, enrollment_id: 'e1', talent_slug: 'ann-lee', format: 'walkthrough', case_study_slug: 'case-a',
  starts_at: START, minutes: 45, status: 'requested', employer_name: 'Jane Roe', employer_email: 'jane@acme.com',
  employer_company: 'Acme', employer_role: 'Head of Data', message: 'We need an FDE',
  extra_interviewers: ['bo@acme.com', 'cy@acme.com'], record_requested: true, room_url: null,
  candidate_name: 'Ann Lee', candidate_email: 'ann@student.test', candidate_tz: 'America/New_York',
};

let row: Record<string, unknown>;
const createMeeting = jest.fn();
const sent = () => m(guardedSendMail).mock.calls.map(([o]) => o as Record<string, any>);

beforeEach(() => {
  jest.clearAllMocks();
  row = { ...ROW };
  m(sequelize.query).mockImplementation(async (sql: string, opts: { bind: unknown[] }) => {
    if (/FROM hire_interviews i/.test(sql)) return [[row]];
    if (/UPDATE hire_interviews SET room_url/.test(sql)) { if (!row.room_url) row.room_url = opts.bind[1]; return [[]]; }
    if (/SELECT room_url/.test(sql)) return [[{ room_url: row.room_url }]];
    throw new Error('unexpected SQL: ' + sql);
  });
  m(loadHireIndex).mockResolvedValue([{ cases: [{ slug: 'case-a', title: 'Churn model' }] }]);
  m(resolveEmailRecipient).mockImplementation(async (to: string, subject: string) => ({ to, subject }));
  m(guardedSendMail).mockResolvedValue({ messageId: 'mid' });
  // The real ledger is unit-tested on its own; here it simply runs the send.
  m(sendOnce).mockImplementation(async (_id: unknown, send: () => Promise<{ ok: boolean }>) => {
    const r = await send();
    return r.ok ? { outcome: 'sent' } : { outcome: 'failed', error: 'x', errorClass: 'SendBlocked' };
  });
  m(handleIngest).mockResolvedValue({ success: true });
  createMeeting.mockResolvedValue({ providerEventId: 'z1', joinUrl: 'https://zoom.us/j/123' });
  m(getMeetingProvider).mockReturnValue({ createMeeting });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('a new request', () => {
  it('emails the candidate alone, in their zone, without the employer\'s address, and files the employer as a lead', async () => {
    await notifyInterviewRequested(ID, { headers: { 'user-agent': 'x' }, remoteIp: '1.2.3.4' });
    expect(sent()).toHaveLength(1);
    const mail = sent()[0];
    expect(mail.to).toBe('ann@student.test');
    expect(mail.subject).toBe('Jane Roe from Acme wants to interview you');
    expect(mail.text).toContain('Monday, November 16 at 10:00 AM ET');
    expect(mail.text).toContain('walking through "Churn model"');
    expect(mail.text).toContain('/portal/portfolio?tab=hire');
    expect(mail.text + mail.html).not.toMatch(/acme\.com/);
    expect(mail.text).not.toMatch(/—/);
    expect(m(sendOnce).mock.calls[0][0]).toEqual({ recipient: 'ann@student.test', subject: mail.subject, businessEventId: `hire-interview-${ID}-requested-${START}` });
    const ingest = m(handleIngest).mock.calls[0][0];
    expect(ingest).toMatchObject({ sourceSlug: 'hire-refactored', entrySlug: 'interview_request', remoteIp: '1.2.3.4' });
    expect(ingest.rawBody).toMatchObject({ email: 'jane@acme.com', interview_id: ID, talent_slug: 'ann-lee' });
    expect(createMeeting).not.toHaveBeenCalled();
  });

  it('still tells the candidate when the lead ingest is refused', async () => {
    m(handleIngest).mockResolvedValue({ success: false, httpStatus: 400 });
    await notifyInterviewRequested(ID);
    expect(sent()).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('hire_interview_lead_failed'));
  });

  it('sends the invite instead when the booking confirmed itself (auto-confirm)', async () => {
    row.status = 'confirmed';
    await notifyInterviewRequested(ID);
    expect(sent().map((s) => s.to)).toEqual(['jane@acme.com', 'bo@acme.com', 'cy@acme.com', 'ann@student.test']);
    expect(sent()[3].text).toContain('confirm automatically');
  });
});

describe('a confirmation', () => {
  it('creates the room once, then sends one message per person, each with the calendar file and no one else\'s address', async () => {
    row.status = 'confirmed';
    await notifyInterviewConfirmed(ID);
    expect(createMeeting).toHaveBeenCalledTimes(1);
    expect(createMeeting.mock.calls[0][0]).toMatchObject({ requestId: `hire-interview-${ID}-${START}` });
    expect(m(sequelize.query).mock.calls.find(([s]) => /SET room_url/.test(s))![0]).toMatch(/room_url IS NULL/);
    const all = sent();
    expect(all).toHaveLength(4);
    for (const s of all) {
      expect(typeof s.to).toBe('string');
      expect(s.cc).toBeUndefined();
      expect(s.icalEvent.method).toBe('PUBLISH');
      expect(s.icalEvent.content).not.toMatch(/mailto:|ORGANIZER|ATTENDEE|acme\.com|student\.test/);
      expect(s.text).toContain('https://zoom.us/j/123');
    }
    expect(all[0].text).toContain('Ann confirmed your interview');
    expect(all[0].text).toContain('Monday, November 16 at 9:00 AM CT'); // employers read Central
    expect(all[1].text).toMatch(/^Hi,\n\nJane Roe from Acme invited you/);
    expect(all[3].text + all[3].html).not.toMatch(/acme\.com/);

    await notifyInterviewConfirmed(ID); // a second confirm reuses the stored room
    expect(createMeeting).toHaveBeenCalledTimes(1);
  });

  it('still sends the invite when the room provider fails, saying the link follows', async () => {
    row.status = 'confirmed';
    createMeeting.mockRejectedValue(Object.assign(new Error('zoom 503'), { name: 'UpstreamUnavailable' }));
    await notifyInterviewConfirmed(ID);
    expect(sent()).toHaveLength(4);
    expect(sent()[0].icalEvent.content).toContain('LOCATION:Refactored room (the link follows from the Colaberry team)');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('hire_interview_room_failed'));
  });

  it('sends nothing for an interview that is not confirmed, or does not exist', async () => {
    await notifyInterviewConfirmed(ID);
    m(sequelize.query).mockResolvedValue([[]]);
    await notifyInterviewConfirmed(ID);
    expect(sent()).toHaveLength(0);
  });
});

describe('decline and propose', () => {
  it('a decline tells only the employer, with a way to pick another time', async () => {
    row.status = 'declined';
    await notifyInterviewDeclined(ID);
    expect(sent().map((s) => s.to)).toEqual(['jane@acme.com']);
    expect(sent()[0].text).toContain('https://hire.refactored.ai/talent/ann-lee/schedule/');
    expect(sent()[0].text).toContain('https://hire.refactored.ai/intro/?talent=ann-lee');
    expect(sent()[0].text).not.toMatch(/student\.test|reply here/);
    expect(sent()[0].text).not.toMatch(/added a note/);
  });

  it('a decline note reaches the employer, HTML-escaped in the html body', async () => {
    row.status = 'declined';
    row.decline_reason = 'Away until the 30th <b>sorry</b>';
    await notifyInterviewDeclined(ID);
    expect(sent()[0].text).toContain('added a note: "Away until the 30th <b>sorry</b>"');
    expect(sent()[0].html).toContain('Away until the 30th &lt;b&gt;sorry&lt;/b&gt;');
    expect(sent()[0].html).not.toContain('<b>sorry');
  });

  it('a suggested time sends the employer a link that carries a valid accept token', async () => {
    row.status = 'rescheduled';
    await notifyInterviewProposed(ID);
    const link = /https:\/\/hire\.refactored\.ai\/talent\/ann-lee\/schedule\/\?accept=[^\s]+/.exec(sent()[0].text)![0];
    const u = new URL(link);
    expect(u.searchParams.get('accept')).toBe(ID);
    expect(u.searchParams.get('t')).toBe(acceptToken(ID, START));
  });
});

describe('the calendar file', () => {
  it('escapes text and folds long lines at 75 octets without splitting a character', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const folded = icsFold('DESCRIPTION:' + 'é'.repeat(60));
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n ').join('')).toBe('DESCRIPTION:' + 'é'.repeat(60));
  });

  it('is a CRLF VCALENDAR with a stable UID and the right times', () => {
    const ics = buildInterviewIcs({
      interviewId: ID, start: new Date(START), minutes: 45, summary: 'S', description: 'D',
      roomUrl: 'https://zoom.us/j/1', now: new Date('2026-11-12T00:00:00Z'),
    });
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain(`UID:hire-interview-${ID}@hire.refactored.ai\r\n`);
    expect(ics).toContain('DTSTART:20261116T150000Z\r\nDTEND:20261116T154500Z');
    expect(ics).toContain('URL:https://zoom.us/j/1');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
