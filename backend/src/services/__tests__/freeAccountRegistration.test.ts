import {
  normalizeIdentity,
  freeEnrollmentDefaults,
  needsProgrammeUpgrade,
  resolveFreeAccount,
} from '../freeAccountRegistration';
import { Enrollment } from '../../models';

jest.mock('../../models', () => ({
  Enrollment: { findAll: jest.fn(), create: jest.fn() },
}));

const findAll = Enrollment.findAll as jest.Mock;
const create = Enrollment.create as jest.Mock;

/** A row as the DB hands it back, with the `update` spy the service calls. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'enr-existing',
  email: 'maya@example.com',
  full_name: 'Maya',
  tier: 'guest',
  enrollment_type: 'standard',
  payment_status: 'pending',
  cohort_id: null,
  status: 'active',
  created_at: new Date('2026-01-01'),
  // Declared on the BASE fixture, not just passed through `...over`, so the property
  // exists on the inferred type and a test can read it back. null is also the honest
  // default: a row that has not entered the Explorer journey has no entry time.
  explorer_entered_at: null as Date | null,
  update: jest.fn(),
  ...over,
});

describe('freeAccountRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockImplementation(async (attrs: any) => ({ id: 'enr-new', update: jest.fn(), ...attrs }));
  });

  describe('normalizeIdentity (pure)', () => {
    it('lowercases + trims email and trims name', () => {
      expect(normalizeIdentity({ full_name: '  Maya Chen ', email: '  Maya@Example.COM ' }))
        .toEqual({ full_name: 'Maya Chen', email: 'maya@example.com' });
    });
  });

  describe('freeEnrollmentDefaults (pure)', () => {
    it('learner gets BOTH columns: tier guest AND enrollment_type explorer', () => {
      const d = freeEnrollmentDefaults({ full_name: 'Maya', email: 'maya@example.com' }, 'learner');
      expect(d.tier).toBe('guest');
      expect(d.enrollment_type).toBe('explorer');
    });

    it('standard is free access WITHOUT the learner programme', () => {
      const d = freeEnrollmentDefaults({ full_name: 'Maya', email: 'maya@example.com' }, 'standard');
      expect(d.tier).toBe('guest');
      expect(d.enrollment_type).not.toBe('explorer');
      expect(d.enrollment_type).toBe('standard');
    });

    it('is a free account with immediate portal access and no cohort, on both programmes', () => {
      for (const programme of ['learner', 'standard'] as const) {
        const d = freeEnrollmentDefaults({ full_name: 'Maya', email: 'maya@example.com' }, programme);
        expect(d.portal_enabled).toBe(true);
        expect(d.cohort_id).toBeNull();
        expect(d.status).toBe('active');
        expect(d.payment_status).toBe('pending');
        expect(d.company).toBe('');
        expect(d.maturity_level).toBe(0);
      }
    });
  });

  describe('needsProgrammeUpgrade (pure)', () => {
    it('upgrades an active unpaid non-learner row asked for the learner programme', () => {
      expect(needsProgrammeUpgrade(row(), 'learner')).toBe(true);
    });

    it('never upgrades a PAID row — that would gate a paying student to Week 0', () => {
      expect(needsProgrammeUpgrade(row({ payment_status: 'paid' }), 'learner')).toBe(false);
    });

    it('never upgrades when the programme asked for is standard — provisioning cannot conscript', () => {
      expect(needsProgrammeUpgrade(row(), 'standard')).toBe(false);
    });

    /**
     * Found while updating the pre-existing freeSignupService suite, after T201
     * had already been verified. An unpaid `tier: 'member'` row is not a free
     * account — it is someone who enrolled in a cohort and has not paid yet.
     * Upgrading them to 'explorer' would gate their curriculum to Week 0 and drop
     * them from the admin dashboard's paid and pending counts, because they
     * visited the free-course page.
     */
    it('never upgrades an unpaid tier:member row — that is an enrolled member awaiting payment', () => {
      expect(needsProgrammeUpgrade(row({ tier: 'member', payment_status: 'pending' }), 'learner')).toBe(false);
    });

    it('is a no-op for a row already on the learner programme', () => {
      expect(needsProgrammeUpgrade(row({ enrollment_type: 'explorer' }), 'learner')).toBe(false);
    });
  });

  describe('resolveFreeAccount', () => {
    it('requires a name and an email', async () => {
      await expect(resolveFreeAccount({ full_name: '', email: '', programme: 'learner' })).rejects.toThrow();
      await expect(resolveFreeAccount({ full_name: 'Maya', email: '', programme: 'learner' })).rejects.toThrow();
    });

    it('creates a learner with both columns when no active row exists', async () => {
      findAll.mockResolvedValue([]);

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'Maya@Example.com', programme: 'learner' });

      expect(res.disposition).toBe('created');
      expect(res.enrollment.tier).toBe('guest');
      expect(res.enrollment.enrollment_type).toBe('explorer');
      expect(res.enrollment.email).toBe('maya@example.com');
    });

    it('creates a standard free account that is NOT a learner', async () => {
      findAll.mockResolvedValue([]);

      const res = await resolveFreeAccount({ full_name: 'Teammate', email: 't@corp.com', programme: 'standard' });

      expect(res.enrollment.tier).toBe('guest');
      expect(res.enrollment.enrollment_type).not.toBe('explorer');
    });

    /**
     * THE WITHDRAWN-ROW HOLE. The portal path matched on email with no status
     * filter, `retireRedundantExplorerAccounts` leaves `withdrawn` rows behind,
     * and Explorer Growth's population loader requires `status = 'active'`. A
     * returning person was logged into the dead row and stayed invisible.
     */
    it('a returning person whose only row is WITHDRAWN gets a NEW active learner row', async () => {
      // A fake table that honours the `where` it is given, rather than a mock
      // returning []. Returning [] would make this test a restatement of
      // "creates when none exists" and it would pass even if the service
      // dropped the status filter entirely — the exact bug it exists to catch.
      const withdrawn = row({ id: 'enr-dead', status: 'withdrawn', enrollment_type: 'explorer' });
      findAll.mockImplementation(async ({ where }: any) =>
        [withdrawn].filter((r) => Object.entries(where).every(([k, v]) => (r as any)[k] === v)),
      );

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      expect(res.disposition).toBe('created');
      expect(res.enrollment.id).not.toBe('enr-dead');
      expect(res.enrollment.enrollment_type).toBe('explorer');
      expect(res.enrollment.status).toBe('active');
      // And the dead row is left exactly as it was.
      expect(withdrawn.update).not.toHaveBeenCalled();
    });

    it('the same fixture WOULD return the dead row without the status filter — the filter is load-bearing', async () => {
      // The positive control for the test above: it proves the fixture really
      // does contain a matching row, so "created" there came from the filter
      // and not from an empty table.
      const withdrawn = row({ id: 'enr-dead', status: 'withdrawn' });
      const unfiltered = [withdrawn].filter((r) =>
        Object.entries({ email: 'maya@example.com' }).every(([k, v]) => (r as any)[k] === v),
      );

      expect(unfiltered).toHaveLength(1);
      expect(unfiltered[0].id).toBe('enr-dead');
    });

    it('queries ACTIVE rows only, so a withdrawn row can never be returned as an account', async () => {
      findAll.mockResolvedValue([]);

      await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      expect(findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) }),
      );
    });

    it('returns an existing active PAID row completely untouched', async () => {
      const paid = row({
        payment_status: 'paid',
        tier: 'member',
        enrollment_type: 'standard',
        cohort_id: 'coh-1',
      });
      findAll.mockResolvedValue([paid]);

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      expect(res.disposition).toBe('reused');
      expect(paid.update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(res.enrollment.tier).toBe('member');
      expect(res.enrollment.enrollment_type).toBe('standard');
      expect(res.enrollment.payment_status).toBe('paid');
      expect(res.enrollment.cohort_id).toBe('coh-1');
    });

    it('reuses an existing active learner row rather than duplicating it', async () => {
      const existing = row({ enrollment_type: 'explorer' });
      findAll.mockResolvedValue([existing]);

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      expect(res.disposition).toBe('reused');
      expect(create).not.toHaveBeenCalled();
      expect(existing.update).not.toHaveBeenCalled();
    });

    /**
     * THE ORG-TEAMMATE HOLE. `pickBestEnrollment` ranks 'explorer' WORSE than a
     * non-learner row, so an org teammate who later signs up for the free AI
     * course is handed their org row. Without the upgrade they never join the
     * learner programme and stay invisible to Explorer Growth.
     */
    it('an org teammate who signs up for the free AI course is UPGRADED in place, not duplicated', async () => {
      const teammate = row({ tier: 'guest', enrollment_type: 'standard', payment_status: 'pending' });
      findAll.mockResolvedValue([teammate]);

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      expect(res.disposition).toBe('upgraded');
      // T205 added `explorer_entered_at` to this patch: an upgrade IS the moment the
      // teammate entered the journey, months after their row's `created_at`.
      expect(teammate.update).toHaveBeenCalledWith({
        enrollment_type: 'explorer',
        explorer_entered_at: expect.any(Date),
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('the upgrade touches ONLY the programme — tier, payment, cohort and status are not written', async () => {
      const teammate = row();
      findAll.mockResolvedValue([teammate]);

      await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      expect(teammate.update).toHaveBeenCalledTimes(1);
      const written = teammate.update.mock.calls[0][0];
      // Still an EXACT key list, which is the point of this test — `tier`,
      // `payment_status`, `cohort_id` and `status` must not appear. T205 widened it by
      // exactly one field and the list stays exhaustive, so a third field arriving later
      // is still a failure rather than a silent widening of what an upgrade may write.
      expect(Object.keys(written).sort()).toEqual(['enrollment_type', 'explorer_entered_at']);
    });

    /**
     * AC4 — SET ONCE. This is the test T205 attempt 1 did not have, and its absence was
     * the acceptance gap the verifier correctly failed the task on.
     *
     * `expect.any(Date)` on the upgrade patch proves a write happened; it proves nothing
     * about uniqueness. The old fixture never set `explorer_entered_at`, so the
     * `if (!existing.explorer_entered_at)` guard was never exercised against a non-null
     * value — and a mutation deleting that guard altogether passed 152 tests. A guard no
     * test can distinguish from its own absence is not a guard.
     */
    it('AC4: an already-entered row keeps its ORIGINAL entry time — the write is set-once', async () => {
      const first = new Date('2026-03-15T09:00:00Z');
      const teammate = row({ explorer_entered_at: first });
      findAll.mockResolvedValue([teammate]);

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      expect(res.disposition).toBe('upgraded');
      // The programme is granted; the timestamp is NOT in the patch at all.
      const written = teammate.update.mock.calls[0][0];
      expect(Object.keys(written)).toEqual(['enrollment_type']);
      expect(written.explorer_entered_at).toBeUndefined();
    });

    /**
     * AC4, second half: the value SURVIVES a subsequent upgrade of the same row.
     *
     * REWRITTEN AFTER VERIFICATION, because the first version's closing assertion could not
     * fail. `update` was a bare `jest.fn()` that never applied its patch to the row, and the
     * service never assigns the property directly, so `expect(teammate.explorer_entered_at)
     * .toBe(first)` held no matter what the service wrote. Proven: with the set-once guard
     * deleted - so a fresh timestamp is written on EVERY upgrade - that test stayed green.
     *
     * The fix is a fixture whose `update` actually mutates the row, which is what a real
     * Sequelize instance does. Now the row genuinely carries whatever the service wrote, and
     * the assertion bites.
     *
     * Named for what it proves. The state change here is produced BY THE SERVICE - the
     * upgrade writes `enrollment_type` onto the row through `update` - rather than assigned
     * in the test body, which is what the previous version did and should not have called a
     * state change.
     */
    it('AC4: the entry time survives the upgrade that the service itself writes', async () => {
      const first = new Date('2026-03-15T09:00:00Z');
      const teammate = row({ explorer_entered_at: first });
      // THE LOAD-BEARING LINE: apply the patch, as a real model instance would. Without
      // this the final assertion is unfalsifiable.
      teammate.update.mockImplementation(async (patch: Record<string, unknown>) => {
        Object.assign(teammate, patch);
      });
      findAll.mockResolvedValue([teammate]);

      const upgraded = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });
      expect(upgraded.disposition).toBe('upgraded');
      // The service's own write landed on the row - this is the state change.
      expect(teammate.enrollment_type).toBe('explorer');
      // And it did NOT carry a new entry time with it.
      expect(teammate.explorer_entered_at).toBe(first);

      // A later visit now reuses the row, writing nothing further.
      const second = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });
      expect(second.disposition).toBe('reused');
      expect(teammate.update).toHaveBeenCalledTimes(1);
      expect(teammate.explorer_entered_at).toBe(first);
    });

    it('org provisioning still cannot make a teammate a learner: standard leaves the row alone', async () => {
      const teammate = row();
      findAll.mockResolvedValue([teammate]);

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'standard' });

      expect(res.disposition).toBe('reused');
      expect(teammate.update).not.toHaveBeenCalled();
    });

    it('canonicalises through pickBestEnrollment when several active rows share the email', async () => {
      const staff = row({ id: 'enr-staff', communityMember: { mgmt_role: 'director' }, created_at: new Date('2025-01-01') });
      const newer = row({ id: 'enr-newer', created_at: new Date('2026-06-01') });
      findAll.mockResolvedValue([newer, staff]);

      const res = await resolveFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

      // mgmt_role outranks recency — the staff row is the canonical one.
      expect(res.enrollment.id).toBe('enr-staff');
    });
  });
});
