import { Campaign, CampaignLead } from '../models';
import { checkLeadSendable } from './communicationSafetyService';
import { validateCampaignForPublish } from './campaignLinkService';

/**
 * The activation readiness gate (C6.10).
 *
 * ## Why this blocks rather than advises
 *
 * There are two doors into "active" and only one of them was locked.
 *
 *   `campaignApprovalService.goLive()` calls `validateCampaignForPublish`, which requires
 *   `approval_status === 'approved'`, a governance config, a channel, a destination and an
 *   objective. That door is well guarded.
 *
 *   `campaignService.activateCampaign()` checks that `status` is draft or paused and
 *   NOTHING else. It never reads `approval_status`. It is what
 *   `POST /api/admin/campaigns/:id/activate` calls, and what the recovery service and the
 *   go-live scripts call.
 *
 * Measured in production on 2026-10-20: **six campaigns are `status='active'` with
 * `approval_status='draft'`**, including a cold outbound campaign. They are live having
 * never been approved. That is not a hypothetical hole; it is the current state, and it is
 * the reason this gate exists.
 *
 * ## What it will block, stated plainly
 *
 * The same measurement found **zero governance configs across all 46 campaigns**, so
 * `validateCampaignForPublish` currently fails for every campaign in the system. Wiring
 * this gate therefore stops activation until campaigns are regularized - including
 * recovery of the 22 paused campaigns whose approval_status is still draft.
 *
 * That is the correct behavior for a gate whose job is to stop an unapproved broad send,
 * and it is a real operational change, so it is reported in the artifact rather than
 * discovered by a watchdog at 3am.
 */

/** Who answers for a check, and how it is satisfied. */
export interface GateCheck {
  readonly id: string;
  readonly label: string;
  readonly owner: 'system' | 'Ali';
  readonly method: string;
  /** True when this service can decide it from data. False means a recorded attestation. */
  readonly automated: boolean;
}

export interface GateResult {
  readonly id: string;
  readonly label: string;
  readonly owner: GateCheck['owner'];
  readonly automated: boolean;
  readonly passed: boolean;
  readonly detail: string;
}

export interface GateReport {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly results: readonly GateResult[];
  readonly blockers: readonly string[];
  readonly allowed: boolean;
}

/** Thrown instead of activating. Carries the blockers so a caller can show them. */
export class ActivationBlockedError extends Error {
  constructor(public readonly report: GateReport) {
    super(`Activation blocked by ${report.blockers.length} readiness check(s): `
      + report.blockers.join('; '));
    this.name = 'ActivationBlockedError';
  }
}

/**
 * The eight checks the ticket names, plus the one the measurement forced.
 *
 * `approved` is not in the ticket's list because nobody expected it to be missing. It is
 * first here because it is the one that is actually failing in production today.
 */
export const GATE_CHECKS: readonly GateCheck[] = [
  {
    id: 'approved',
    label: 'Approved by a human, on the record',
    owner: 'Ali',
    method: 'campaigns.approval_status is "approved" or "live", with approved_by set.',
    automated: true,
  },
  {
    id: 'publishable',
    label: 'Passes the existing publish validation',
    owner: 'system',
    method: 'validateCampaignForPublish: channel, destination, objective, budget cap, '
      + 'governance config.',
    automated: true,
  },
  {
    id: 'contacts_sendable',
    label: 'Every enrolled contact is sendable',
    owner: 'system',
    method: 'checkLeadSendable per enrolled lead. Covers unsubscribed, dnd, bounced and '
      + 'test-source leads, and fails closed on a read error.',
    automated: true,
  },
  {
    id: 'send_limit',
    label: 'A send limit is configured',
    owner: 'Ali',
    method: 'channel_config.email.daily_limit or settings.max_leads_per_cycle is a positive '
      + 'number.',
    automated: true,
  },
  {
    id: 'sender_identity',
    label: 'The sender identity is set',
    owner: 'Ali',
    method: 'sender_profile_id is present.',
    automated: true,
  },
  {
    id: 'stop_rule',
    label: 'A numeric stop rule is recorded before the first send',
    owner: 'Ali',
    method: 'settings.stop_rule exists and carries at least one numeric threshold. C6.8 '
      + 'defines the tier-2 rule; this checks one was written down, not that it is wise.',
    automated: true,
  },
  {
    id: 'analytics_ready',
    label: 'Reply and outcome tracking is in place',
    owner: 'system',
    method: 'tracking_link is present.',
    automated: true,
  },
  {
    id: 'claims_approved',
    label: 'Every claim in the copy traces to the C0.6 registry',
    owner: 'Ali',
    method: 'MANUAL. The registry lives in the frontend and governs page copy; this service '
      + 'cannot read a campaign\'s rendered message and judge it. Attested in '
      + 'settings.activation_gate.claims_approved.',
    automated: false,
  },
  {
    id: 'dry_run_reviewed',
    label: 'A dry run was produced and read by a human',
    owner: 'Ali',
    method: 'MANUAL. Attested in settings.activation_gate.dry_run_reviewed.',
    automated: false,
  },
];

/** How many enrolled leads to test before concluding. Keeps the gate fast on a large list. */
const SENDABLE_SAMPLE_CEILING = 200;

function attestation(campaign: any, id: string): { by?: string; at?: string } | null {
  const gate = (campaign.settings || {}).activation_gate || {};
  const a = gate[id];
  return a && a.by && a.at ? a : null;
}

function hasPositiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Read-only. Runs every check and reports, without changing anything. */
export async function evaluateActivationReadiness(campaignId: string): Promise<GateReport> {
  const campaign: any = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const results: GateResult[] = [];
  const add = (check: GateCheck, passed: boolean, detail: string): void => {
    results.push({
      id: check.id,
      label: check.label,
      owner: check.owner,
      automated: check.automated,
      passed,
      detail,
    });
  };
  const check = (id: string): GateCheck => GATE_CHECKS.find((c) => c.id === id) as GateCheck;

  // 1. Approved, on the record.
  const status = campaign.approval_status;
  const approved = (status === 'approved' || status === 'live') && !!campaign.approved_by;
  add(check('approved'), approved,
    approved ? `approval_status=${status}, approved_by recorded`
      : `approval_status=${status || 'unset'}, approved_by=${campaign.approved_by || 'unset'}`);

  // 2. The existing validator, reused rather than restated.
  try {
    const v = await validateCampaignForPublish(campaignId);
    add(check('publishable'), v.valid, v.valid ? 'passes' : v.errors.join('; '));
  } catch (e: any) {
    add(check('publishable'), false, `validator threw: ${e.message}`);
  }

  // 3. Every enrolled contact sendable. Fails closed.
  try {
    const leads: any[] = await CampaignLead.findAll({
      where: { campaign_id: campaignId },
      attributes: ['lead_id'],
      limit: SENDABLE_SAMPLE_CEILING,
      raw: true,
    });
    const refused: string[] = [];
    for (const l of leads) {
      const s = await checkLeadSendable(l.lead_id, 'email');
      if (!s.sendable) refused.push(`${l.lead_id}:${s.reason || 'unknown'}`);
    }
    add(check('contacts_sendable'), refused.length === 0,
      refused.length === 0
        ? `${leads.length} enrolled contact(s) checked, all sendable`
        : `${refused.length} of ${leads.length} refused: ${refused.slice(0, 5).join(', ')}`);
  } catch (e: any) {
    add(check('contacts_sendable'), false, `check threw, failing closed: ${e.message}`);
  }

  // 4. A send limit.
  const cc = campaign.channel_config || {};
  const settings = campaign.settings || {};
  const limit = (cc.email && cc.email.daily_limit) ?? settings.max_leads_per_cycle;
  add(check('send_limit'), hasPositiveNumber(limit),
    hasPositiveNumber(limit) ? `limit=${limit}` : 'no daily limit or max_leads_per_cycle set');

  // 5. Sender identity.
  add(check('sender_identity'), !!campaign.sender_profile_id,
    campaign.sender_profile_id ? 'sender_profile_id set' : 'sender_profile_id is null');

  // 6. A stop rule, written down, with a number in it.
  const stop = settings.stop_rule;
  const stopOk = !!stop && JSON.stringify(stop).match(/\d/) !== null;
  add(check('stop_rule'), !!stopOk,
    stopOk ? 'settings.stop_rule recorded with a numeric threshold'
      : 'no settings.stop_rule with a number in it');

  // 7. Analytics.
  add(check('analytics_ready'), !!campaign.tracking_link,
    campaign.tracking_link ? 'tracking_link set' : 'no tracking_link');

  // 8 and 9. The manual ones, which need an attestation on the record.
  for (const id of ['claims_approved', 'dry_run_reviewed']) {
    const a = attestation(campaign, id);
    add(check(id), !!a, a ? `attested by ${a.by} at ${a.at}`
      : `no attestation in settings.activation_gate.${id}`);
  }

  const blockers = results.filter((r) => !r.passed).map((r) => `${r.id} (${r.detail})`);
  return {
    campaignId,
    campaignName: campaign.name,
    results,
    blockers,
    allowed: blockers.length === 0,
  };
}

/**
 * Throws unless every check passes. This is the function that makes the gate a gate.
 *
 * Deliberately has no bypass parameter. A gate with an escape hatch is a recommendation,
 * and the thing it is guarding against - a broad send that breaches a rule - is exactly
 * the situation in which somebody would reach for the hatch.
 */
export async function assertActivationAllowed(campaignId: string): Promise<GateReport> {
  const report = await evaluateActivationReadiness(campaignId);
  if (!report.allowed) throw new ActivationBlockedError(report);
  return report;
}
