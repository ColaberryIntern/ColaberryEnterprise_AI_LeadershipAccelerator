/**
 * AL1 (Ali, 2026-11-22): set up and book the Data Analytics alumni holiday campaign.
 *
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js                    # dry run: what would be created
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js --apply            # create the campaign as a DRAFT, pending approval
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js --book             # dry run: who would be booked, per step
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js --book --apply     # book (campaign must be ACTIVE)
 *
 * The campaign sends as Ali (executive_outreach: from and reply-to ali@colaberry.com, Ali's
 * signature once, no PS line). Bodies are Ali's approved text with one {{personal_opening}} the
 * scheduler writes at send time.
 *
 * Ali's rules (Nov 23):
 *   - "don't put anyone in with invalid placement dates": hasValidPlacementDate, on top of AUDIENCE_SQL
 *     (DA alumni with an email; not unsubscribed, bounced or do-not-contact; no unsubscribe event;
 *     not a paid member; not staff).
 *   - "at least 5 minutes apart on weekdays ... 10 emails before the end of the year": one send per
 *     5-minute slot, 6 AM to 11 PM CT, Mon-Fri (alumniSendSlots). Someone who cannot get all ten by
 *     Dec 31 is not booked (no_room). The scheduler also refuses a send within 4 minutes of the
 *     campaign's last one (min_send_gap_minutes), so a backlog after an outage cannot burst.
 *   - "Remove people that actually make a payment": remove_if_paid; the hourly exit sweep ends the
 *     membership and cancels what is left. stop_if_paid on every send is the send-time backstop.
 *   - "When they complete the campaign, they fall out and are in no campaign after that":
 *     on_complete remove; nothing moves them anywhere.
 * Anyone in another running campaign is left there (admitToCampaign without supersede).
 *
 * Idempotent: a person with any row in this campaign is skipped, and slots already holding a send
 * are never reused, so a re-run books only people who were not booked before.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { classInstant } from '../services/centralDate';
import { firstNameOf } from '../services/openHouseFollowupCopy';
import { DA_ALUMNI_CAMPAIGN_KEY, DA_ALUMNI_STEPS, alumniStepBody } from '../services/alumni/daAlumniHolidayCopy';
import { hasValidPlacementDate } from '../services/alumni/alumniPersonalOpening';
import { AL1_SLOT_RULES, planSends, sendSlots, stepStarts } from '../services/alumni/alumniSendSlots';

const NAME = 'DA Alumni Holiday 2026 (from Ali)';
const DESCRIPTION = 'AL1: ten emails from Ali to Data Analytics alumni, Nov 24 to Dec 24 2026, about the changing analyst and BI roles, the Forward Deployed Engineer path, and 50% off the yearly membership for verified alumni. Ali\'s approved text; one AI-written personal opening per email.';
const SEND_CLOCK = '10:00';

export const AUDIENCE_SQL = `
SELECT l.id AS lead_id, l.email, l.name, l.alumni_context
  FROM leads l
 WHERE l.lead_source_type = 'alumni'
   AND l.alumni_context->>'program_type' IN ('data_analytics_bootcamp', 'data_analytics_short_course')
   AND COALESCE(l.email, '') <> '' AND l.email NOT ILIKE '%@colaberry.com'
   AND COALESCE(l.status::text, '') NOT IN ('unsubscribed', 'dnd', 'do_not_contact', 'bounced')
   AND NOT EXISTS (SELECT 1 FROM unsubscribe_events u WHERE u.lead_id = l.id)
   AND NOT EXISTS (SELECT 1 FROM subscriptions sb JOIN enrollments en ON en.id = sb.enrollment_id
                    WHERE LOWER(en.email) = LOWER(l.email) AND sb.plan::text <> 'comp'
                      AND sb.paysimple_payment_id IS NOT NULL AND sb.status::text IN ('active', 'past_due'))
 ORDER BY l.id`;

const has = (name: string): boolean => process.argv.includes(name);

async function one<T extends object>(sql: string, replacements: Record<string, unknown> = {}): Promise<T | null> {
  const rows = await sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
  return (rows[0] as T) ?? null;
}

async function findCampaign(): Promise<{ id: string; status: string; sequence_id: string | null; opening_mode: string | null } | null> {
  return one(`SELECT id, status::text AS status, sequence_id, settings->>'opening_mode' AS opening_mode FROM campaigns
               WHERE settings->>'campaign_key' = :k AND archived_at IS NULL ORDER BY created_at LIMIT 1`, { k: DA_ALUMNI_CAMPAIGN_KEY });
}

/**
 * AL1 send rules (Ali, Nov 23). The send window matches the slots, so the scheduler's own window
 * check agrees with the plan; min_send_gap_minutes is the scheduler's burst guard; remove_if_paid
 * lets the exit sweep take payers out; on_complete remove means nobody is moved anywhere after.
 */
export const AL1_SETTINGS_PATCH = {
  send_timezone: 'America/Chicago', send_time_start: AL1_SLOT_RULES.startClock, send_time_end: AL1_SLOT_RULES.endClock,
  send_active_days: [1, 2, 3, 4, 5], min_send_gap_minutes: AL1_SLOT_RULES.gapMinutes,
  remove_if_paid: true, on_complete: { action: 'remove' },
};

/** True when any AL1 send rule is missing or different on the campaign. */
export function settingsNeedPatch(settings: Record<string, any> | null | undefined): boolean {
  return Object.entries(AL1_SETTINGS_PATCH).some(([k, v]) => JSON.stringify(settings?.[k]) !== JSON.stringify(v));
}

/** AL1: a Colaberry Training campaign (Ali, Nov 22: "This is for the Colaberry Training - not enterprise"). */
export const TRAINING_BRAND_SLUG = 'colaberry-training';

async function ensureCampaign(apply: boolean, log: (s: string) => void): Promise<void> {
  const brand = await one<{ id: string; tenant_id: string }>(`SELECT id, tenant_id FROM brands WHERE slug = :s AND status = 'active'`, { s: TRAINING_BRAND_SLUG });
  if (!brand) throw new Error(`No active brand "${TRAINING_BRAND_SLUG}"`);
  const existing = await findCampaign();
  if (existing) {
    const row = await one<{ brand_id: string | null; settings: Record<string, any> | null }>(`SELECT brand_id, settings FROM campaigns WHERE id = :id`, { id: existing.id });
    if (row?.brand_id === brand.id) log(`campaign: exists ${existing.id} (${existing.status}), brand Colaberry Training`);
    else {
      log(`campaign: exists ${existing.id} (${existing.status}); brand moved to Colaberry Training`);
      if (apply) {
        await sequelize.query(`UPDATE campaigns SET brand_id = :b, tenant_id = :t, updated_at = NOW() WHERE id = :id`,
          { replacements: { b: brand.id, t: brand.tenant_id, id: existing.id } });
      }
    }
    if (settingsNeedPatch(row?.settings)) {
      log(`campaign: send rules set (${AL1_SLOT_RULES.startClock}-${AL1_SLOT_RULES.endClock} CT Mon-Fri, ${AL1_SLOT_RULES.gapMinutes} min apart, payers removed, nobody moved on)`);
      if (apply) {
        await sequelize.query(`UPDATE campaigns SET settings = COALESCE(settings, '{}'::jsonb) || CAST(:p AS jsonb), updated_at = NOW() WHERE id = :id`,
          { replacements: { p: JSON.stringify(AL1_SETTINGS_PATCH), id: existing.id } });
      }
    } else log('campaign: send rules already set');
    return;
  }
  // Settings (stop rule) from Ali's existing outreach campaigns; brand and tenant are Colaberry Training.
  const prior = await one<{ settings: Record<string, any> }>(
    `SELECT settings FROM campaigns WHERE type::text = 'executive_outreach' AND settings->>'sender_email' = 'ali@colaberry.com'
      ORDER BY created_at DESC LIMIT 1`);
  const src = { tenant_id: brand.tenant_id, brand_id: brand.id, settings: prior?.settings || {} };
  const steps = DA_ALUMNI_STEPS.map((s, i) => ({
    delay_days: Math.round((classInstant(s.date, SEND_CLOCK).getTime() - classInstant(DA_ALUMNI_STEPS[0].date, SEND_CLOCK).getTime()) / 86_400_000),
    channel: 'email', subject: s.subject, step_goal: s.theme,
    body_template: `(Booked per person by ensureDaAlumniHolidayCampaign: email ${i + 1}, ${s.date} 10:00 AM CT.)`,
  }));
  log(`sequence + campaign: create "${NAME}" as a DRAFT from ali@colaberry.com, ${steps.length} steps, pending approval`);
  if (!apply) return;
  const seq = await one<{ id: string }>(
    `INSERT INTO follow_up_sequences (id, name, description, steps, is_active, tenant_id, created_at, updated_at)
     VALUES (gen_random_uuid(), :n, :d, CAST(:steps AS jsonb), true, :tenant, NOW(), NOW()) RETURNING id`,
    { n: NAME, d: 'AL1: DA alumni holiday campaign, booked on calendar dates.', steps: JSON.stringify(steps), tenant: src.tenant_id });
  if (!seq) throw new Error('sequence insert returned nothing');
  const settings = {
    campaign_key: DA_ALUMNI_CAMPAIGN_KEY,
    sender_email: 'ali@colaberry.com', sender_name: 'Ali Muwwakkil',
    ali_signature: true, hide_ps: true,
    // 'template' (default): a fixed sentence per email around the person's class. 'ai': AI-written, screened.
    opening_mode: 'template',
    stop_rule: src.settings?.stop_rule || { max_unsubscribe_rate: 2, max_bounce_rate: 5 },
    max_leads_per_cycle: 200, delay_between_sends: 0,
    ...AL1_SETTINGS_PATCH,
  };
  const row = await one<{ id: string }>(
    `INSERT INTO campaigns (id, name, description, type, status, sequence_id, settings, channel_config, channel, objective,
                            destination_path, approval_status, tenant_id, brand_id, funnel_stage, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), :name, :desc, 'executive_outreach', 'draft', :seq, CAST(:settings AS jsonb), CAST(:cc AS jsonb), 'email',
             'DA alumni: the Forward Deployed Engineer path, 50% off the yearly membership', '/portal/signup', 'draft', :tenant, :brand, 'decision', NULL, NOW(), NOW())
     RETURNING id`,
    { name: NAME, desc: DESCRIPTION, seq: seq.id, settings: JSON.stringify(settings),
      cc: JSON.stringify({ email: { enabled: true, daily_limit: 1000 } }), tenant: src.tenant_id, brand: src.brand_id });
  if (!row) throw new Error('campaign insert returned nothing');
  await sequelize.query(
    `INSERT INTO campaign_governance_configs (id, campaign_id, ramp_profile, max_unsubscribe_rate, max_bounce_rate, max_sms_failure_rate, min_open_rate, min_reply_rate, updated_by, created_at, updated_at)
     VALUES (gen_random_uuid(), :id, CAST(:ramp AS jsonb), 2, 5, 10, 0.05, 0.001, 'AL1 script', NOW(), NOW())`,
    { replacements: { id: row.id, ramp: JSON.stringify({ phase_sizes: [-1], advance_threshold: 0.9, hold_threshold: 0.5, evaluation_window_hours: 24 }) } });
  const { submitForApproval } = await import('../services/campaignApprovalService');
  await submitForApproval(row.id);
  log(`campaign: created ${row.id}, pending approval`);
}

export interface BookResult {
  audience: number; invalid_placement: number; already: number; held: number; no_room: number;
  booked: number; rows: number; errors: number; per_step: number[];
  /** First and last send of what was (or would be) booked, Central, "YYYY-MM-DD HH:MM". */
  first_send: string | null; last_send: string | null;
}

type Person = { lead_id: number; email: string; name: string | null; alumni_context: Record<string, any> | null };
type Campaign = NonNullable<Awaited<ReturnType<typeof findCampaign>>>;

const ctClock = (t: number) => new Date(t).toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).slice(0, 16);

/** Who to plan for: a valid placement date, not already booked, not held by another running campaign. */
async function eligiblePeople(c: Campaign, people: Person[], now: Date, out: BookResult): Promise<Person[]> {
  const { otherRunningMemberships } = await import('../services/campaignMembership');
  const keep: Person[] = [];
  for (const p of people) {
    if (!hasValidPlacementDate(p.alumni_context, now)) { out.invalid_placement += 1; continue; }
    if (await one(`SELECT 1 AS x FROM campaign_leads WHERE campaign_id = :c AND lead_id = :l`, { c: c.id, l: p.lead_id })) { out.already += 1; continue; }
    if ((await otherRunningMemberships(Number(p.lead_id), c.id)).length) { out.held += 1; continue; }
    keep.push(p);
  }
  return keep;
}

/** Write one person's ten sends and their membership, all or nothing. */
async function bookOne(c: Campaign, p: Person, times: number[]): Promise<void> {
  const { ScheduledEmail, CampaignLead } = await import('../models');
  const first = firstNameOf(p.name);
  await sequelize.transaction(async (t) => {
    for (let i = 0; i < DA_ALUMNI_STEPS.length; i++) {
      const s = DA_ALUMNI_STEPS[i];
      await ScheduledEmail.create({
        lead_id: p.lead_id, sequence_id: c.sequence_id, campaign_id: c.id, step_index: i,
        channel: 'email', subject: s.subject, body: alumniStepBody(s, first), to_email: p.email, to_phone: null,
        max_attempts: 1, attempts_made: 0, scheduled_for: new Date(times[i]), status: 'pending', ai_instructions: null,
        metadata: { alumni_holiday: true, alumni_step: i + 1, personal_opening: true, opening_theme: s.theme,
          opening_mode: c.opening_mode === 'ai' ? 'ai' : 'template', stop_if_paid: true, send_slot: true },
      } as any, { transaction: t });
    }
    await CampaignLead.findOrCreate({
      where: { campaign_id: c.id, lead_id: p.lead_id } as any,
      defaults: { campaign_id: c.id, lead_id: p.lead_id, status: 'active', total_steps: DA_ALUMNI_STEPS.length } as any,
      transaction: t,
    });
  });
}

/**
 * Book the audience into 5-minute weekday send slots (alumniSendSlots). Dry run unless apply.
 * Slots already holding a send in this campaign are never reused, so a re-run only adds people.
 */
export async function bookAlumni(apply: boolean, now = new Date()): Promise<BookResult> {
  const c = await findCampaign();
  if (!c) throw new Error('No DA alumni campaign: run with --apply first');
  if (apply && c.status !== 'active') throw new Error(`Campaign is ${c.status}: it must be approved and active before booking`);
  const people = await sequelize.query<Person>(AUDIENCE_SQL, { type: QueryTypes.SELECT });
  const out: BookResult = { audience: people.length, invalid_placement: 0, already: 0, held: 0, no_room: 0, booked: 0, rows: 0, errors: 0,
    per_step: DA_ALUMNI_STEPS.map(() => 0), first_send: null, last_send: null };
  const todo = await eligiblePeople(c, people, now, out);
  const takenRows = await sequelize.query<{ t: Date }>(
    `SELECT scheduled_for AS t FROM scheduled_emails WHERE campaign_id = :c AND status IN ('pending', 'processing', 'sent')`,
    { replacements: { c: c.id }, type: QueryTypes.SELECT });
  const taken = new Set(takenRows.map((r) => new Date(r.t).getTime()));
  const plan = planSends(todo.length, stepStarts(DA_ALUMNI_STEPS.map((s) => s.date), now.getTime() + 2 * 60_000),
    sendSlots(AL1_SLOT_RULES, now.getTime() + 2 * 60_000), taken, AL1_SLOT_RULES.minPersonGapHours * 3_600_000);
  const { admitToCampaign } = await import('../services/campaignMembership');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i], times = plan[i];
    if (!times) { out.no_room += 1; continue; }
    if (apply) {
      try {
        if (!(await admitToCampaign(c.id, Number(p.lead_id), { supersede: false })).admitted) { out.held += 1; continue; }
        await bookOne(c, p, times);
      } catch (err: any) {
        out.errors += 1;
        console.error(JSON.stringify({ level: 'error', service: 'al1-booking', event: 'book_failed', error_class: err?.name || 'DatabaseError', context: { lead_id: p.lead_id, message: err?.message } }));
        continue;
      }
    }
    out.booked += 1; out.rows += times.length;
    times.forEach((t, k) => { out.per_step[k] += 1; lo = Math.min(lo, t); hi = Math.max(hi, t); });
  }
  if (out.booked) { out.first_send = ctClock(lo); out.last_send = ctClock(hi); }
  return out;
}

async function main(): Promise<void> {
  const apply = has('--apply');
  const log = (s: string) => console.log(`${apply ? '' : '[dry run] '}${s}`);
  if (has('--book')) { log(`book: ${JSON.stringify(await bookAlumni(apply))}`); return; }
  await ensureCampaign(apply, log);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error('[ensureDaAlumniHolidayCampaign] failed:', err?.message); process.exit(1); });
}
