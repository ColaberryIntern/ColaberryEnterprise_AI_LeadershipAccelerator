const m = {
  context: jest.fn(),
  audited: jest.fn(),
  ledger: jest.fn(),
};
jest.mock('../../../../models', () => require('../../__tests__/fixtures/phase5Tables').phase5ModelsMock);
jest.mock('../../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => m.context(...a) }));
jest.mock('../../../../modules/tenancy/tenantAccessGuards', () => ({ requireBrandAccessAudited: (...a: unknown[]) => m.audited(...a) }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));

import { TenantAccessError } from '../../../../modules/tenancy/tenantAuthorization';
import { AS_OF_4 } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { applyExecutionApproval, applyExecutionRejection } from '../approvalApply';

/**
 * T509 — approve and reject on a receipt, in the order that keeps an
 * anonymous or out-of-scope caller from ever moving one: identity, receipt,
 * brand access (recorded), pending_review. Over T503's table: the flip is a
 * real update the fixture's indexes see.
 */

const ADMIN = { id: 'au-1', email: 'reviewer@example.com', role: 'admin' };
const CTX = { platformIdentityId: 'pi-1', tenantId: 't-col', brandId: 'b-ent', organizationId: null, roles: ['admin'], isPlatformSuperAdmin: false, authorizedTenantIds: ['t-col'], authorizedBrandIds: null };
const receipt = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', decision_id: 'd-1', subject_ref: 'lead:501', lead_id: 501, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: 'gj_colaberry_business_discovery_questions', sequence_id: 's-flow',
  mode: 'review', status: 'pending_review', status_reason: 'rollout', control_ids: ['ctl-1'], proposal_id: 'pa-1', approved_by: null, approved_at: null, created_at: AS_OF_4, ...over,
});
const row = (id: string) => T5.executions.rows.find((r) => r.id === id) as Record<string, unknown>;

beforeEach(() => {
  resetPhase5Tables();
  for (const fn of Object.values(m)) fn.mockReset();
  m.context.mockResolvedValue(CTX);
  m.audited.mockResolvedValue(undefined);
  m.ledger.mockResolvedValue({ recorded: true });
});

describe('approve', () => {
  it('flips pending_review -> approved with the approver\'s identity id (never the address), records the access, writes one ledger row - and never enrols', async () => {
    const r = receipt();
    const out = await applyExecutionApproval(r.id as string, ADMIN);
    expect(out.outcome).toBe('approved');
    expect(row(r.id as string)).toMatchObject({ status: 'approved', status_reason: 'approved_by_review', approved_by: 'admin:pi-1', approved_at: expect.any(Date) });
    // Tenant only: the audited guard is what judges the brand, so an out-of-scope brand is a RECORDED denial.
    expect(m.context).toHaveBeenCalledWith(ADMIN, { requestedTenantId: 't-col' });
    expect(m.audited).toHaveBeenCalledWith(CTX, 't-col', 'b-ent', { resourceType: 'growth_journey_execution', action: 'approve', resourceId: r.id, actorEmail: ADMIN.email });
    expect(m.ledger).toHaveBeenCalledTimes(1);
    expect(m.ledger).toHaveBeenCalledWith('growth_journey.execution.approved', 'growth_journey_execution', r.id, { tenant_id: 't-col', brand_id: 'b-ent' },
      { from: 'pending_review', to: 'approved', reason: 'approved_by_review', decision_id: 'd-1', proposal_id: 'pa-1' }, 'admin:pi-1');
    expect(JSON.stringify([row(r.id as string), m.ledger.mock.calls])).not.toContain('@');
  });

  it('acceptance 1: no admin -> not_authorized, the receipt untouched, no access recorded, no ledger row', async () => {
    const r = receipt();
    expect(await applyExecutionApproval(r.id as string, undefined)).toEqual({ outcome: 'not_authorized' });
    expect(row(r.id as string).status).toBe('pending_review');
    expect(m.context).not.toHaveBeenCalled();
    expect(m.audited).not.toHaveBeenCalled();
    expect(m.ledger).not.toHaveBeenCalled();
  });

  it.each([
    ['a brand outside the caller\'s scope (403)', new TenantAccessError('Brand not in scope', 403, 'AuthorizationError')],
    ['a receipt in another tenant (404, an isolation event)', new TenantAccessError('Tenant isolation', 404, 'TenantIsolationError')],
  ])('acceptance 2: %s -> not_authorized, and the audited guard was asked - it records the denial itself - with the receipt untouched', async (_label, refusal) => {
    const r = receipt();
    m.audited.mockRejectedValueOnce(refusal);
    expect(await applyExecutionApproval(r.id as string, ADMIN)).toEqual({ outcome: 'not_authorized' });
    // The context was built for the TENANT only, so the builder could not refuse the brand unrecorded (the T509 verifier's finding).
    expect(m.context).toHaveBeenCalledWith(ADMIN, { requestedTenantId: 't-col' });
    expect(m.audited).toHaveBeenCalledTimes(1);
    expect(m.audited).toHaveBeenCalledWith(CTX, 't-col', 'b-ent', expect.objectContaining({ resourceType: 'growth_journey_execution', action: 'approve', resourceId: r.id }));
    expect(row(r.id as string).status).toBe('pending_review');
    expect(m.ledger).not.toHaveBeenCalled();
  });

  it('the REAL guard over a brand-restricted context: an operator confined to another brand is denied AND the decision is recorded', async () => {
    // The actual `requireBrandAccessAudited` with only its recorder stubbed - the path the verifier probed.
    const decisions = jest.requireActual('../../../../modules/tenancy/tenantAccessAudit') as { recordAccessDecision: (d: unknown) => Promise<void> };
    const recorded: unknown[] = [];
    const recorder = jest.spyOn(decisions, 'recordAccessDecision').mockImplementation(async (d) => { recorded.push(d); });
    const guards = jest.requireActual('../../../../modules/tenancy/tenantAccessGuards') as { requireBrandAccessAudited: (...a: unknown[]) => Promise<void> };
    m.audited.mockImplementation((...a: unknown[]) => guards.requireBrandAccessAudited(...a));
    m.context.mockResolvedValue({ ...CTX, brandId: 'b-other', authorizedBrandIds: ['b-other'] });
    const r = receipt();
    expect(await applyExecutionApproval(r.id as string, ADMIN)).toEqual({ outcome: 'not_authorized' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ decision: 'denied', reason: 'AuthorizationError', resourceType: 'growth_journey_execution', resourceId: r.id, resourceTenantId: 't-col', resourceBrandId: 'b-ent' });
    expect(row(r.id as string).status).toBe('pending_review');
    recorder.mockRestore();
  });

  it('an error that is not an access refusal propagates - never read as authorized, never as unauthorized', async () => {
    const r = receipt();
    m.audited.mockRejectedValueOnce(new Error('access_decisions table gone'));
    await expect(applyExecutionApproval(r.id as string, ADMIN)).rejects.toThrow('access_decisions table gone');
    expect(row(r.id as string).status).toBe('pending_review');
  });

  it('a receipt that is gone -> receipt_not_found, before any access check', async () => {
    expect(await applyExecutionApproval('ex-missing', ADMIN)).toEqual({ outcome: 'receipt_not_found' });
    expect(m.context).not.toHaveBeenCalled();
  });

  it.each(['approved', 'expired', 'cancelled', 'rejected', 'enrolling'])('a receipt that is %s -> not_pending, untouched', async (status) => {
    const r = receipt({ status });
    expect(await applyExecutionApproval(r.id as string, ADMIN)).toEqual({ outcome: 'not_pending', status });
    expect(row(r.id as string).status).toBe(status);
    expect(m.ledger).not.toHaveBeenCalled();
  });

  it('the ledger row is written only AFTER the update succeeded: a failing update leaves no row and the error propagates', async () => {
    const r = receipt();
    jest.spyOn(T5.executions, 'update').mockRejectedValueOnce(new Error('connection reset'));
    await expect(applyExecutionApproval(r.id as string, ADMIN)).rejects.toThrow('connection reset');
    expect(m.ledger).not.toHaveBeenCalled();
    expect(row(r.id as string).status).toBe('pending_review');
  });

  it('two approvers: the flip is conditional on pending_review AT THE WRITE, so the loser reads not_pending and writes no second ledger row', async () => {
    const r = receipt();
    const update = jest.spyOn(T5.executions, 'update');
    const first = await applyExecutionApproval(r.id as string, ADMIN);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }), { where: { id: r.id, status: 'pending_review' } });
    // The loser read the row while it was still pending (the read is not what decides), then lost the write.
    (row(r.id as string) as { status: string }).status = 'pending_review';
    update.mockResolvedValueOnce([0]);
    const second = await applyExecutionApproval(r.id as string, ADMIN);
    expect([first.outcome, second.outcome]).toEqual(['approved', 'not_pending']);
    expect(m.ledger).toHaveBeenCalledTimes(1);
  });

  it('the flip releases nothing: a second receipt for the same person, brand and channel is still refused by the open-slot index', async () => {
    const r = receipt();
    await applyExecutionApproval(r.id as string, ADMIN);
    expect(() => receipt({ decision_id: 'd-2' })).toThrow(/growth_journey_executions_open_lead_unique/);
  });
});

describe('reject', () => {
  it('acceptance 4: flips pending_review -> rejected (terminal), one ledger row, and the person\'s open slot is released', async () => {
    const r = receipt();
    const out = await applyExecutionRejection(r.id as string, ADMIN);
    expect(out.outcome).toBe('rejected');
    expect(row(r.id as string)).toMatchObject({ status: 'rejected', status_reason: 'rejected_by_review', approved_by: null, approved_at: null });
    expect(m.audited).toHaveBeenCalledWith(CTX, 't-col', 'b-ent', expect.objectContaining({ action: 'reject' }));
    expect(m.ledger.mock.calls[0][0]).toBe('growth_journey.execution.rejected');
    expect(() => receipt({ decision_id: 'd-2' })).not.toThrow();
  });

  it('the same gates as approve: no admin, and a brand outside scope, both not_authorized', async () => {
    const r = receipt();
    expect(await applyExecutionRejection(r.id as string, undefined)).toEqual({ outcome: 'not_authorized' });
    m.audited.mockRejectedValueOnce(new TenantAccessError('Brand not in scope', 403, 'AuthorizationError'));
    expect(await applyExecutionRejection(r.id as string, ADMIN)).toEqual({ outcome: 'not_authorized' });
    expect(m.audited).toHaveBeenCalledWith(CTX, 't-col', 'b-ent', expect.objectContaining({ action: 'reject' }));
    expect(row(r.id as string).status).toBe('pending_review');
  });
});
