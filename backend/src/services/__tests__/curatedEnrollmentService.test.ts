/**
 * C6.6 acceptance criteria, as tests.
 *
 * The ticket names five things that must be proven rather than asserted in prose:
 * activation without approval is impossible, unverified contacts are rejected, a dry run
 * produces a full plan with no sends, dedup and DND are respected, and apolloService.ts is
 * untouched. There is one block below for each, plus the one that matters most and is not
 * on the list: that an approval of one list cannot be used to enroll a different one.
 */
const m = {
  campaignFindOne: jest.fn(),
  leadFindOne: jest.fn(),
  campaignLeadFindOne: jest.fn(),
  enroll: jest.fn(),
  sendable: jest.fn(),
  apollo: jest.fn(),
  logActivity: jest.fn(),
};

jest.mock('../../models', () => ({
  Campaign: { findOne: (...a: unknown[]) => m.campaignFindOne(...a) },
  CampaignLead: { findOne: (...a: unknown[]) => m.campaignLeadFindOne(...a) },
  Lead: { findOne: (...a: unknown[]) => m.leadFindOne(...a) },
}));
jest.mock('../aliPersonalOutreachService', () => ({
  CAMPAIGN_NAME: 'Ali Personal Outreach',
  CAMPAIGN_TYPE: 'executive_outreach',
}));
jest.mock('../campaignService', () => ({
  enrollLeadsInCampaign: (...a: unknown[]) => m.enroll(...a),
}));
jest.mock('../communicationSafetyService', () => ({
  checkLeadSendable: (...a: unknown[]) => m.sendable(...a),
}));
jest.mock('../apolloCreditGuard', () => ({
  getApolloUsageToday: (...a: unknown[]) => m.apollo(...a),
}));
jest.mock('../activityService', () => ({ logActivity: (...a: unknown[]) => m.logActivity(...a) }));

import fs from 'fs';
import path from 'path';
import {
  CuratedEnrollmentError,
  MAX_CURATED_PER_RUN,
  executeCuratedEnrollment,
  planCuratedEnrollment,
} from '../curatedEnrollmentService';
import type { CuratedContact } from '../../schemas/curatedEnrollmentSchema';

const CAMPAIGN = { id: 'camp-1', name: 'Ali Personal Outreach', type: 'executive_outreach', status: 'active' };

function contact(over: Partial<CuratedContact> = {}): CuratedContact {
  return {
    email: 'dean@example.edu',
    name: 'A Dean',
    company: 'Example University',
    title: 'Dean of Continuing Education',
    emailStatus: 'verified',
    verificationSource: 'apollo',
    verifiedAt: '2026-10-15T00:00:00.000Z',
    ...over,
  } as CuratedContact;
}

/** The happy path every test starts from: campaign found, lead exists, not enrolled, sendable. */
function allClear() {
  m.campaignFindOne.mockResolvedValue(CAMPAIGN);
  m.leadFindOne.mockResolvedValue({ id: 7 });
  m.campaignLeadFindOne.mockResolvedValue(null);
  m.sendable.mockResolvedValue({ sendable: true });
  m.apollo.mockResolvedValue({ date: '2026-10-19', count: 10, limit: 250, perRun: 0, perRunLimit: 50 });
  m.enroll.mockResolvedValue([{ leadId: 7, status: 'enrolled' }]);
  m.logActivity.mockResolvedValue({});
}

beforeEach(() => {
  jest.clearAllMocks();
  allClear();
});

describe('a dry run produces a full plan and writes nothing', () => {
  it('returns a decision for every contact and never enrolls', async () => {
    const plan = await planCuratedEnrollment([contact(), contact({ email: 'two@example.edu' })]);

    expect(plan.decisions).toHaveLength(2);
    expect(plan.counts).toEqual({ enroll: 2, reject: 0 });
    expect(plan.planHash).toHaveLength(64);
    expect(m.enroll).not.toHaveBeenCalled();
    expect(m.logActivity).not.toHaveBeenCalled();
  });

  it('tells the approver whether enrolling will schedule sends', async () => {
    const active = await planCuratedEnrollment([contact()]);
    expect(active.campaignIsActive).toBe(true);

    m.campaignFindOne.mockResolvedValue({ ...CAMPAIGN, status: 'draft' });
    const draft = await planCuratedEnrollment([contact()]);
    expect(draft.campaignIsActive).toBe(false);
  });

  it('refuses an oversized list instead of silently dropping the tail', async () => {
    const many = Array.from({ length: MAX_CURATED_PER_RUN + 1 }, (_, i) => contact({ email: `p${i}@example.edu` }));
    await expect(planCuratedEnrollment(many)).rejects.toMatchObject({ code: 'too_many_contacts' });
    expect(m.enroll).not.toHaveBeenCalled();
  });
});

describe('unverified contacts are rejected', () => {
  it.each(['likely_to_engage', 'unverified', 'unavailable'] as const)('rejects %s', async (status) => {
    const plan = await planCuratedEnrollment([contact({ emailStatus: status })]);

    expect(plan.counts).toEqual({ enroll: 0, reject: 1 });
    expect(plan.decisions[0].reason).toBe(`unverified_contact:${status}`);
  });

  it('rejects before looking the lead up, so the reason is the actionable one', async () => {
    await planCuratedEnrollment([contact({ emailStatus: 'unverified' })]);
    expect(m.leadFindOne).not.toHaveBeenCalled();
  });

  it('enrolls nothing when every contact is unverified, even with a valid approval', async () => {
    const contacts = [contact({ emailStatus: 'unverified' })];
    const plan = await planCuratedEnrollment(contacts);

    const result = await executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    });

    expect(result.enrolled).toEqual([]);
    expect(m.enroll).not.toHaveBeenCalled();
  });
});

describe('activation without approval is impossible', () => {
  it('refuses with no approval at all', async () => {
    await expect(executeCuratedEnrollment([contact()])).rejects.toBeInstanceOf(CuratedEnrollmentError);
    await expect(executeCuratedEnrollment([contact()])).rejects.toMatchObject({ code: 'approval_required' });
    expect(m.enroll).not.toHaveBeenCalled();
    expect(m.logActivity).not.toHaveBeenCalled();
  });

  it('refuses an approval whose hash does not match this list', async () => {
    await expect(executeCuratedEnrollment([contact()], {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: 'f'.repeat(64),
    })).rejects.toMatchObject({ code: 'approval_plan_mismatch' });
    expect(m.enroll).not.toHaveBeenCalled();
  });

  it('enrolls once the approval matches', async () => {
    const contacts = [contact()];
    const plan = await planCuratedEnrollment(contacts);

    const result = await executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    });

    expect(m.enroll).toHaveBeenCalledWith('camp-1', [7]);
    expect(result.enrolled).toEqual([{ leadId: 7, status: 'enrolled' }]);
    expect(result.approvedBy).toBe('admin-1');
  });

  it('never changes the campaign status and never spends an Apollo credit', async () => {
    const contacts = [contact()];
    const plan = await planCuratedEnrollment(contacts);
    await executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    });

    // The campaign object the service received is the mock's; if it had been mutated or
    // saved, these would show it. There is no update/save call to make.
    expect(CAMPAIGN.status).toBe('active');
    expect((CAMPAIGN as any).update).toBeUndefined();
  });
});

describe('the approval is bound to the exact list it approved', () => {
  it('is void once a contact becomes unsendable between review and execution', async () => {
    const contacts = [contact()];
    const plan = await planCuratedEnrollment(contacts);

    // Somebody unsubscribes in the gap. The recomputed plan differs, so the hash differs.
    m.sendable.mockResolvedValue({ sendable: false, reason: 'unsubscribed' });

    await expect(executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    })).rejects.toMatchObject({ code: 'approval_plan_mismatch' });
    expect(m.enroll).not.toHaveBeenCalled();
  });

  it('cannot be replayed against a different list', async () => {
    const approved = [contact()];
    const plan = await planCuratedEnrollment(approved);

    const swapped = [contact({ email: 'someone.else@example.edu' })];
    await expect(executeCuratedEnrollment(swapped, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    })).rejects.toMatchObject({ code: 'approval_plan_mismatch' });
  });

  it('does not depend on the order the contacts arrive in', async () => {
    const a = contact({ email: 'a@example.edu' });
    const b = contact({ email: 'b@example.edu' });
    m.leadFindOne.mockImplementation(async (q: any) => ({ id: q.where.email[Object.getOwnPropertySymbols(q.where.email)[0]] === 'a@example.edu' ? 1 : 2 }));

    const one = await planCuratedEnrollment([a, b]);
    const two = await planCuratedEnrollment([b, a]);
    expect(one.planHash).toBe(two.planHash);
  });
});

describe('dedup and DND are respected', () => {
  it('rejects a lead already enrolled in this campaign', async () => {
    m.campaignLeadFindOne.mockResolvedValue({ id: 'cl-1' });
    const plan = await planCuratedEnrollment([contact()]);

    expect(plan.decisions[0]).toMatchObject({ decision: 'reject', reason: 'already_enrolled', leadId: 7 });
    expect(plan.counts.enroll).toBe(0);
  });

  it('rejects the second appearance of the same email, case-insensitively', async () => {
    const plan = await planCuratedEnrollment([contact(), contact({ email: 'DEAN@Example.EDU' })]);

    expect(plan.counts).toEqual({ enroll: 1, reject: 1 });
    expect(plan.decisions[1].reason).toBe('duplicate_in_list');
  });

  it('rejects a contact with no lead record rather than creating one', async () => {
    m.leadFindOne.mockResolvedValue(null);
    const plan = await planCuratedEnrollment([contact()]);

    expect(plan.decisions[0]).toMatchObject({ decision: 'reject', reason: 'lead_not_found' });
  });

  it.each([
    ['unsubscribed', 'suppressed:unsubscribed'],
    ['dnd', 'suppressed:dnd'],
    ['bounced', 'suppressed:bounced'],
    ['lead_check_failed', 'suppressed:lead_check_failed'],
  ])('rejects a %s lead', async (reason, expected) => {
    m.sendable.mockResolvedValue({ sendable: false, reason });
    const plan = await planCuratedEnrollment([contact()]);

    expect(plan.decisions[0]).toMatchObject({ decision: 'reject', reason: expected });
    expect(plan.counts.enroll).toBe(0);
  });

  it('asks the suppression gate about the email channel specifically', async () => {
    await planCuratedEnrollment([contact()]);
    expect(m.sendable).toHaveBeenCalledWith(7, 'email');
  });
});

describe('the Apollo quota is checked and fails closed', () => {
  it('refuses to execute when the counter is unreadable', async () => {
    m.apollo.mockResolvedValue({ date: '2026-10-19', count: -1, limit: 250, perRun: 0, perRunLimit: 50 });
    const contacts = [contact()];
    const plan = await planCuratedEnrollment(contacts);

    await expect(executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    })).rejects.toMatchObject({ code: 'apollo_quota_unavailable' });
    expect(m.enroll).not.toHaveBeenCalled();
  });

  it('refuses to execute when the daily cap is reached', async () => {
    m.apollo.mockResolvedValue({ date: '2026-10-19', count: 250, limit: 250, perRun: 0, perRunLimit: 50 });
    const contacts = [contact()];
    const plan = await planCuratedEnrollment(contacts);

    await expect(executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    })).rejects.toMatchObject({ code: 'apollo_quota_exhausted' });
  });

  it('reports usage in the plan so a dry run shows it before approval', async () => {
    const plan = await planCuratedEnrollment([contact()]);
    expect(plan.apollo).toEqual({ count: 10, limit: 250, readable: true });
  });
});

describe('the audit trail', () => {
  it('records the approver, the plan hash and the verification provenance per lead', async () => {
    const contacts = [contact()];
    const plan = await planCuratedEnrollment(contacts);
    await executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    });

    expect(m.logActivity).toHaveBeenCalledTimes(1);
    expect(m.logActivity.mock.calls[0][0]).toMatchObject({
      lead_id: 7,
      type: 'curated_enrollment',
      metadata: {
        campaign_id: 'camp-1',
        plan_hash: plan.planHash,
        approved_by: 'admin-1',
        enrollment_status: 'enrolled',
        contact: { email_status: 'verified', verification_source: 'apollo' },
      },
    });
  });

  it('does not fail the enrollment when the audit write throws', async () => {
    m.logActivity.mockRejectedValue(new Error('activity table unavailable'));
    const contacts = [contact()];
    const plan = await planCuratedEnrollment(contacts);

    const result = await executeCuratedEnrollment(contacts, {
      approvedBy: 'admin-1', approvedAt: '2026-10-19T00:00:00.000Z', planHash: plan.planHash,
    });
    expect(result.enrolled).toHaveLength(1);
  });
});

describe('apolloService is not touched', () => {
  const RAW = fs.readFileSync(
    path.join(__dirname, '..', 'curatedEnrollmentService.ts'),
    'utf8',
  );
  // Comments are stripped before scanning. The first version of these guards failed on the
  // service's own header, which explains that it never calls claimApolloCall or
  // activateCampaign - a guard that cannot tell a mention from a call reports the
  // documentation as the violation, and the fix is to stop looking at prose.
  const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('does not import apolloService', () => {
    expect(CODE).not.toMatch(/from '\.\/apolloService'/);
  });

  it('does not spend an Apollo credit', () => {
    // claimApolloCall is the only function that increments the counter. Reading usage is
    // getApolloUsageToday, which costs nothing.
    expect(CODE).not.toContain('claimApolloCall');
    expect(CODE).toContain('getApolloUsageToday');
  });

  it('does not activate a campaign', () => {
    expect(CODE).not.toContain('activateCampaign');
  });

  it('still scans real code, not an empty string', () => {
    // Guards the guard: if the comment-stripping ever ate the file, the three checks above
    // would pass vacuously.
    expect(CODE).toContain('export async function executeCuratedEnrollment');
    expect(CODE.length).toBeGreaterThan(1000);
  });
});
