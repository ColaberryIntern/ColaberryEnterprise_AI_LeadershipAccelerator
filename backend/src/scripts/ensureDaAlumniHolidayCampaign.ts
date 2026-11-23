/**
 * AL1 (Ali, 2026-11-22): set up and book the Data Analytics alumni holiday campaign.
 *
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js                    # dry run: what would be created
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js --apply            # create the campaign as a DRAFT, pending approval
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js --book             # dry run: who would be booked, per step
 *   node dist/scripts/ensureDaAlumniHolidayCampaign.js --book --apply     # book (campaign must be ACTIVE)
 *
 * The campaign sends as Ali (executive_outreach: from and reply-to ali@colaberry.com, Ali's
 * signature once, no PS line). Each person gets the ten emails on their calendar dates at
 * 10:00 AM CT (a date already past is skipped). Bodies are Ali's approved text with one
 * {{personal_opening}} the scheduler writes at send time.
 *
 * Audience (AUDIENCE_SQL): DA alumni (bootcamp and short course) with an email; not
 * unsubscribed, bounced or do-not-contact; no unsubscribe event; not a paid member; not staff.
 * Anyone in another running campaign is left there (admitToCampaign without supersede).
 *
 * Idempotent: a person with any row in this campaign is skipped, so a re-run books only people
 * who were not booked before. Every later step carries stop_if_paid: the scheduler cancels it for
 * someone who pays. When the last email has gone, the exit sweep removes them.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { classInstant } from '../services/centralDate';
import { firstNameOf } from '../services/openHouseFollowupCopy';
import { DA_ALUMNI_CAMPAIGN_KEY, DA_ALUMNI_STEPS, alumniStepBody } from '../services/alumni/daAlumniHolidayCopy';

const NAME = 'DA Alumni Holiday 2026 (from Ali)';
const DESCRIPTION = 'AL1: ten emails from Ali to Data Analytics alumni, Nov 24 to Dec 24 2026, about the changing analyst and BI roles, the Forward Deployed Engineer path, and 50% off the yearly membership for verified alumni. Ali\'s approved text; one AI-written personal opening per email.';
const SEND_CLOCK = '10:00';

export const AUDIENCE_SQL = `
SELECT l.id AS lead_id, l.email, l.name
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

async function findCampaign(): Promise<{ id: string; status: string; sequence_id: string | null } | null> {
  return one(`SELECT id, status::text AS status, sequence_id FROM campaigns WHERE settings->>'campaign_key' = :k AND archived_at IS NULL ORDER BY created_at LIMIT 1`, { k: DA_ALUMNI_CAMPAIGN_KEY });
}

async function ensureCampaign(apply: boolean, log: (s: string) => void): Promise<void> {
  const existing = await findCampaign();
  if (existing) { log(`campaign: exists ${existing.id} (${existing.status})`); return; }
  // Tenant and brand from Ali's existing outreach campaigns, so this one lands in the same place.
  const src = await one<{ tenant_id: string; brand_id: string; settings: Record<string, any> }>(
    `SELECT tenant_id, brand_id, settings FROM campaigns WHERE type::text = 'executive_outreach' AND settings->>'sender_email' = 'ali@colaberry.com'
      ORDER BY created_at DESC LIMIT 1`);
  if (!src) throw new Error('No earlier campaign from Ali to copy the tenant and brand from');
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
    stop_rule: src.settings?.stop_rule || { max_unsubscribe_rate: 2, max_bounce_rate: 5 },
    max_leads_per_cycle: 200, delay_between_sends: 0,
    send_timezone: 'America/Chicago', send_time_start: '08:00', send_time_end: '20:00', send_active_days: [0, 1, 2, 3, 4, 5, 6],
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

export interface BookResult { audience: number; already: number; held: number; booked: number; rows: number; errors: number; per_step: number[] }

/** Book the audience onto their calendar dates. Dry run unless apply. */
export async function bookAlumni(apply: boolean, now = new Date()): Promise<BookResult> {
  const c = await findCampaign();
  if (!c) throw new Error('No DA alumni campaign: run with --apply first');
  if (apply && c.status !== 'active') throw new Error(`Campaign is ${c.status}: it must be approved and active before booking`);
  const people = await sequelize.query<{ lead_id: number; email: string; name: string | null }>(AUDIENCE_SQL, { type: QueryTypes.SELECT });
  const out: BookResult = { audience: people.length, already: 0, held: 0, booked: 0, rows: 0, errors: 0, per_step: DA_ALUMNI_STEPS.map(() => 0) };
  const steps = DA_ALUMNI_STEPS.map((s, i) => ({ s, i, at: classInstant(s.date, SEND_CLOCK) })).filter((x) => x.at.getTime() > now.getTime());
  const { ScheduledEmail, CampaignLead } = await import('../models');
  const { admitToCampaign, otherRunningMemberships } = await import('../services/campaignMembership');
  for (const p of people) {
    const prior = await one(`SELECT 1 AS x FROM campaign_leads WHERE campaign_id = :c AND lead_id = :l`, { c: c.id, l: p.lead_id });
    if (prior) { out.already += 1; continue; }
    if (!apply) {
      // Dry run: the same membership answer admitToCampaign would give, without writing.
      if ((await otherRunningMemberships(Number(p.lead_id), c.id)).length) { out.held += 1; continue; }
      out.booked += 1; out.rows += steps.length; steps.forEach((x) => { out.per_step[x.i] += 1; });
      continue;
    }
    try {
      const admit = await admitToCampaign(c.id, Number(p.lead_id), { supersede: false });
      if (!admit.admitted) { out.held += 1; continue; }
      const first = firstNameOf(p.name);
      await sequelize.transaction(async (t) => {
        for (const x of steps) {
          await ScheduledEmail.create({
            lead_id: p.lead_id, sequence_id: c.sequence_id, campaign_id: c.id, step_index: x.i,
            channel: 'email', subject: x.s.subject, body: alumniStepBody(x.s, first), to_email: p.email, to_phone: null,
            max_attempts: 1, attempts_made: 0, scheduled_for: x.at, status: 'pending', ai_instructions: null,
            metadata: { alumni_holiday: true, alumni_step: x.i + 1, personal_opening: true, opening_theme: x.s.theme, stop_if_paid: true },
          } as any, { transaction: t });
          out.per_step[x.i] += 1;
        }
        await CampaignLead.findOrCreate({
          where: { campaign_id: c.id, lead_id: p.lead_id } as any,
          defaults: { campaign_id: c.id, lead_id: p.lead_id, status: 'active', total_steps: steps.length } as any,
          transaction: t,
        });
      });
      out.booked += 1; out.rows += steps.length;
    } catch (err: any) {
      out.errors += 1;
      console.error(JSON.stringify({ level: 'error', service: 'al1-booking', event: 'book_failed', error_class: err?.name || 'DatabaseError', context: { lead_id: p.lead_id, message: err?.message } }));
    }
  }
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
