import { EMPLOYER_SUBJECT, LEARNER_SUBJECT, RECORDING_LINE, employerBookedEmail, learnerBookedEmail, whenLine } from '../bookingConfirmEmail';

/** CP8.2b: the booking confirmation copy. PURE. */
const F = { candidateName: 'Ann Marie Lee', company: 'Acme', position: 'Data Analyst', startsAt: new Date('2026-11-23T15:00:00Z'), minutes: 30, bookerTz: 'America/New_York' };
const PAGE = 'https://hire.refactored.ai/room/?i=iv-1&e=1&t=x';
const DASH_OR_FREE = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\bfree\\b`, 'i');

describe('booking confirmation copy', () => {
  it('learner: first name, the role, Central time, the room page and the recording line; fixed subject', () => {
    const m = learnerBookedEmail(F, 'https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    expect(m.subject).toBe(LEARNER_SUBJECT);
    expect(m.text).toContain('Hi Ann,');
    expect(m.text).toContain('Acme booked your interview for the Data Analyst role at Acme.');
    expect(m.text).toContain('When: Mon, Nov 23, 9:00 AM CST, 30 minutes');
    expect(m.text).toContain('https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    expect(m.text).toContain(RECORDING_LINE);
  });
  it("employer: Central plus the booker's own zone, the room page, how long the link works; no learner surname or address", () => {
    const m = employerBookedEmail(F, PAGE);
    expect(m.subject).toBe(EMPLOYER_SUBJECT);
    expect(m.text).toContain('When: Mon, Nov 23, 9:00 AM CST (Mon, Nov 23, 10:00 AM EST), 30 minutes');
    expect(m.text).toContain(PAGE);
    expect(m.text).toContain('two hours after the interview ends');
    expect(m.text).not.toMatch(/Lee|@/);
  });
  it('no zone repeat when the booker is in Central; plain fallbacks when facts are missing', () => {
    expect(whenLine({ ...F, bookerTz: 'America/Chicago' })).toBe('Mon, Nov 23, 9:00 AM CST, 30 minutes');
    const m = learnerBookedEmail({ ...F, company: null, position: null, candidateName: null }, PAGE);
    expect(m.text.startsWith('Hi,\n')).toBe(true);
    expect(m.text).toContain('An employer booked your interview for the role.');
  });
  it('no en or em dash and never the word "free" in any subject or body', () => {
    for (const m of [learnerBookedEmail(F, PAGE), employerBookedEmail(F, PAGE)]) expect(`${m.subject}\n${m.text}`).not.toMatch(DASH_OR_FREE);
  });
});
