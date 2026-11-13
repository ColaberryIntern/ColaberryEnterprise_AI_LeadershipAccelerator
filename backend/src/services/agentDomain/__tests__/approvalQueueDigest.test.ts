/**
 * The approvals digest, and above all WHO it decides to mail.
 *
 * The composer is pure, so these tests are the whole behaviour. The routing rules are the
 * point: a request whose named owner cannot act must not be mailed to that owner, because a
 * daily mail about a queue you cannot open is how a digest trains its reader to ignore it.
 *
 * Measured on production 2026-11-13 and the reason this module exists: 1 request ever filed,
 * 0 ever decided, and three of the ten named domain owners hold no admin role while
 * `manager_can_reach` reports true for all ten.
 */

import {
  ageInDays,
  composeApprovalDigests,
  subjectFor,
  type DomainDecider,
  type OpenRequest,
} from '../approvalQueueDigest';

const NOW = new Date('2026-11-20T18:00:00Z');
const BASE = 'https://enterprise.colaberry.ai';

const req = (over: Partial<OpenRequest> = {}): OpenRequest => ({
  id: 'r1',
  domain_key: 'admissions',
  title: 'New capability: weekly report of unpaid Explorers',
  requested_by_identity: 'kalkidankin@gmail.com',
  requested_at: '2026-11-18T18:00:00Z',
  kind: 'change',
  ...over,
});

const decider = (over: Partial<DomainDecider> = {}): DomainDecider => ({
  domainKey: 'admissions',
  email: 'taiwo@colaberry.com',
  canDecide: true,
  blocker: null,
  ...over,
});

const compose = (open: OpenRequest[], deciders: DomainDecider[], fallback = ['ali@colaberry.com']) =>
  composeApprovalDigests({ open, deciders, asOf: NOW, baseUrl: BASE, fallbackRecipients: fallback });

// ───────────────────────────── 1. age ─────────────────────────────

describe('age', () => {
  it('floors to whole days, so an hour-old request reads as today', () => {
    expect(ageInDays('2026-11-20T17:00:00Z', NOW)).toBe(0);
    expect(ageInDays('2026-11-19T17:00:00Z', NOW)).toBe(1);
    expect(ageInDays('2026-11-18T18:00:00Z', NOW)).toBe(2);
  });

  it('never returns a negative age for a clock skew', () => {
    expect(ageInDays('2026-11-21T18:00:00Z', NOW)).toBe(0);
  });

  it('treats an unparseable date as 0 rather than NaN', () => {
    expect(ageInDays('not a date', NOW)).toBe(0);
  });
});

// ──────────────────── 2. who gets mailed, which is the point ────────────────────

describe('routing', () => {
  it('mails the domain owner who can decide', () => {
    const { digests } = compose([req()], [decider()]);
    expect(digests).toHaveLength(1);
    expect(digests[0].to).toBe('taiwo@colaberry.com');
    expect(digests[0].isFallback).toBe(false);
  });

  it('does NOT mail an owner who holds no admin role; it escalates instead', () => {
    // The three real cases: platform/kes, product_experience/aleem, sales/roselen.
    const { digests } = compose(
      [req({ domain_key: 'sales', requested_by_identity: 'vesauber@gmail.com' })],
      [decider({ domainKey: 'sales', email: 'roselen@colaberry.com', canDecide: false, blocker: 'no admin_users row' })],
    );
    expect(digests.map((d) => d.to)).toEqual(['ali@colaberry.com']);
    expect(digests[0].isFallback).toBe(true);
    expect(digests[0].ownerCannotDecide).toEqual(['sales (roselen@colaberry.com)']);
    // And it says what to do about it, not just that it happened.
    expect(digests[0].text).toContain('holds no admin role');
    expect(digests[0].text).toContain('renders empty');
  });

  it('escalates when no decider is recorded at all', () => {
    const { digests } = compose([req({ domain_key: 'website' })], [decider({ domainKey: 'website', email: null })]);
    expect(digests[0].to).toBe('ali@colaberry.com');
    expect(digests[0].isFallback).toBe(true);
    // No owner was named, so there is nobody to report as blocked.
    expect(digests[0].ownerCannotDecide).toEqual([]);
  });

  it('never asks somebody to decide their own request', () => {
    const { digests } = compose(
      [req({ requested_by_identity: 'taiwo@colaberry.com' })],
      [decider()],
    );
    expect(digests.map((d) => d.to)).toEqual(['ali@colaberry.com']);
  });

  it('sends ONE mail to a person who owns two domains, not two', () => {
    const { digests } = compose(
      [req({ id: 'a', domain_key: 'executive' }), req({ id: 'b', domain_key: 'learner_success' })],
      [
        decider({ domainKey: 'executive', email: 'ali@colaberry.com' }),
        decider({ domainKey: 'learner_success', email: 'ali@colaberry.com' }),
      ],
      [],
    );
    expect(digests).toHaveLength(1);
    expect(digests[0].lines).toHaveLength(2);
  });

  it('reports requests nobody will hear about rather than dropping them quietly', () => {
    const { digests, orphaned } = compose([req({ domain_key: 'website' })],
      [decider({ domainKey: 'website', email: null })], []);
    expect(digests).toHaveLength(0);
    expect(orphaned).toHaveLength(1);
  });
});

// ──────────────────── 3. the order, which the queue page gets backwards ────────────────────

describe('ordering', () => {
  it('puts the oldest request first', () => {
    // The existing queue endpoint orders requested_at DESC, which buries the oldest at the
    // bottom of the page. A queue sorted newest-first is sorted backwards.
    const { digests } = compose(
      [
        req({ id: 'new', requested_at: '2026-11-20T17:00:00Z' }),
        req({ id: 'old', requested_at: '2026-11-10T18:00:00Z' }),
        req({ id: 'mid', requested_at: '2026-11-18T18:00:00Z' }),
      ],
      [decider()],
    );
    expect(digests[0].lines.map((l) => l.id)).toEqual(['old', 'mid', 'new']);
  });

  it('names the oldest age in the subject once it passes two days', () => {
    const lines = compose([req({ requested_at: '2026-11-10T18:00:00Z' })], [decider()]).digests[0].lines;
    expect(subjectFor(lines)).toBe('1 capability request waiting, oldest 10 days');
  });

  it('keeps the subject plain while everything is fresh', () => {
    const lines = compose([req({ requested_at: '2026-11-20T17:00:00Z' })], [decider()]).digests[0].lines;
    expect(subjectFor(lines)).toBe('1 capability request waiting on your decision');
  });
});

// ──────────────────── 4. the body says what to do ────────────────────

describe('the body', () => {
  it('states that a decline closes the story, because an open request blocks a builder', () => {
    const { digests } = compose([req()], [decider()]);
    expect(digests[0].text).toContain('A decline');
    expect(digests[0].text).toContain('counts');
    expect(digests[0].text).toContain(`${BASE}/admin/change-requests`);
  });

  it('names the builder and the age on every line', () => {
    const { digests } = compose([req()], [decider()]);
    expect(digests[0].text).toContain('kalkidankin@gmail.com');
    expect(digests[0].text).toContain('2 days old');
  });

  it('POSITIVE CONTROL: an empty queue produces no digests at all', () => {
    // Proves the tests above pass because of the routing and not because compose always
    // returns something.
    const { digests, orphaned } = compose([], [decider()]);
    expect(digests).toHaveLength(0);
    expect(orphaned).toHaveLength(0);
  });
});
