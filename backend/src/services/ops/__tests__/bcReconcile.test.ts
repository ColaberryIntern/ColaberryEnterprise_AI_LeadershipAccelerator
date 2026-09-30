/**
 * Unit tests for the pure reconcile decision logic (Layer 2). The DB/BC
 * orchestration in bcSyncService.reconcileCompletions is validated on the live
 * prod mirror; this covers the decision that governs whether a stale 'active'
 * row is flipped, refreshed, or left alone. Happy / failure / boundary / idem.
 */
import { reconcileAction, is404 } from '../bcReconcile';

describe('is404', () => {
  test('matches the bcGet 404 status form', () => {
    expect(is404('BC GET https://3.basecampapi.com/3945211/buckets/1/todos/9.json -> 404 ')).toBe(true);
    expect(is404('GET /buckets/1/todos/9.json -> 404 Not Found')).toBe(true);
  });

  test('does NOT match other statuses', () => {
    expect(is404('BC GET ... -> 401 Unauthorized')).toBe(false);
    expect(is404('BC GET ... -> 503')).toBe(false);
    expect(is404('ETIMEDOUT')).toBe(false);
    expect(is404(undefined)).toBe(false);
    expect(is404('')).toBe(false);
  });

  test('does NOT false-positive on a todo id / bucket that contains 404', () => {
    expect(is404('BC GET /buckets/40412/todos/9946404123.json -> 500')).toBe(false);
    expect(is404('BC GET /buckets/1/todos/404.json -> 500')).toBe(false);
  });
});

describe('reconcileAction', () => {
  test('completed -> mark_completed (the fix)', () => {
    expect(reconcileAction({ ok: true, completed: true })).toBe('mark_completed');
  });

  test('still open -> refresh (keep active, bump last_synced)', () => {
    expect(reconcileAction({ ok: true, completed: false })).toBe('refresh');
    expect(reconcileAction({ ok: true })).toBe('refresh');
  });

  test('404 / gone -> mark_completed (no longer active)', () => {
    expect(reconcileAction({ ok: false, notFound: true })).toBe('mark_completed');
  });

  test('transient / unknown error -> skip (never mislabel)', () => {
    expect(reconcileAction({ ok: false, notFound: false })).toBe('skip');
    expect(reconcileAction({ ok: false })).toBe('skip');
  });

  test('idempotent / pure', () => {
    const r = { ok: true, completed: true };
    expect(reconcileAction(r)).toBe(reconcileAction(r));
    expect(reconcileAction({ ok: false })).toBe(reconcileAction({ ok: false }));
  });
});
