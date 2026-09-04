/**
 * `identifyVisitor` is the call that was missing.
 *
 * `POST /api/t/identify` has been built, routed and working on the backend for
 * the lifetime of this system, and nothing in the frontend ever called it. The
 * measured result in production: 54 of 1,791 visitors linked to a person — 3.0%.
 *
 * The tests that matter most here are the ones asserting it does NOT fire. The
 * endpoint links a device fingerprint to a named human, so a call made in the
 * wrong circumstances is a privacy failure, not a missing feature.
 */

import { identifyVisitor } from '../tracker';

const FP = 'abcdef1234567890';

function setFingerprint(value: string | null): void {
  window.localStorage.clear();
  if (value) window.localStorage.setItem('cb_visitor_fp', value);
}

beforeEach(() => {
  setFingerprint(FP);
  (global as any).fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ lead_id: 42 }) }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

function lastCall(): [string, any] | null {
  const mock = (global as any).fetch as jest.Mock;
  return mock.mock.calls.length ? (mock.mock.calls[mock.mock.calls.length - 1] as [string, any]) : null;
}

describe('identifyVisitor — sends what the backend needs', () => {
  it('posts the fingerprint and the email to the identify endpoint', () => {
    identifyVisitor('Dana@Example.COM ', { name: 'Dana Whitfield', company: 'Acme' });

    const call = lastCall()!;
    expect(call[0]).toContain('/api/t/identify');
    const body = JSON.parse(call[1].body);
    expect(body.fingerprint).toBe(FP);
    // Normalised, because the backend looks the lead up by exact match and a
    // stray capital would create a second person for the same human.
    expect(body.email).toBe('dana@example.com');
    expect(body.name).toBe('Dana Whitfield');
    expect(body.company).toBe('Acme');
  });

  it('carries the metadata a caller attaches', () => {
    identifyVisitor('a@b.com', { metadata: { source_form: 'strategy_call' } });

    const body = JSON.parse(lastCall()![1].body);
    expect(body.metadata).toEqual({ source_form: 'strategy_call' });
  });
});

describe('identifyVisitor — must not fire', () => {
  /**
   * The load-bearing test. No fingerprint means `initTracker()` never ran, which
   * on the V2 tree means consent was never granted. Minting an identifier at the
   * exact moment someone hands over their name is the worst possible time to do
   * it, so the call is skipped entirely rather than the fingerprint created.
   */
  it('does nothing when no fingerprint exists — tracking was never started', () => {
    setFingerprint(null);

    identifyVisitor('someone@example.com', { name: 'Someone' });

    expect((global as any).fetch).not.toHaveBeenCalled();
    // And it must not have created one on the way past.
    expect(window.localStorage.getItem('cb_visitor_fp')).toBeNull();
  });

  it.each([['', 'empty'], ['not-an-email', 'malformed'], [null as unknown as string, 'null']])(
    'ignores a %s address (%s)',
    (email) => {
      identifyVisitor(email);
      expect((global as any).fetch).not.toHaveBeenCalled();
    },
  );
});

describe('identifyVisitor — never breaks the form it is attached to', () => {
  it('swallows a network failure', () => {
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));

    // The visitor came to submit a form; this is bookkeeping hung off the side
    // of it and must never be the reason the submission appears to fail.
    expect(() => identifyVisitor('a@b.com')).not.toThrow();
  });

  it('swallows a fetch that throws synchronously', () => {
    (global as any).fetch = jest.fn(() => {
      throw new Error('blocked by extension');
    });

    expect(() => identifyVisitor('a@b.com')).not.toThrow();
  });

  it('remembers the returned lead id so later flushes carry it', async () => {
    identifyVisitor('a@b.com');
    // Drain the macrotask queue rather than counting microtasks: the chain is
    // fetch -> res.json() -> setItem, and res.json() returns a promise of its
    // own, so a fixed number of `await Promise.resolve()` ticks is a guess that
    // happens to be wrong.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.localStorage.getItem('cb_lead_id')).toBe('42');
  });
});
