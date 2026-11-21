import { BROKEN_AFTER_MS, HEALTH_LABEL, inboxHealth, normalizeJobSearchAddress, QUIET_AFTER_MS, type InboxFacts } from '../inboxHealth';

/** CP6.1 (kit F2): the job-search inbox's address rules and health, thresholds exact to the second. */
const NOW = new Date('2026-11-21T18:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const base: InboxFacts = { address: 'ann.lee.careers@gmail.com', verifiedAt: ago(10 * 86_400_000), lastReceivedAt: ago(3_600_000), lastTestAt: ago(86_400_000), lastTestMs: 42_000 };

describe('normalizeJobSearchAddress', () => {
  it('accepts Gmail, trimmed and lowercased; googlemail.com is the same mailbox', () => {
    expect(normalizeJobSearchAddress('  Ann.Lee.Careers@Gmail.com ')).toEqual({ ok: true, address: 'ann.lee.careers@gmail.com' });
    expect(normalizeJobSearchAddress('ann.lee.careers@googlemail.com')).toEqual({ ok: true, address: 'ann.lee.careers@gmail.com' });
    expect(normalizeJobSearchAddress('ann+jobs@gmail.com')).toEqual({ ok: true, address: 'ann+jobs@gmail.com' });
  });
  it('refuses anything that is not a Gmail address, and malformed ones', () => {
    expect(normalizeJobSearchAddress('ann@yahoo.com')).toEqual({ ok: false, reason: 'not_gmail' });
    expect(normalizeJobSearchAddress('ann@gmail.co')).toEqual({ ok: false, reason: 'not_gmail' });
    expect(normalizeJobSearchAddress('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeJobSearchAddress('ann@@gmail.com')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizeJobSearchAddress('.ann@gmail.com')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizeJobSearchAddress('an..n@gmail.com')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizeJobSearchAddress('@gmail.com')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('inboxHealth', () => {
  it('is set up only once there is an address AND forwarding is verified', () => {
    expect(inboxHealth({ ...base, address: null }, NOW)).toBe('setup');
    expect(inboxHealth({ ...base, verifiedAt: null }, NOW)).toBe('setup');
    expect(inboxHealth(base, NOW)).toBe('healthy');
  });
  it('Quiet after 3 days with no mail: 3 days exactly is still healthy, 3 days + 1 minute is quiet', () => {
    expect(inboxHealth({ ...base, lastReceivedAt: ago(QUIET_AFTER_MS) }, NOW)).toBe('healthy');
    expect(inboxHealth({ ...base, lastReceivedAt: ago(QUIET_AFTER_MS + 60_000) }, NOW)).toBe('quiet');
  });
  it('Forwarding broken when the latest test has not arrived within 10 minutes (10 min + 1 s)', () => {
    expect(inboxHealth({ ...base, lastTestAt: ago(BROKEN_AFTER_MS), lastTestMs: null }, NOW)).toBe('healthy');
    expect(inboxHealth({ ...base, lastTestAt: ago(BROKEN_AFTER_MS + 1000), lastTestMs: null }, NOW)).toBe('broken');
  });
  it('broken outranks quiet; an arrived test is never broken', () => {
    expect(inboxHealth({ ...base, lastReceivedAt: ago(5 * 86_400_000), lastTestAt: ago(BROKEN_AFTER_MS + 1000), lastTestMs: null }, NOW)).toBe('broken');
    expect(inboxHealth({ ...base, lastTestAt: ago(BROKEN_AFTER_MS * 6), lastTestMs: 30_000 }, NOW)).toBe('healthy');
  });
  it('verified but never tested and nothing received yet is Not tested', () => {
    expect(inboxHealth({ ...base, lastTestAt: null, lastTestMs: null, lastReceivedAt: null }, NOW)).toBe('untested');
  });
  it('DST: a test sent at 1:55 AM CDT on 2026-11-01 is judged by real elapsed time across the fall-back hour', () => {
    const sent = new Date('2026-11-01T06:55:00Z'); // 1:55 AM CDT; clocks fall back at 2:00 AM CDT (07:00Z)
    const facts = { ...base, lastTestAt: sent, lastTestMs: null };
    expect(inboxHealth(facts, new Date('2026-11-01T07:04:00Z'))).toBe('healthy'); // 9 real minutes (wall clock reads 1:04 AM CST)
    expect(inboxHealth(facts, new Date('2026-11-01T07:06:00Z'))).toBe('broken'); // 11 real minutes
  });
  it('every state has the words the student and the desk see', () => {
    expect(HEALTH_LABEL.broken).toBe('Forwarding broken');
    expect(Object.keys(HEALTH_LABEL).sort()).toEqual(['broken', 'healthy', 'quiet', 'setup', 'untested']);
  });
});
