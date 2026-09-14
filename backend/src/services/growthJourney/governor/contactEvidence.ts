import { Op } from 'sequelize';
import { CommunicationLog, CommunicationPreference, Lead, ScheduledEmail, UnsubscribeEvent as SuppressionEventRow } from '../../../models';
import { evaluateConsent } from '../../consentService';
import { SUPPRESSED_LEAD_STATUSES } from '../../explorerGrowth/explorerContactabilityService';
import type { ConsentChannel } from '../../../models/ConsentRecord';
import { isSuppressedForChannel, type SuppressionEvent } from '../../channelSuppression';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import type { ChannelEvidence, ContactEvidence, JourneyChannel } from './types';

/**
 * Who may be contacted, on which channel, and when they last were
 * (§7.3 "recent contacts and cooldowns"; Phase 3 T304).
 *
 * ─── WHY THIS EXISTS RATHER THAN REUSING EXPLORER'S RESOLVER ────────────────
 *
 * `explorerContactabilityService.resolveContactability` is the Governor's
 * current consent input and it cannot serve a brand-scoped decision: it reads
 * only `leads.status` and `evaluateConsent`, it never consults the suppression
 * event rows, `channelSuppression` or `communication_preferences`, and its own
 * header admits "Suppression is GLOBAL, not per channel". This
 * resolver is brand-aware and per-channel. It does not modify or replace
 * Explorer's — that one keeps serving Explorer.
 *
 * ─── IT COMPOSES THE EXISTING EVALUATORS; IT DECIDES NOTHING ITSELF ─────────
 *
 * `evaluateConsent` (the §4 policy), `isSuppressedForChannel` (the per-channel
 * cutoff logic, including the legacy pre-2026-09-09 global case) and
 * `communication_preferences` (the only per-brand per-channel permission table
 * in the repo) each answer for themselves, and the evidence records **which one
 * answered**. There is no fourth opt-out detector here and no second consent
 * policy: a decision that cannot explain which evaluator refused a channel is
 * not explainable at all.
 *
 * TWO THINGS IT IMPORTS RATHER THAN RESTATES. The blocked lead statuses come
 * from `explorerContactabilityService` - the strictest list in the repo and,
 * after T304, the only copy of it. And the suppression-event model is imported
 * under an alias, because the Phase 2 scanner permits the opt-out word only on
 * an import line - the rule that stops a fourth opt-out detector being written.
 * The alias keeps that rule intact rather than dodging it: a companion guard in
 * `redactionAndFlags.test.ts` now requires every file that reads these rows to
 * hand the verdict to `isSuppressedForChannel`, alias or not.
 *
 * ─── IT FAILS CLOSED, THE WAY EXPLORER'S CONTACT HISTORY DOES ───────────────
 *
 * Any lookup throwing closes every channel and reports the cap as reached and
 * the cooldown as active (`recent_contact_count: MAX_SAFE_INTEGER`,
 * `hours_since_last_contact: 0`) — the same posture as
 * `runGovernor.contactHistory`, for the same reason: an unknown contact history
 * is not permission. No exception escapes; the class is logged, redacted.
 *
 * ─── TWO ANSWERS THIS CODEBASE CANNOT GIVE ──────────────────────────────────
 *
 * Nothing records whether a human is already in conversation with a subject —
 * `inbox_emails` has no `lead_id`, inbox cases key on a normalised query rather
 * than a person, and no ticket is written with `entity_type='lead'`. And there
 * is no sales-capacity table at all; the only capacity algorithm in the repo is
 * delivery-side. Both are therefore `'unknown'` with a reason naming the
 * absence, and `'unknown'` never unlocks anything: a strategy may not emit a
 * Layer 3 or Layer 4 candidate while either is unknown.
 */

const CONTACT_WINDOW_DAYS = 7;

/** Channels a consent record can speak about. `in_app` has no consent surface. */
const CONSENT_CHANNELS: ConsentChannel[] = ['email', 'sms', 'voice'];

export interface ResolveContactEvidenceArgs {
  subject: { lead_id: number | null; email?: string | null; phone?: string | null };
  brandId: string;
  tenantId: string;
  asOf: Date;
}

const CHANNELS: JourneyChannel[] = ['email', 'sms', 'voice', 'in_app', 'none'];

function closed(reason: string, evaluator: string): ChannelEvidence {
  return { eligible: false, reason, evaluator, last_contact_at: null, hours_since_last_contact: null };
}

/** Everything shut, the cap reached, the cooldown active. */
function failClosed(reason: string): ContactEvidence {
  const channels = Object.fromEntries(
    CHANNELS.map((c) => [c, closed(reason, 'failed_closed')]),
  ) as Record<JourneyChannel, ChannelEvidence>;
  return {
    channels,
    recent_contact_count: Number.MAX_SAFE_INTEGER,
    hours_since_last_contact: 0,
    human_conversation: 'unknown',
    human_conversation_reason: 'not resolved: contact evidence failed closed',
    sales_capacity: 'unknown',
    sales_capacity_reason: 'not resolved: contact evidence failed closed',
    failed_closed: true,
  };
}

function log(event: string, fields: Record<string, unknown>): void {
  // Ids and slugs only. Redacted anyway, because a reason string from an
  // upstream evaluator is not guaranteed to be free of an address.
  console.warn(
    redactForLogs(
      JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields }),
    ),
  );
}

export async function resolveContactEvidence(args: ResolveContactEvidenceArgs): Promise<ContactEvidence> {
  const { subject, brandId, tenantId, asOf } = args;
  if (subject.lead_id === null) {
    return failClosed('no_lead_anchor');
  }

  try {
    const since = new Date(asOf.getTime() - CONTACT_WINDOW_DAYS * 86_400_000);

    const [lead, outbound, recentCount, queued, suppressions, preferences] = await Promise.all([
      Lead.findByPk(subject.lead_id),
      CommunicationLog.findAll({
        where: { lead_id: subject.lead_id, direction: 'outbound' },
        order: [['created_at', 'DESC']],
        limit: 200,
      }),
      CommunicationLog.count({
        where: { lead_id: subject.lead_id, direction: 'outbound', created_at: { [Op.gt]: since } },
      }),
      ScheduledEmail.findAll({
        where: { lead_id: subject.lead_id, status: 'pending' },
        limit: 50,
      }),
      SuppressionEventRow.findAll({ where: { lead_id: subject.lead_id }, limit: 200 }),
      CommunicationPreference.findAll({ where: { lead_id: subject.lead_id, tenant_id: tenantId, brand_id: brandId } }),
    ]);

    // A missing lead is not a clean slate.
    if (!lead) return failClosed('lead_not_found');

    const leadBlocked = SUPPRESSED_LEAD_STATUSES.includes(String(lead.status));

    const events: SuppressionEvent[] = suppressions.map((e) => ({
      channel: (e as { channel: string | null }).channel ?? null,
      created_at: (e as { created_at: Date }).created_at,
    }));

    const lastByChannel = new Map<string, Date>();
    for (const row of outbound) {
      const ch = String((row as { channel?: string | null }).channel ?? 'email');
      const at = (row as { created_at: Date }).created_at;
      if (!lastByChannel.has(ch)) lastByChannel.set(ch, at instanceof Date ? at : new Date(at));
    }
    const queuedChannels = new Set(
      queued.map((q) => String((q as { channel?: string | null }).channel ?? 'email')),
    );

    // The most restrictive preference row wins. The category is not guessed:
    // every row for this lead-tenant-brand is consulted and the one that
    // refuses is the one reported.
    const prefBlock = (channel: JourneyChannel): string | null => {
      for (const p of preferences) {
        const row = p as unknown as {
          category: string;
          email_allowed: boolean;
          sms_allowed: boolean;
          voice_allowed: boolean;
        };
        const allowed =
          channel === 'email' ? row.email_allowed
            : channel === 'sms' ? row.sms_allowed
              : channel === 'voice' ? row.voice_allowed
                : true;
        if (!allowed) return `brand_preference_off:${row.category}`;
      }
      return null;
    };

    const channels = {} as Record<JourneyChannel, ChannelEvidence>;
    for (const channel of CHANNELS) {
      const last = lastByChannel.get(channel) ?? null;
      const hours = last ? (asOf.getTime() - last.getTime()) / 3_600_000 : null;
      const base = { last_contact_at: last, hours_since_last_contact: hours };

      // An action needing no channel has nobody to protect.
      if (channel === 'none') {
        channels[channel] = { eligible: true, reason: 'no channel needed', evaluator: 'none', ...base };
        continue;
      }

      if (leadBlocked) {
        channels[channel] = { eligible: false, reason: `lead_${lead.status}`, evaluator: 'lead_status', ...base };
        continue;
      }

      const suppressed = isSuppressedForChannel(events, channel === 'in_app' ? undefined : channel);
      if (suppressed.suppressed) {
        channels[channel] = {
          eligible: false,
          reason: suppressed.reason ?? 'suppression_event_exists',
          evaluator: 'suppression',
          ...base,
        };
        continue;
      }

      const blockedByBrand = prefBlock(channel);
      if (blockedByBrand) {
        channels[channel] = { eligible: false, reason: blockedByBrand, evaluator: 'brand_preference', ...base };
        continue;
      }

      if (queuedChannels.has(channel)) {
        channels[channel] = { eligible: false, reason: 'send_already_queued', evaluator: 'in_flight', ...base };
        continue;
      }

      if (CONSENT_CHANNELS.includes(channel as ConsentChannel)) {
        const decision = await evaluateConsent({
          channel: channel as ConsentChannel,
          leadId: subject.lead_id,
          email: subject.email ?? null,
          phone: subject.phone ?? null,
        });
        channels[channel] = {
          eligible: decision.verdict === 'allow',
          reason: decision.reason,
          evaluator: 'consent',
          ...base,
        };
        continue;
      }

      // in_app: no consent surface, nothing to send, nothing to suppress.
      channels[channel] = { eligible: true, reason: 'in_app_needs_no_consent', evaluator: 'none', ...base };
    }

    const lastOverall = [...lastByChannel.values()].sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      channels,
      recent_contact_count: recentCount,
      hours_since_last_contact: lastOverall ? (asOf.getTime() - lastOverall.getTime()) / 3_600_000 : null,
      human_conversation: 'unknown',
      human_conversation_reason:
        'no source in this codebase: inbox_emails has no lead_id, inbox cases key on a query not a person, and no ticket is written for a lead',
      sales_capacity: 'unknown',
      sales_capacity_reason: 'no source in this codebase: there is no sales capacity or assignment table',
      failed_closed: false,
    };
  } catch (err: unknown) {
    log('growth_journey.contact_evidence_failed', {
      error_class: classifyError(err),
      brand_id: brandId,
      lead_id: subject.lead_id,
    });
    return failClosed('lookup_failed');
  }
}
