jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { staffDecline } from '../showcaseLifecycle';

const q = sequelize.query as unknown as jest.Mock;

/**
 * THE OTHER HALF OF A REVIEW.
 *
 * Until this existed the queue had one button. Refusing a request meant leaving
 * it to sit, which a learner cannot tell apart from being forgotten — and being
 * forgotten is exactly what the queue was built to stop.
 */

const ID = 'cafe0000-0000-4000-8000-000000000001';
const STAFF = 'ali@colaberry.com';

beforeEach(() => { jest.clearAllMocks(); });

const declined = () => q.mockResolvedValueOnce([[{ id: ID }], undefined]);
const noRow = () => q.mockResolvedValueOnce([[], undefined]);

describe('a reason is not optional', () => {
  it('refuses an empty reason', async () => {
    const r = await staffDecline(ID, STAFF, '');
    expect(r).toEqual({ ok: false, reason: 'A decline needs a reason the learner can act on.' });
    expect(q).not.toHaveBeenCalled();
  });

  it('refuses whitespace, which is an empty reason with extra steps', async () => {
    const r = await staffDecline(ID, STAFF, '   \n  ');
    expect(r.ok).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });

  it('trims the reason it does store', async () => {
    declined();
    await staffDecline(ID, STAFF, '  Label the cost figure.  ');
    expect(q.mock.calls[0][1].replacements.note).toBe('Label the cost figure.');
  });
});

describe('declining', () => {
  it('withdraws with the reason and records who decided', async () => {
    declined();
    const r = await staffDecline(ID, STAFF, 'The cost figure is unsourced.');
    expect(r).toEqual({ ok: true });

    // Collapsed, because the alignment of a SET clause is not the contract and a
    // test that breaks when someone re-indents the SQL is noise.
    const [sql, opts] = q.mock.calls[0];
    const flat = String(sql).replace(/\s+/g, ' ');
    expect(flat).toContain('withdrawn_at = NOW()');
    expect(flat).toContain('withdrawn_reason = :note');
    expect(flat).toContain('staff_approved_by = :by');
    expect(opts.replacements).toMatchObject({
      id: ID, by: STAFF, note: 'The cost figure is unsourced.',
    });
  });

  it('leaves the learner able to fix it and ask again', async () => {
    // The partial unique index is scoped to `withdrawn_at IS NULL`, so withdrawing
    // frees the recording for a fresh request. Declining must therefore WITHDRAW
    // rather than delete, or a learner who fixes the problem cannot re-submit.
    declined();
    await staffDecline(ID, STAFF, 'Re-record with the mic closer.');
    expect(String(q.mock.calls[0][0])).toContain('withdrawn_at IS NULL');
  });

  it('will not touch something already published', async () => {
    // Taking down what a cohort has already seen is a withdrawal, a different
    // operation with different consequences. The guard is in the WHERE clause,
    // so it holds even if a stale screen offers the button.
    declined();
    await staffDecline(ID, STAFF, 'too late');
    expect(String(q.mock.calls[0][0])).toContain('published_at IS NULL');
  });
});

describe('when nothing changed', () => {
  it('reports a conflict rather than claiming success', async () => {
    noRow();
    const r = await staffDecline(ID, STAFF, 'a reason');
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain('no longer pending');
  });

  it('is idempotent: a second decline is a conflict, not a second withdrawal', async () => {
    declined();
    expect(await staffDecline(ID, STAFF, 'first')).toEqual({ ok: true });
    noRow();
    expect((await staffDecline(ID, STAFF, 'second')).ok).toBe(false);
  });
});
