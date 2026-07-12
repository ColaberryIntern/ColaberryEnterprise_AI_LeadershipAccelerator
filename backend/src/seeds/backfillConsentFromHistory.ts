/**
 * backfillConsentFromHistory — one-time, idempotent backfill of the consent_records ledger
 * from existing signals (TBI P0-3, consent Phase 2). Makes the shadow consent gate meaningful
 * on day one (instead of an empty ledger) so that, when enforcement is later flipped on, legit
 * leads are already allowed and suppressed leads are already blocked — no pipeline pause.
 *
 *   A. `revoked`  — one row per (lead, channel) that has an UnsubscribeEvent (the authoritative
 *                   opt-out record). Belt-and-suspenders with the live suppression wiring.
 *   B. `granted`  — email `prior_relationship` (legitimate_interest) for leads with an inbound
 *                   `replied` InteractionOutcome AND not currently suppressed. A reply is a
 *                   defensible legitimate-interest basis for B2B email; opens/clicks are NOT used.
 *
 * Idempotent: skips a row if a matching consent record already exists. Safe to re-run.
 * Reversible: every row is tagged `source: 'backfill:*'` → `DELETE ... WHERE source LIKE 'backfill:%'`.
 * Read-then-append only; never updates or deletes existing data.
 */
import { connectDatabase } from '../config/database';
import '../models';
import Lead from '../models/Lead';
import UnsubscribeEvent from '../models/UnsubscribeEvent';
import InteractionOutcome from '../models/InteractionOutcome';
import ConsentRecord from '../models/ConsentRecord';
import type { ConsentChannel } from '../models/ConsentRecord';
import { recordConsent, normalizeEmail, ensureConsentSchema } from '../services/consentService';

const CHANNELS: ConsentChannel[] = ['email', 'sms', 'voice'];
const SUPPRESSED = ['unsubscribed', 'dnd', 'bounced'];

/** Channels an unsubscribe event covers: a specific one, or all three for 'all'/unknown. */
function channelsFor(raw: string): ConsentChannel[] {
  const c = CHANNELS.find((x) => x === raw);
  return c ? [c] : CHANNELS;
}

async function alreadyHas(
  subjectType: string, subjectId: string, channel: ConsentChannel, status: string, basis?: string
): Promise<boolean> {
  const where: Record<string, any> = { subject_type: subjectType, subject_id: subjectId, channel, status };
  if (basis) where.basis = basis;
  return !!(await ConsentRecord.findOne({ where }));
}

async function backfillRevoked(): Promise<number> {
  const events = (await UnsubscribeEvent.findAll({ attributes: ['lead_id', 'channel'], raw: true })) as Array<{ lead_id: number; channel: string }>;
  let count = 0;
  for (const e of events) {
    if (e.lead_id == null) continue;
    for (const ch of channelsFor(e.channel)) {
      if (await alreadyHas('lead', String(e.lead_id), ch, 'revoked')) continue;
      await recordConsent({
        subjectType: 'lead', subjectId: String(e.lead_id), channel: ch, status: 'revoked',
        source: 'backfill:unsubscribe_event', evidence: { original_channel: e.channel },
      });
      count++;
    }
  }
  return count;
}

async function backfillPriorRelationship(): Promise<number> {
  const replied = (await InteractionOutcome.findAll({
    attributes: ['lead_id'], where: { outcome: 'replied' } as any, group: ['lead_id'], raw: true,
  })) as Array<{ lead_id: number }>;
  let count = 0;
  for (const r of replied) {
    if (r.lead_id == null) continue;
    const lead = await Lead.findByPk(r.lead_id, { attributes: ['id', 'email', 'status'] });
    if (!lead || !lead.email) continue;
    if (SUPPRESSED.includes(lead.status)) continue; // don't grant to a suppressed lead
    const email = normalizeEmail(lead.email);
    if (!email) continue;
    if (await alreadyHas('email', email, 'email', 'granted', 'prior_relationship')) continue;
    await recordConsent({
      subjectType: 'email', subjectId: lead.email, channel: 'email', status: 'granted',
      basis: 'prior_relationship', jurisdiction: 'unknown',
      source: 'backfill:reply_history', evidence: { signal: 'inbound_reply' },
    });
    count++;
  }
  return count;
}

async function run(): Promise<void> {
  await connectDatabase();
  await ensureConsentSchema(); // defensive — table already exists in prod (PR #67)
  const revoked = await backfillRevoked();
  const granted = await backfillPriorRelationship();
  console.log(`[backfillConsent] revoked rows written: ${revoked} · prior_relationship granted: ${granted}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('[backfillConsent] failed:', err);
  process.exit(1);
});
