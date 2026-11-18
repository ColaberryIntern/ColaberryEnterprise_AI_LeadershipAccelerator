/**
 * R21 acceptance: a brand-new signup gets its `lead_id` when the LEAD arrives second.
 *
 * The defect these cover was invisible to every R18 test and to the whole CI suite, because the
 * enrollment-side hook is CORRECT: it finds no lead because no lead exists yet. It was only
 * found by reading production after the deploy, where five of six new enrollments were NULL.
 * So the cases below are written from those rows, not from imagination.
 */
const resolver = { resolveLeadIdForEmail: jest.fn() };
const models = { update: jest.fn() };

jest.mock('../enrollmentLeadResolver', () => ({
  resolveLeadIdForEmail: (...a: unknown[]) => resolver.resolveLeadIdForEmail(...a),
}));
jest.mock('../../../models', () => ({
  Enrollment: { update: (...a: unknown[]) => models.update(...a) },
}));

import {
  backlinkEnrollmentsForLead,
  leadEnrollmentBacklinkHook,
} from '../enrollmentLeadBacklink';

describe('backlinking an enrollment when the lead arrives second', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolver.resolveLeadIdForEmail.mockResolvedValue(112);
    models.update.mockResolvedValue([1]);
  });

  it('links the enrollment a new signup left NULL', async () => {
    // markwins16@yahoo.com: enrollment 04:24:47, lead 04:24:47, lead_id NULL.
    const linked = await backlinkEnrollmentsForLead({ id: 999, email: 'markwins16@yahoo.com' });
    expect(linked).toBe(1);
    expect(models.update).toHaveBeenCalledTimes(1);
    expect(models.update.mock.calls[0][0]).toEqual({ lead_id: 112 });
  });

  it('RESOLVES the lead rather than stamping the one that triggered it', async () => {
    // The whole correctness of this file. An older lead for the same email must win, or a
    // member is re-attributed to whichever list imported their address most recently.
    resolver.resolveLeadIdForEmail.mockResolvedValue(7);
    await backlinkEnrollmentsForLead({ id: 999, email: 'someone@example.com' });
    expect(models.update.mock.calls[0][0]).toEqual({ lead_id: 7 });
    expect(models.update.mock.calls[0][0]).not.toEqual({ lead_id: 999 });
  });

  it('only ever touches rows whose lead_id is NULL, so it cannot move an existing link', async () => {
    await backlinkEnrollmentsForLead({ id: 999, email: 'markwins16@yahoo.com' });
    const where = models.update.mock.calls[0][1].where;
    expect(JSON.stringify(where)).toMatch(/lead_id/);
    expect(Object.getOwnPropertySymbols(where.lead_id).length).toBeGreaterThan(0);
  });

  it('normalizes the email, because neither column is stored consistently', async () => {
    await backlinkEnrollmentsForLead({ id: 999, email: '  MarkWins16@Yahoo.com  ' });
    expect(resolver.resolveLeadIdForEmail).toHaveBeenCalledWith('markwins16@yahoo.com');
  });

  it('does nothing for a lead with no usable email, and never queries', async () => {
    expect(await backlinkEnrollmentsForLead({ id: 1, email: '   ' })).toBe(0);
    expect(await backlinkEnrollmentsForLead({ id: 1, email: null })).toBe(0);
    expect(await backlinkEnrollmentsForLead({ id: 1 })).toBe(0);
    expect(resolver.resolveLeadIdForEmail).not.toHaveBeenCalled();
    expect(models.update).not.toHaveBeenCalled();
  });

  it('writes nothing when the resolver finds no lead', async () => {
    resolver.resolveLeadIdForEmail.mockResolvedValue(null);
    expect(await backlinkEnrollmentsForLead({ id: 1, email: 'nobody@example.com' })).toBe(0);
    expect(models.update).not.toHaveBeenCalled();
  });

  it('joins the lead transaction when there is one, and omits it when there is not', async () => {
    const tx = { id: 'tx' };
    await backlinkEnrollmentsForLead({ id: 1, email: 'a@b.com' }, { transaction: tx });
    expect(models.update.mock.calls[0][1].transaction).toBe(tx);

    models.update.mockClear();
    await backlinkEnrollmentsForLead({ id: 1, email: 'a@b.com' });
    expect(models.update.mock.calls[0][1]).not.toHaveProperty('transaction');
  });

  it('is idempotent: a second run finds nothing left to link', async () => {
    models.update.mockResolvedValue([0]);
    expect(await backlinkEnrollmentsForLead({ id: 1, email: 'a@b.com' })).toBe(0);
  });

  it('links every unlinked enrollment for that person, not just one', async () => {
    models.update.mockResolvedValue([3]);
    expect(await backlinkEnrollmentsForLead({ id: 1, email: 'a@b.com' })).toBe(3);
  });
});

describe('the hook must never cost a signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolver.resolveLeadIdForEmail.mockResolvedValue(112);
    models.update.mockResolvedValue([1]);
  });

  it('swallows a failed lookup, because a thrown afterCreate rolls back the lead insert', async () => {
    resolver.resolveLeadIdForEmail.mockRejectedValue(new Error('db gone'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(leadEnrollmentBacklinkHook({ id: 1, email: 'a@b.com' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toMatch(/enrollment_lead_backlink_failed/);
    warn.mockRestore();
  });

  it('swallows a failed update too', async () => {
    models.update.mockRejectedValue(new Error('deadlock'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(leadEnrollmentBacklinkHook({ id: 1, email: 'a@b.com' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('logs only when it actually linked something, so the log is a signal and not noise', async () => {
    const info = jest.spyOn(console, 'log').mockImplementation(() => {});
    await leadEnrollmentBacklinkHook({ id: 1, email: 'a@b.com' });
    expect(info.mock.calls.some((c) => /enrollment_lead_backlinked/.test(String(c[0])))).toBe(true);

    info.mockClear();
    models.update.mockResolvedValue([0]);
    await leadEnrollmentBacklinkHook({ id: 1, email: 'a@b.com' });
    expect(info.mock.calls.some((c) => /enrollment_lead_backlinked/.test(String(c[0])))).toBe(false);
    info.mockRestore();
  });
});

describe('the wiring', () => {
  it('is registered as afterCreate on the Lead model, not beforeCreate', () => {
    // AFTER, because the lead needs an id before anything can point at it. Asserted against
    // the source: a hook that is written but not wired is the failure this whole ticket is.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'models', 'Lead.ts'), 'utf8',
    );
    expect(src).toContain("import { leadEnrollmentBacklinkHook } from '../services/marketing/enrollmentLeadBacklink'");
    expect(src).toMatch(/hooks:\s*\{[^}]*afterCreate:\s*leadEnrollmentBacklinkHook/s);
    expect(src).not.toMatch(/beforeCreate:\s*leadEnrollmentBacklinkHook/);
  });
});
