jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../../emailService', () => ({ guardedSendMail: jest.fn(), resolveEmailRecipient: jest.fn() }));
jest.mock('../../email/idempotentSend', () => ({ sendOnce: jest.fn() }));
jest.mock('../../settingsService', () => ({ getSetting: async () => null }));

import { bookingReplyEmail, candidateFirstName, FROM_NAME } from '../bookingReplyEmail';
import { bookingLink } from '../bookingReply';
import { hashBookingToken, newBookingToken, TOKEN_TTL_MS } from '../bookingToken';

/** CP8.1b (kit F4 step 2): the booking-link reply's copy, and the token it carries. */
// en dash, em dash (built from code points so this file holds neither), the banned word, and any price or fee
const BANNED = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\bfree\\b|\\bfee\\b|\\$|\\bprice\\b`, 'i');
const LINK = 'https://hire.refactored.ai/book/?t=abc';

describe('bookingReplyEmail', () => {
  it('greets the contact, names the role and company, carries the one link and how long it works', () => {
    const m = bookingReplyEmail({ contactName: 'Pat Doe', candidateName: 'Ann Marie Lee', company: 'Acme', position: 'Data Analyst', link: LINK });
    expect(m.subject).toBe('Booking your interview: pick a time'); // fixed: part of the send-once key, no name in it
    expect(m.text).toMatch(/^Hi Pat,/);
    expect(m.text).toContain('Thank you for reaching out to Ann about the Data Analyst role at Acme.');
    expect(m.text.split(LINK)).toHaveLength(2); // exactly one link
    expect(m.text).toContain('Central time');
    expect(m.text).toContain('14 days');
    expect(m.text).toMatch(/Ali M\.\nRefactored\.ai, on behalf of Ann$/);
    expect(FROM_NAME).toBe('Ali M. via Refactored.ai');
  });
  it('never a dash, the banned word, a fee or a price; no personal contact detail of the learner', () => {
    const m = bookingReplyEmail({ contactName: 'Pat', candidateName: 'Ann Lee', company: 'Acme', position: 'Analyst', link: LINK });
    expect(`${m.subject}\n${m.text}`).not.toMatch(BANNED);
    expect(m.text).not.toMatch(/@/);
  });
  it('missing facts read naturally instead of leaving gaps', () => {
    const m = bookingReplyEmail({ contactName: null, candidateName: null, company: null, position: '  ', link: LINK });
    expect(m.text).toMatch(/^Hi,/);
    expect(m.text).toContain('Thank you for reaching out to the candidate about the role.');
    expect(candidateFirstName('  ')).toBe('the candidate');
  });
});

describe('booking token and link', () => {
  it('a fresh random token per call, only its hash is stored, 14 days', () => {
    const now = new Date('2026-11-21T18:00:00Z');
    const a = newBookingToken(now);
    const b = newBookingToken(now);
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toBe(hashBookingToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.expiresAt.getTime() - now.getTime()).toBe(TOKEN_TTL_MS);
  });
  it('the link is the hire site booking page with the token in the query string (no nginx change)', () => {
    expect(bookingLink('a+b/c')).toBe('https://hire.refactored.ai/book/?t=a%2Bb%2Fc');
  });
});
