import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * Who this person is COMMERCIALLY: which account they belong to, and what they pay.
 *
 * Ali, 2026-09-09: "Whether they have a business account or a client account etc..."
 *
 * ── THERE ARE FOUR DIFFERENT "ACCOUNTS", AND THEY ARE NOT THE SAME THING ────
 *
 *   owns          organizations.owner_enrollment_id — they run a company account
 *   memberOf      org_members.enrollment_id — they are seated under someone else's
 *   tenantContext lead_tenant_contexts — which BRAND acquired them
 *   sponsor       sponsors.contact_lead_id — they are a paying sponsor's contact
 *
 * Collapsing these into one "account" field would lose the distinction between
 * a person who owns a company account and a person occupying a seat in one,
 * which is exactly the distinction a commercial reader needs.
 *
 * ── THE FAILED-PAYMENT COUNT IS THE POINT OF THIS PANEL ─────────────────────
 *
 * The audit that produced this file found a live student carrying 13 failed
 * subscription rows against one active subscription. Nothing in the admin
 * surface showed it. In a subscription business that is the single most
 * actionable fact about a person, and it was invisible.
 */

export interface OrgOwnedRow {
  id: string;
  name: string | null;
  status: string | null;
  organizationType: string | null;
  memberCount: number;
  createdAt: string | null;
}

export interface OrgMembershipRow {
  orgId: string;
  orgName: string | null;
  role: string | null;
  team: string | null;
  inviteStatus: string | null;
  joinedAt: string | null;
}

export interface TenantContextRow {
  tenantName: string | null;
  relationshipType: string | null;
  status: string | null;
  firstTouchAt: string | null;
  lastTouchAt: string | null;
}

export interface AccountPanel {
  owns: OrgOwnedRow[];
  memberOf: OrgMembershipRow[];
  tenantContext: TenantContextRow[];
  sponsor: { companyName: string | null; billingStatus: string | null } | null;
  /**
   * The plainest answer to "what kind of account is this".
   * Derived, not stored — nothing in the schema records it directly.
   */
  accountType: 'organisation_owner' | 'organisation_member' | 'sponsor_contact' | 'individual';
}

export interface SubscriptionRow {
  id: string;
  plan: string | null;
  status: string | null;
  amountCents: number | null;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  appliedCreditCents: number | null;
  /** Whether this subscription reaches PaySimple at all. */
  hasPaysimpleCustomer: boolean;
}

export interface BillingDetailPanel {
  subscriptions: SubscriptionRow[];
  activeCount: number;
  failedCount: number;
  canceledCount: number;
  creditsCents: number;
  refundsCents: number;
  lastReminder: { kind: string | null; status: string | null; sentAt: string | null } | null;
  /**
   * The at-risk signal. Failed rows recorded since the most recent active one,
   * which is what distinguishes "had trouble once, now paying" from "actively
   * failing to collect".
   */
  failuresSinceLastSuccess: number;
  currentPeriodEnd: string | null;
}

export async function loadAccount(
  enrollmentIds: string[],
  leadIds: number[],
): Promise<AccountPanel | null> {
  if (enrollmentIds.length === 0 && leadIds.length === 0) return null;

  const owns = enrollmentIds.length
    ? await sequelize.query<OrgOwnedRow & { member_count: string }>(
        `SELECT o.id, o.name, o.status, o.organization_type AS "organizationType",
                o.created_at AS "createdAt",
                (SELECT COUNT(*) FROM org_members om WHERE om.org_id = o.id)::text AS member_count
         FROM organizations o WHERE o.owner_enrollment_id IN (:ids)
         ORDER BY o.created_at DESC`,
        { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
      )
    : [];

  const memberOf = enrollmentIds.length
    ? await sequelize.query<OrgMembershipRow>(
        `SELECT om.org_id AS "orgId", o.name AS "orgName", om.role, om.team,
                om.invite_status AS "inviteStatus", om.joined_at AS "joinedAt"
         FROM org_members om
         LEFT JOIN organizations o ON o.id = om.org_id
         WHERE om.enrollment_id IN (:ids)
         ORDER BY om.created_at DESC`,
        { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
      )
    : [];

  const tenantContext = leadIds.length
    ? await sequelize.query<TenantContextRow>(
        `SELECT t.name AS "tenantName", ltc.relationship_type AS "relationshipType",
                ltc.status, ltc.first_touch_at AS "firstTouchAt",
                ltc.last_touch_at AS "lastTouchAt"
         FROM lead_tenant_contexts ltc
         LEFT JOIN tenants t ON t.id = ltc.tenant_id
         WHERE ltc.lead_id IN (:leadIds)
         ORDER BY ltc.last_touch_at DESC NULLS LAST`,
        { type: QueryTypes.SELECT, replacements: { leadIds } },
      )
    : [];

  const sponsorRows = leadIds.length
    ? await sequelize.query<{ companyName: string | null; billingStatus: string | null }>(
        `SELECT company_name AS "companyName", billing_status::text AS "billingStatus"
         FROM sponsors WHERE contact_lead_id IN (:leadIds) LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { leadIds } },
      )
    : [];

  const sponsor = sponsorRows[0] ?? null;
  const accountType: AccountPanel['accountType'] = owns.length > 0
    ? 'organisation_owner'
    : sponsor
      ? 'sponsor_contact'
      : memberOf.length > 0
        ? 'organisation_member'
        : 'individual';

  return {
    owns: owns.map((o) => ({ ...o, memberCount: Number(o.member_count ?? 0) })),
    memberOf,
    tenantContext,
    sponsor,
    accountType,
  };
}

/** Subscription history, credits, refunds, and the failure signal. */
export async function loadBillingDetail(enrollmentIds: string[]): Promise<BillingDetailPanel | null> {
  if (enrollmentIds.length === 0) return null;
  const replacements = { ids: enrollmentIds };

  const [subs, money, reminder] = await Promise.all([
    sequelize.query<SubscriptionRow & { paysimple_customer_id: string | null }>(
      `SELECT id, plan, status, amount_cents AS "amountCents",
              started_at AS "startedAt", current_period_end AS "currentPeriodEnd",
              canceled_at AS "canceledAt", cancel_reason AS "cancelReason",
              applied_credit_cents AS "appliedCreditCents",
              paysimple_customer_id
       FROM subscriptions WHERE enrollment_id IN (:ids)
       ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ credits: string; refunds: string }>(
      `SELECT
         (SELECT COALESCE(SUM(amount_cents), 0) FROM account_credits
           WHERE enrollment_id IN (:ids))::text AS credits,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM refunds
           WHERE enrollment_id IN (:ids))::text AS refunds`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ kind: string | null; status: string | null; sentAt: string | null }>(
      `SELECT reminder_kind AS kind, status, sent_at AS "sentAt"
       FROM subscription_renewal_reminders WHERE enrollment_id IN (:ids)
       ORDER BY COALESCE(sent_at, claimed_at) DESC NULLS LAST LIMIT 1`,
      { type: QueryTypes.SELECT, replacements },
    ),
  ]);

  const rows: SubscriptionRow[] = subs.map((s) => ({
    id: s.id,
    plan: s.plan,
    status: s.status,
    amountCents: s.amountCents,
    startedAt: s.startedAt,
    currentPeriodEnd: s.currentPeriodEnd,
    canceledAt: s.canceledAt,
    cancelReason: s.cancelReason,
    appliedCreditCents: s.appliedCreditCents,
    hasPaysimpleCustomer: !!s.paysimple_customer_id,
  }));

  // Rows arrive newest first, so failures before the first 'active' are the
  // ones that have not yet been followed by a success.
  let failuresSinceLastSuccess = 0;
  for (const row of rows) {
    if (row.status === 'active') break;
    if (row.status === 'failed') failuresSinceLastSuccess += 1;
  }

  const active = rows.filter((r) => r.status === 'active');
  return {
    subscriptions: rows,
    activeCount: active.length,
    failedCount: rows.filter((r) => r.status === 'failed').length,
    canceledCount: rows.filter((r) => r.status === 'canceled').length,
    creditsCents: Number(money[0]?.credits ?? 0),
    refundsCents: Number(money[0]?.refunds ?? 0),
    lastReminder: reminder[0] ?? null,
    failuresSinceLastSuccess,
    currentPeriodEnd: active[0]?.currentPeriodEnd ?? null,
  };
}
