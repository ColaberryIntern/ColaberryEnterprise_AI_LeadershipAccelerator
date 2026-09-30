import { markOncePerSession, ONCE_PER_SESSION_PREFIX } from '../oncePerSession';

/** Minimal in-memory stand-in for sessionStorage. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    _map: map,
  };
}

describe('markOncePerSession', () => {
  it('returns true the first time and false on every subsequent call', () => {
    // The whole point: form_start is a tier-3 commitment signal. If it fired
    // repeatedly it would inflate intent for someone who simply typed slowly.
    const s = fakeStorage();
    expect(markOncePerSession('form_start:enroll', s)).toBe(true);
    expect(markOncePerSession('form_start:enroll', s)).toBe(false);
    expect(markOncePerSession('form_start:enroll', s)).toBe(false);
  });

  it('treats a fresh session as a fresh opportunity to signal', () => {
    // Someone returning next week HAS started the form again — that is
    // information, which is why this uses sessionStorage rather than local.
    const first = fakeStorage();
    expect(markOncePerSession('form_start:enroll', first)).toBe(true);
    const second = fakeStorage();
    expect(markOncePerSession('form_start:enroll', second)).toBe(true);
  });

  it('keeps distinct keys independent', () => {
    const s = fakeStorage();
    expect(markOncePerSession('form_start:enroll', s)).toBe(true);
    expect(markOncePerSession('payment_attempt:annual', s)).toBe(true);
    expect(markOncePerSession('form_start:enroll', s)).toBe(false);
  });

  it('namespaces its keys so it cannot collide with other app storage', () => {
    const s = fakeStorage();
    markOncePerSession('form_start:enroll', s);
    expect([...s._map.keys()]).toEqual([`${ONCE_PER_SESSION_PREFIX}form_start:enroll`]);
  });

  it('fails OPEN when storage is unavailable', () => {
    // Safari private mode / embedded webviews. A missing signal is worse than
    // an occasional duplicate, and the reader caps each signal's contribution.
    expect(markOncePerSession('form_start:enroll', null)).toBe(true);
    expect(markOncePerSession('form_start:enroll', null)).toBe(true);
  });

  it('fails OPEN when storage throws rather than breaking the page', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => markOncePerSession('form_start:enroll', throwing)).not.toThrow();
    expect(markOncePerSession('form_start:enroll', throwing)).toBe(true);
  });
});
