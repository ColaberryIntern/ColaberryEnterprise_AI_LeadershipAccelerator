import { Lead, Activity, LeadTemperatureHistory } from '../models';
import { logActivity } from './activityService';

/**
 * openHouseIngestService — fold last night's Open House event data into the CRM.
 *
 * Three signals per person, strongest wins:
 *   registered (Eventbrite) → warm
 *   attended  (joined the live event app) → hot
 *   paid      ($50 deposit or a subscription) → qualified
 *
 * Each participant is upserted as a Lead (source `open_house`, so the admin
 * Leads list can filter to them), their interest level (lead_temperature) is
 * RAISED to the signal's level — never lowered, so a lead who is already hotter
 * for other reasons is untouched — with a LeadTemperatureHistory entry, and one
 * "Open House" Activity records what they did.
 *
 * Idempotent: leads are matched by email, temperature only moves up, and the
 * activity is written once (skipped if already present) — safe to re-run.
 */

export const OPEN_HOUSE_CAMPAIGN = 'open_house_2026_07';
export const OPEN_HOUSE_LABEL = 'Open House 2026-07-16';

// The interest ladder, coldest → hottest. rank() compares; higherTemp() picks the warmer.
export const TEMP_ORDER = ['cold', 'cool', 'warm', 'hot', 'qualified'];
export const rank = (t: string): number => Math.max(0, TEMP_ORDER.indexOf(t));
export const higherTemp = (a: string, b: string): string => (rank(a) >= rank(b) ? a : b);

export type OhStatus = 'registered' | 'attended' | 'paid';
export const STATUS_TEMP: Record<OhStatus, string> = { registered: 'warm', attended: 'hot', paid: 'qualified' };

export interface OhParticipant {
  email: string;
  name?: string;
  registered?: boolean;   // Eventbrite signup
  attended?: boolean;     // joined the live event app
  paid?: boolean;         // $50 deposit or a subscription
  amountCents?: number;   // what they paid, if known
}

/** The strongest signal a participant carries → its status + target temperature. */
export function participantStatus(p: OhParticipant): { status: OhStatus; targetTemp: string } {
  const status: OhStatus = p.paid ? 'paid' : p.attended ? 'attended' : 'registered';
  return { status, targetTemp: STATUS_TEMP[status] };
}

export interface IngestOutcome {
  email: string;
  status: OhStatus;
  lead: 'created' | 'existing' | 'would_create' | 'skipped';
  previousTemp: string | null;
  newTemp: string;
  raised: boolean;
  activityLogged: boolean;
  note?: string;
}

/**
 * Ingest a single participant. `apply=false` is a dry run (no writes) that still
 * reports what WOULD happen.
 */
export async function ingestOpenHouseParticipant(p: OhParticipant, opts: { apply: boolean }): Promise<IngestOutcome> {
  const email = (p.email || '').trim().toLowerCase();
  const { status, targetTemp } = participantStatus(p);
  const out: IngestOutcome = { email: p.email, status, lead: 'skipped', previousTemp: null, newTemp: targetTemp, raised: false, activityLogged: false };
  if (!email) { out.note = 'no email'; return out; }

  let lead = await Lead.findOne({ where: { email } });
  const currentTemp = lead ? (lead as any).lead_temperature || 'cold' : null;
  const newTemp = higherTemp(currentTemp || 'cold', targetTemp);
  out.previousTemp = currentTemp;
  out.newTemp = newTemp;
  out.raised = currentTemp != null && newTemp !== currentTemp;

  if (!lead) {
    out.lead = opts.apply ? 'created' : 'would_create';
    out.raised = true; // a new lead starts at the target temperature
    if (opts.apply) {
      lead = await Lead.create({
        name: (p.name || email).slice(0, 255),
        email,
        source: 'open_house',
        form_type: 'open_house',              // powers the admin Leads "Source" filter
        utm_source: 'open_house',
        utm_campaign: OPEN_HOUSE_CAMPAIGN,
        lead_source_type: 'warm',
        status: 'new',
        pipeline_stage: 'new_lead',
        consent_contact: true,                // provided their email at our event
        lead_temperature: targetTemp,
        temperature_updated_at: new Date(),
        notes: `${OPEN_HOUSE_LABEL}: ${status}`,
      } as any);
      await LeadTemperatureHistory.create({
        lead_id: (lead as any).id, previous_temperature: 'cold', new_temperature: targetTemp,
        trigger_type: 'open_house', trigger_detail: `open_house_${status}`,
        metadata: { event: OPEN_HOUSE_CAMPAIGN, status },
      } as any);
    }
  } else {
    out.lead = 'existing';
    if (opts.apply && out.raised) {
      await lead.update({ lead_temperature: newTemp, temperature_updated_at: new Date() });
      await LeadTemperatureHistory.create({
        lead_id: (lead as any).id, previous_temperature: currentTemp!, new_temperature: newTemp,
        trigger_type: 'open_house', trigger_detail: `open_house_${status}`,
        metadata: { event: OPEN_HOUSE_CAMPAIGN, status },
      } as any);
    }
  }

  // One Open House activity per lead (idempotent on subject); records all flags.
  const subject = `${OPEN_HOUSE_LABEL} — ${status}`;
  if (lead) {
    const existing = await Activity.findOne({ where: { lead_id: (lead as any).id, subject } });
    if (existing) {
      out.note = 'activity already present';
    } else if (opts.apply) {
      await logActivity({
        lead_id: (lead as any).id, type: 'meeting', subject,
        metadata: { event: OPEN_HOUSE_CAMPAIGN, status, registered: !!p.registered, attended: !!p.attended, paid: !!p.paid, amount_cents: p.amountCents ?? null },
      });
      out.activityLogged = true;
    }
  }
  return out;
}

export interface IngestSummary {
  total: number;
  created: number;
  existing: number;
  by_status: Record<OhStatus, number>;
  raised: number;
  activities: number;
  apply: boolean;
  outcomes: IngestOutcome[];
}

/** Ingest a batch; merges duplicate emails to their strongest signal first. */
export async function ingestOpenHouseBatch(participants: OhParticipant[], opts: { apply: boolean }): Promise<IngestSummary> {
  // Merge by email so a person who registered AND attended AND paid is one lead
  // carrying all flags (strongest status wins).
  const byEmail = new Map<string, OhParticipant>();
  for (const p of participants) {
    const key = (p.email || '').trim().toLowerCase();
    if (!key) continue;
    const prev = byEmail.get(key) || { email: p.email };
    byEmail.set(key, {
      email: prev.email || p.email,
      name: prev.name || p.name,
      registered: prev.registered || p.registered,
      attended: prev.attended || p.attended,
      paid: prev.paid || p.paid,
      amountCents: p.amountCents ?? prev.amountCents,
    });
  }

  const outcomes: IngestOutcome[] = [];
  for (const p of byEmail.values()) outcomes.push(await ingestOpenHouseParticipant(p, opts));

  const by_status: Record<OhStatus, number> = { registered: 0, attended: 0, paid: 0 };
  for (const o of outcomes) by_status[o.status]++;
  return {
    total: outcomes.length,
    created: outcomes.filter((o) => o.lead === 'created' || o.lead === 'would_create').length,
    existing: outcomes.filter((o) => o.lead === 'existing').length,
    by_status,
    raised: outcomes.filter((o) => o.raised).length,
    activities: outcomes.filter((o) => o.activityLogged).length,
    apply: opts.apply,
    outcomes,
  };
}
