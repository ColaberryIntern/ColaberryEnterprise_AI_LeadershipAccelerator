import { emailIdentityKey, pickBestDuplicate, DedupeSignal } from '../../services/emailIdentity';

describe('emailIdentityKey', () => {
  it('collapses a gmail +tag alias onto the base address', () => {
    expect(emailIdentityKey('tanmayi.katamaraja+3@gmail.com')).toBe(emailIdentityKey('tanmayi.katamaraja@gmail.com'));
  });

  it('collapses dots in the gmail local part (gmail ignores them)', () => {
    expect(emailIdentityKey('tanmayikatamaraja@gmail.com')).toBe(emailIdentityKey('tanmayi.katamaraja@gmail.com'));
  });

  it('treats googlemail.com as the same provider as gmail.com', () => {
    expect(emailIdentityKey('someone+1@googlemail.com')).toBe(emailIdentityKey('someone@gmail.com'));
  });

  it('does NOT collapse a colaberry.com +alias — that is a deliberately distinct test persona, not a gmail-style alias', () => {
    expect(emailIdentityKey('ali+9@colaberry.com')).not.toBe(emailIdentityKey('ali@colaberry.com'));
  });

  it('lowercases and trims non-gmail addresses without altering them otherwise', () => {
    expect(emailIdentityKey('  Brianna_W_22@Outlook.com  ')).toBe('brianna_w_22@outlook.com');
  });

  it('returns an empty string for a missing email', () => {
    expect(emailIdentityKey(null)).toBe('');
    expect(emailIdentityKey(undefined)).toBe('');
  });
});

describe('pickBestDuplicate', () => {
  const sig = (overrides: Partial<DedupeSignal>): DedupeSignal => ({
    email: 'x@example.com', hasActiveSubscription: false, paymentStatusPaid: false, isExplorer: false, createdAt: null,
    ...overrides,
  });

  it('keeps the earliest, paid, non-explorer, active-subscription row out of the real 3-row Tanmayi Katamaraja shape', () => {
    const rows = [
      { id: 'explorer-pending', email: 'tanmayi.katamaraja+1@gmail.com', hasActiveSubscription: false, paymentStatusPaid: false, isExplorer: true, createdAt: '2026-07-28T00:14:23.995Z' },
      { id: 'plain-earliest', email: 'tanmayi.katamaraja@gmail.com', hasActiveSubscription: true, paymentStatusPaid: true, isExplorer: false, createdAt: '2026-07-11T19:42:25.016Z' },
      { id: 'plus3-later', email: 'tanmayi.katamaraja+3@gmail.com', hasActiveSubscription: true, paymentStatusPaid: true, isExplorer: false, createdAt: '2026-07-28T00:01:56.130Z' },
    ];
    const result = pickBestDuplicate(rows, (r) => ({ email: r.email, hasActiveSubscription: r.hasActiveSubscription, paymentStatusPaid: r.paymentStatusPaid, isExplorer: r.isExplorer, createdAt: r.createdAt }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('plain-earliest');
  });

  it('collapses a 2-row exact-email staff duplicate, preferring the paid row over the pending one (aleem@colaberry.com shape)', () => {
    const rows = [
      { id: 'pending', email: 'aleem@colaberry.com', createdAt: '2026-07-07T13:33:32.032Z', paid: false },
      { id: 'paid', email: 'aleem@colaberry.com', createdAt: '2026-07-09T13:24:59.513Z', paid: true },
    ];
    const result = pickBestDuplicate(rows, (r) => sig({ email: r.email, paymentStatusPaid: r.paid, createdAt: r.createdAt }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('paid');
  });

  it('leaves distinct identities untouched (no false-positive collapsing)', () => {
    const rows = [
      { id: 'a', email: 'alice@example.com' },
      { id: 'b', email: 'bob@example.com' },
    ];
    const result = pickBestDuplicate(rows, (r) => sig({ email: r.email }));
    expect(result.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('never collapses rows with no email into each other', () => {
    const rows = [{ id: 'a', email: null }, { id: 'b', email: null }];
    const result = pickBestDuplicate(rows, (r) => sig({ email: r.email }));
    expect(result).toHaveLength(2);
  });

  it('falls back to earliest createdAt when subscription/payment/explorer signals are tied', () => {
    const rows = [
      { id: 'later', email: 'sohail@colaberry.com', createdAt: '2026-07-09T15:12:34.144Z' },
      { id: 'earlier', email: 'sohail@colaberry.com', createdAt: '2026-07-06T13:41:07.655Z' },
    ];
    const result = pickBestDuplicate(rows, (r) => sig({ email: r.email, createdAt: r.createdAt }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('earlier');
  });
});
