import { Op } from 'sequelize';
import { resolveExplorerGrowthFlags, type ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { BrandDomain, GrowthJourneyExecution, GrowthJourneyInAppNudge, ScheduledEmail } from '../../../models';
import type { GrowthJourneyExecutionAttributes, GrowthJourneyExecutionStatus } from '../../../models/GrowthJourneyExecution';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import { enrollLeadInSequence } from '../../sequenceService';
import { resolveContactEvidence } from '../governor/contactEvidence';
import type { JourneyProgramKind } from '../governor/types';
import { readDecisionView } from './decisionReads';
import { channelOpenness, inAppContentOf } from './planChecks';
import { readLeadAddress } from './planExecution';
import { assertTransition, recordReceiptTransition } from './receiptTransitions';
import { resolveExecutionHold, type ExecutionChannel } from './resolveExecutionMode';
import { validateCampaign } from './validateCampaign';

/**
 * The adapter (Phase 5 T510): the ONE file in the journey tree that may enrol.
 * The no-send scanner allowlists exactly this file for exactly
 * `enrollLeadInSequence` and the `sequenceService` import; the same literal
 * anywhere else in the tree still fails the guard, and any other send literal
 * in this file fails it too.
 *
 * ─── EXACTLY ONCE, BY THE DATABASE ──────────────────────────────────────────
 *
 *   1  CLAIM: `UPDATE … SET status = 'enrolling', claimed_at, attempts + 1
 *      WHERE id = :id AND status = 'approved'`. Zero rows means someone else
 *      has it, or it moved: `not_claimed`, and nothing else happens. Two
 *      executor runs on one receipt produce ONE enrolment because only one
 *      claim can succeed.
 *   2  RE-CHECK, NOW: the hold (flags, the kill switch, the pauses - T504's
 *      `resolveExecutionHold`); the decision the receipt came from; the
 *      contact evidence and the channel under the decision's own policy
 *      (planChecks); the campaign (T505's validator). A hold RETURNS the
 *      receipt to `approved` with the reason on it - a hold is not an
 *      attempt, so the count is restored - and the next run may try again. A
 *      closed channel or a refused campaign CANCELS it: a person who opted out
 *      between approval and now is never contacted, and their slot is freed.
 *   3  ACT: email → `enrollLeadInSequence(lead_id, sequence_id, campaign_id)`,
 *      three arguments - never `force` (it skips the sequence's own duplicate
 *      guard and the ramp gate), never without the campaign (the send path's
 *      journey hold, T511, is keyed on it) - then the step-0 `scheduled_emails`
 *      row is recorded on the receipt. in_app → the nudge row from the
 *      decision's approved asset; its href must be a relative portal path or
 *      an https URL on one of the brand's own registered hostnames.
 *   4  An exception is `failed`, its error class on the receipt, one log line
 *      through the redactor. Ali outreach is T511's: a receipt on that
 *      channel is returned to `approved`, untouched.
 *
 * No address in any row, reason, or line written here.
 */

export interface ExecuteApprovedArgs {
  receiptId: string;
  flags: GrowthJourneyFlags;
  explorerFlags?: ExplorerGrowthFlags;
  asOf: Date;
  /** The programme's kind, for the queue-capacity half of the evidence (T403). */
  programKind?: JourneyProgramKind;
}

export type ExecuteApprovedResult =
  | { status: 'enrolled'; receiptId: string; channel: ExecutionChannel; scheduled_email_id: string | null; nudge_id: string | null }
  | { status: 'not_claimed'; receiptId: string }
  | { status: 'blocked'; receiptId: string; reason: string }
  | { status: 'cancelled'; receiptId: string; reason: string }
  | { status: 'failed'; receiptId: string; error_class: string };

type Receipt = GrowthJourneyExecution;
const field = <T,>(r: Receipt, k: keyof GrowthJourneyExecutionAttributes): T => r.get(k as string) as T;

/** Step 3's href rule: a relative portal path, or https on one of the brand's own registered hostnames. */
export function nudgeHrefAllowed(href: string, brandHostnames: readonly string[]): boolean {
  if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')) return true;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && brandHostnames.map((h) => h.toLowerCase()).includes(url.hostname.toLowerCase());
}

/** A transition of the claimed receipt: the state machine's edge asserted, the row updated, one ledger row. */
async function move(receipt: Receipt, from: GrowthJourneyExecutionStatus, to: GrowthJourneyExecutionStatus, reason: string, patch: Partial<GrowthJourneyExecutionAttributes>, extra: Record<string, string | number | boolean | null | string[]> = {}): Promise<void> {
  assertTransition(from, to);
  const id = field<string>(receipt, 'id');
  await GrowthJourneyExecution.update({ status: to, status_reason: reason, ...patch }, { where: { id } });
  await recordReceiptTransition(id, { tenant_id: field<string>(receipt, 'tenant_id'), brand_id: field<string>(receipt, 'brand_id') }, from, to, reason, {
    decision_id: field<string>(receipt, 'decision_id'), channel: field<string>(receipt, 'channel'), ...extra,
  });
}

export async function executeApproved(args: ExecuteApprovedArgs): Promise<ExecuteApprovedResult> {
  const { receiptId, asOf } = args;

  // 1. The claim. The read is only for the attempt count; the WHERE is what decides.
  const before = await GrowthJourneyExecution.findOne({ where: { id: receiptId } });
  if (!before) return { status: 'not_claimed', receiptId };
  const attemptsBefore = Number(field<number | null>(before, 'attempts') ?? 0);
  const [claimed] = await GrowthJourneyExecution.update(
    { status: 'enrolling', claimed_at: asOf, attempts: attemptsBefore + 1 },
    { where: { id: receiptId, status: 'approved' } },
  );
  if (claimed === 0) return { status: 'not_claimed', receiptId };
  const receipt = (await GrowthJourneyExecution.findOne({ where: { id: receiptId } })) ?? before;
  const scope = { tenant_id: field<string>(receipt, 'tenant_id'), brand_id: field<string>(receipt, 'brand_id') };
  const channel = field<ExecutionChannel>(receipt, 'channel');
  const decisionId = field<string>(receipt, 'decision_id');
  await recordReceiptTransition(receiptId, scope, 'approved', 'enrolling', 'claimed', { decision_id: decisionId, channel, attempts: attemptsBefore + 1 });

  const blocked = async (reason: string, controlIds: string[] = []): Promise<ExecuteApprovedResult> => {
    // Returned, not failed: a hold is not an attempt.
    await move(receipt, 'enrolling', 'approved', `blocked:${reason}`, { attempts: attemptsBefore, claimed_at: null, control_ids: controlIds.length ? controlIds : field<string[]>(receipt, 'control_ids') });
    return { status: 'blocked', receiptId, reason };
  };
  const cancelled = async (reason: string): Promise<ExecuteApprovedResult> => {
    await move(receipt, 'enrolling', 'cancelled', reason, {});
    return { status: 'cancelled', receiptId, reason };
  };

  try {
    // 2. Re-check, now.
    const programId = field<string | null>(receipt, 'program_id');
    if (!programId) return cancelled('no_program');
    const leadId = field<number | null>(receipt, 'lead_id');
    const hold = await resolveExecutionHold({
      tenantId: scope.tenant_id, brandId: scope.brand_id, programId, channel,
      subjectRef: field<string>(receipt, 'subject_ref'), leadId, asOf,
      flags: args.flags, explorerFlags: args.explorerFlags ?? resolveExplorerGrowthFlags(),
    });
    if (hold.held) return blocked(hold.reason ?? 'held', hold.control_ids);
    if (channel === 'ali_outreach') return blocked('adapter_channel_unsupported');

    const decision = await readDecisionView(decisionId);
    if (!decision) return cancelled('decision_missing');

    let address: { email: string | null; phone: string | null } | null = { email: null, phone: null };
    if (leadId !== null) {
      address = await readLeadAddress(leadId);
      if (!address) return cancelled('lead_unreadable');
    }
    const evidence = await resolveContactEvidence({ subject: { lead_id: leadId, email: address.email, phone: address.phone }, brandId: scope.brand_id, tenantId: scope.tenant_id, asOf, programKind: args.programKind });
    const open = channelOpenness(channel, evidence);
    if (!open.open) return cancelled(open.reason);

    // 3. Act on the channel.
    if (channel === 'in_app') {
      const enrollmentId = field<string | null>(receipt, 'enrollment_id');
      if (!enrollmentId) return cancelled('in_app_requires_enrollment');
      const content = inAppContentOf(decision.selected_content);
      if (!content.ok) return cancelled('in_app_no_approved_content');
      const hosts = (await BrandDomain.findAll({ where: { brand_id: scope.brand_id }, attributes: ['hostname'] })).map((d) => String(d.get('hostname')));
      if (!nudgeHrefAllowed(content.url, hosts)) return cancelled('nudge_href_invalid');
      const first = (decision.selected_content?.assets as Array<{ asset_type?: unknown }> | undefined)?.[0];
      const nudge = await GrowthJourneyInAppNudge.create({
        tenant_id: scope.tenant_id, brand_id: scope.brand_id, program_id: programId, enrollment_id: enrollmentId, execution_id: receiptId,
        title: content.title, href: content.url, purpose: typeof first?.asset_type === 'string' ? first.asset_type.slice(0, 32) : null,
      });
      const nudgeId = String(nudge.get('id'));
      await move(receipt, 'enrolling', 'enrolled', 'nudge_written', { nudge_id: nudgeId }, { nudge_id: nudgeId });
      return { status: 'enrolled', receiptId, channel, scheduled_email_id: null, nudge_id: nudgeId };
    }

    if (leadId === null) return cancelled('email_requires_lead');
    const validated = await validateCampaign({ campaignKey: field<string | null>(receipt, 'campaign_key'), tenantId: scope.tenant_id, brandId: scope.brand_id, mode: field<'review' | 'limited'>(receipt, 'mode') });
    if (!validated.ok) return cancelled(validated.reason);
    const campaign = validated.campaign;
    // Three arguments: the lead, the sequence, the campaign. Never `force`; never without the campaign.
    await enrollLeadInSequence(leadId, campaign.sequence_id, campaign.id);
    const step0 = await ScheduledEmail.findOne({
      where: { lead_id: leadId, campaign_id: campaign.id, created_at: { [Op.gte]: asOf } },
      attributes: ['id'],
      order: [['created_at', 'ASC']],
    });
    const scheduledEmailId = step0 ? String(step0.get('id')) : null;
    await move(receipt, 'enrolling', 'enrolled', scheduledEmailId ? 'enrolled' : 'enrolled_no_step0_row', { scheduled_email_id: scheduledEmailId, campaign_id: campaign.id, sequence_id: campaign.sequence_id }, { scheduled_email_id: scheduledEmailId, campaign_id: campaign.id });
    return { status: 'enrolled', receiptId, channel, scheduled_email_id: scheduledEmailId, nudge_id: null };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    console.error(redactForLogs(JSON.stringify({
      level: 'error', service: 'growth-journey', event: 'growth_journey.execution.failed', outcome: 'failure', error_class,
      context: { tenant_id: scope.tenant_id, brand_id: scope.brand_id, execution_id: receiptId, decision_id: decisionId, channel },
    })));
    try {
      await move(receipt, 'enrolling', 'failed', `failed:${error_class}`, { last_error_class: error_class });
    } catch (inner: unknown) {
      console.error(redactForLogs(JSON.stringify({ level: 'error', service: 'growth-journey', event: 'growth_journey.execution.fail_write_failed', outcome: 'failure', error_class: classifyError(inner), context: { execution_id: receiptId } })));
    }
    return { status: 'failed', receiptId, error_class };
  }
}
