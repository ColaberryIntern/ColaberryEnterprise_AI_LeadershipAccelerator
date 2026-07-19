import jwt from 'jsonwebtoken';
import {
  createHandoff, exchangeHandoff, HandoffStore, HandoffEnrollment,
} from '../portalHandoffService';

// In-memory store — exercises the token state machine (single-use + expiry)
// deterministically with no database.
function makeMemStore(enrollments: Record<string, HandoffEnrollment>): HandoffStore {
  const rows = new Map<string, { enrollment_id: string; expires_at: number; used: boolean }>();
  return {
    async insert(r) {
      rows.set(r.token, { enrollment_id: r.enrollment_id, expires_at: r.expires_at.getTime(), used: false });
    },
    async claim(token) {
      const r = rows.get(token);
      if (!r || r.used || r.expires_at <= Date.now()) return null;
      r.used = true; // single-use: the very act of claiming burns it
      return { enrollment_id: r.enrollment_id };
    },
    async loadEnrollment(id) {
      return enrollments[id] || null;
    },
  };
}

const E1: HandoffEnrollment = { id: 'e1', email: 'student@example.com', cohort_id: null };

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('t') || '';
}

describe('portal handoff service', () => {
  it('happy path: create then exchange mints a participant JWT for that enrollment', async () => {
    const store = makeMemStore({ e1: E1 });
    const created = await createHandoff('e1', store);
    expect(created.url).toContain('/portal/handoff?t=');
    expect(created.qrSvg).toContain('<svg');

    const res = await exchangeHandoff(tokenFromUrl(created.url), store);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const decoded = jwt.decode(res.jwt) as any;
      expect(decoded.sub).toBe('e1');
      expect(decoded.role).toBe('participant');
    }
  });

  it('single-use: a second exchange of the same token is rejected', async () => {
    const store = makeMemStore({ e1: E1 });
    const created = await createHandoff('e1', store);
    const token = tokenFromUrl(created.url);

    const first = await exchangeHandoff(token, store);
    expect(first.ok).toBe(true);

    const second = await exchangeHandoff(token, store);
    expect(second).toEqual({ ok: false, reason: 'invalid_or_expired' });
  });

  it('expired token cannot be exchanged', async () => {
    const store = makeMemStore({ e1: E1 });
    // Insert directly with an already-past expiry.
    await store.insert({ token: 'expired-tok', enrollment_id: 'e1', expires_at: new Date(Date.now() - 1000) });
    const res = await exchangeHandoff('expired-tok', store);
    expect(res).toEqual({ ok: false, reason: 'invalid_or_expired' });
  });

  it('unknown token is rejected', async () => {
    const store = makeMemStore({ e1: E1 });
    const res = await exchangeHandoff('does-not-exist', store);
    expect(res).toEqual({ ok: false, reason: 'invalid_or_expired' });
  });

  it('missing/empty token is rejected before any store call', async () => {
    const store = makeMemStore({ e1: E1 });
    const res = await exchangeHandoff('', store);
    expect(res).toEqual({ ok: false, reason: 'missing' });
  });

  it('token for a since-deleted enrollment fails safe (no session minted)', async () => {
    const store = makeMemStore({}); // enrollment not present
    await store.insert({ token: 'orphan', enrollment_id: 'ghost', expires_at: new Date(Date.now() + 60_000) });
    const res = await exchangeHandoff('orphan', store);
    expect(res).toEqual({ ok: false, reason: 'enrollment_missing' });
  });

  it('idempotent creation yields distinct single-use tokens', async () => {
    const store = makeMemStore({ e1: E1 });
    const a = await createHandoff('e1', store);
    const b = await createHandoff('e1', store);
    expect(tokenFromUrl(a.url)).not.toEqual(tokenFromUrl(b.url));
    // Burning one does not affect the other.
    expect((await exchangeHandoff(tokenFromUrl(a.url), store)).ok).toBe(true);
    expect((await exchangeHandoff(tokenFromUrl(b.url), store)).ok).toBe(true);
  });
});
