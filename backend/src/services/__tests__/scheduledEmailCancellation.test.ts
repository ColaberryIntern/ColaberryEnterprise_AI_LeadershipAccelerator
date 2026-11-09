const update = jest.fn();
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: { update: (...a: unknown[]) => update(...a) } }));
jest.mock('../../config/database', () => ({
  sequelize: { literal: (s: string) => ({ literal: s }), escape: (s: string) => `'${s.replace(/'/g, "''")}'` },
}));

import {
  CANCEL_REASONS, cancelledValues, cancelScheduledEmail, cancelScheduledEmails, isCancelReason,
} from '../scheduledEmailCancellation';

/** R3: the reason is merged, never overwrites, and only a known reason exists. */

beforeEach(() => update.mockReset().mockResolvedValue([3]));

describe('cancelledValues / cancelScheduledEmail (one row)', () => {
  it('keeps every existing metadata key and adds cancel_reason plus any extra', () => {
    expect(cancelledValues('safety_blocked', { campaign: 'x', blocked_reason: 'old' }, { blocked_reason: 'brand_no_relationship' }))
      .toEqual({ status: 'cancelled', metadata: { campaign: 'x', blocked_reason: 'brand_no_relationship', cancel_reason: 'safety_blocked' } });
  });
  it('null metadata is fine', () => {
    expect(cancelledValues('lead_paid', null).metadata).toEqual({ cancel_reason: 'lead_paid' });
  });
  it('an extra key can never override the reason', () => {
    expect(cancelledValues('lead_paid', null, { cancel_reason: 'something_else' }).metadata.cancel_reason).toBe('lead_paid');
  });
  it('updates the row it is given', async () => {
    const row = { metadata: { a: 1 }, update: jest.fn(async () => undefined) };
    await cancelScheduledEmail(row as never, 'cohort_started');
    expect(row.update).toHaveBeenCalledWith({ status: 'cancelled', metadata: { a: 1, cancel_reason: 'cohort_started' } });
  });
});

describe('cancelScheduledEmails (bulk)', () => {
  it('merges the reason into each row in SQL (COALESCE || jsonb), passes the where and transaction, returns the count', async () => {
    const t = { id: 'tx' };
    expect(await cancelScheduledEmails({ lead_id: 7, status: 'pending' }, 'sms_opt_out', { transaction: t as never })).toBe(3);
    const [values, opts] = update.mock.calls[0];
    expect(values.status).toBe('cancelled');
    expect(values.metadata.literal).toBe(`COALESCE(metadata, '{}'::jsonb) || '{"cancel_reason":"sms_opt_out"}'::jsonb`);
    expect(opts).toEqual({ where: { lead_id: 7, status: 'pending' }, transaction: t });
  });
  it('carries extra keys, escaped', async () => {
    await cancelScheduledEmails({ lead_id: 7 }, 'lead_opted_out', { extra: { cancelled_reason: "it's" } });
    expect(update.mock.calls[0][0].metadata.literal).toContain(`"cancelled_reason":"it''s"`);
  });
});

describe('the reason vocabulary', () => {
  it('is closed and unique, and isCancelReason knows it', () => {
    expect(new Set(CANCEL_REASONS).size).toBe(CANCEL_REASONS.length);
    expect(isCancelReason('sms_opt_out')).toBe(true);
    expect(isCancelReason('because')).toBe(false);
    for (const r of CANCEL_REASONS) expect(r).toMatch(/^[a-z_]+$/);
  });
});
