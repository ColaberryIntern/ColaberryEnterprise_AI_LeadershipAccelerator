/**
 * OH1u: set up Maya's Open House FOLLOW-UP campaign (attended / missed). Idempotent; DRY RUN
 * by default; it never sends anything and never activates the campaign.
 *
 *   node dist/scripts/ensureOpenHouseFollowupCampaign.js                        # dry run: the plan
 *   ... --apply                         # creates the sequence + a DRAFT campaign, submitted for approval
 *   ... --preview <out.html>            # both emails as they will read, for Ali's copy review
 *   ... --session <sessionId>           # read-only: who would get which email for that Open House
 *   ... --replay <sessionId> <url> --apply   # sets the recording link the "missed" email carries
 *   ... --book <sessionId>              # books that session's follow-ups now (only if the campaign is active)
 *
 * The campaign reuses the countdown campaign's sender (Maya), tenant, brand and send window, and
 * sends under the event_reminder category. Ali approves and activates it in Admin > Campaigns;
 * activation runs the full activation gate. The hourly OpenHouseSessionSync cron then books the
 * follow-ups for every Open House that ended in the last 2 days.
 */
import * as fs from 'fs';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { findOpenHouseCountdownCampaign, EVENT_REMINDER_CATEGORY } from '../services/openHouseCountdown';
import { OPEN_HOUSE_FOLLOWUP_KEY, FOLLOWUP_PEOPLE_SQL, findFollowupCampaign, bookOpenHouseFollowups } from '../services/openHouseFollowup';
import { followupCopy, screenFollowupCopy } from '../services/openHouseFollowupCopy';

const NAME = 'Open House Follow-up (Maya)';
const DESCRIPTION = 'After each Open House, one email per person: those who checked in on the platform get a thank-you and the next step (their Today page); registrants who did not check in get the recording when one is set and the next Open House. Fixed copy Ali approved; no price, offer or discount. Attendance is platform check-ins only, so the missed email thanks anyone who joined on Zoom directly.';
const STEPS = [{
  delay_days: 0, channel: 'email', subject: 'Open House follow-up',
  body_template: '(Written per person at booking by openHouseFollowupCopy.ts: attended or missed.)',
  step_goal: 'One follow-up after the Open House: thank-you and next step, or the recording and the next Open House.',
}];

const arg = (name: string, offset = 1): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + offset] ?? '') : null;
};
const has = (name: string): boolean => process.argv.includes(name);

async function one<T extends object>(sql: string, replacements: Record<string, unknown> = {}): Promise<T | null> {
  const rows = await sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
  return (rows[0] as T) ?? null;
}

const mask = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

async function ensureCampaign(apply: boolean, log: (s: string) => void): Promise<void> {
  const countdown = await findOpenHouseCountdownCampaign();
  if (!countdown) throw new Error('No Open House countdown campaign: the follow-up copies its sender, tenant and brand');
  const src = await one<{ sender_profile_id: string; tenant_id: string; brand_id: string; settings: Record<string, any> }>(
    `SELECT sender_profile_id, tenant_id, brand_id, settings FROM campaigns WHERE id = :id`, { id: countdown.id });
  if (!src) throw new Error('Countdown campaign row vanished');

  let seq = await one<{ id: string }>(`SELECT id FROM follow_up_sequences WHERE name = :n LIMIT 1`, { n: NAME });
  if (!seq) {
    log(`sequence: create "${NAME}" (one email, written per person at booking)`);
    if (apply) {
      seq = await one<{ id: string }>(
        `INSERT INTO follow_up_sequences (id, name, description, steps, is_active, tenant_id, created_at, updated_at)
         VALUES (gen_random_uuid(), :n, :d, CAST(:steps AS jsonb), true, :tenant, NOW(), NOW()) RETURNING id`,
        { n: NAME, d: 'OH1u: one follow-up per Open House, attended or missed.', steps: JSON.stringify(STEPS), tenant: src.tenant_id });
    }
  } else log(`sequence: exists ${seq.id}`);

  const settings = {
    campaign_key: OPEN_HOUSE_FOLLOWUP_KEY,
    communication_category: EVENT_REMINDER_CATEGORY,
    agent_name: 'Maya',
    sender_name: src.settings?.sender_name, sender_email: src.settings?.sender_email,
    stop_rule: src.settings?.stop_rule,
    max_leads_per_cycle: 100, delay_between_sends: 0,
    send_timezone: 'America/Chicago', send_time_start: '08:00', send_time_end: '21:00', send_active_days: [0, 1, 2, 3, 4, 5, 6],
  };
  const existing = await findFollowupCampaign();
  if (existing) {
    log(`campaign: exists ${existing.id} (${existing.status}); settings refreshed, replay links and sign-offs kept`);
    if (apply) {
      await sequelize.query(
        `UPDATE campaigns SET settings = COALESCE(settings, '{}'::jsonb) || CAST(:s AS jsonb), description = :d, updated_at = NOW() WHERE id = :id`,
        { replacements: { s: JSON.stringify(settings), d: DESCRIPTION, id: existing.id } });
    }
    return;
  }
  log(`campaign: create "${NAME}" as a DRAFT (Maya as sender, event_reminder), submitted for approval`);
  if (!apply || !seq) return;
  const row = await one<{ id: string }>(
    `INSERT INTO campaigns (id, name, description, type, status, sequence_id, settings, channel_config, channel, objective,
                            destination_path, approval_status, sender_profile_id, tenant_id, brand_id, funnel_stage, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), :name, :desc, 'behavioral_trigger', 'draft', :seq, CAST(:settings AS jsonb), CAST(:cc AS jsonb), 'email',
             'Follow up every Open House registrant: attended or missed', '/open-house', 'draft', :profile, :tenant, :brand, 'consideration', NULL, NOW(), NOW())
     RETURNING id`,
    { name: NAME, desc: DESCRIPTION, seq: seq.id, settings: JSON.stringify(settings),
      cc: JSON.stringify({ email: { enabled: true, daily_limit: 500 } }),
      profile: src.sender_profile_id, tenant: src.tenant_id, brand: src.brand_id });
  if (!row) throw new Error('campaign insert returned nothing');
  await sequelize.query(
    `INSERT INTO campaign_governance_configs (id, campaign_id, ramp_profile, max_unsubscribe_rate, max_bounce_rate, max_sms_failure_rate, min_open_rate, min_reply_rate, updated_by, created_at, updated_at)
     VALUES (gen_random_uuid(), :id, CAST(:ramp AS jsonb), 2, 5, 10, 0.05, 0.001, 'OH1u script', NOW(), NOW())`,
    { replacements: { id: row.id, ramp: JSON.stringify({ phase_sizes: [-1], advance_threshold: 0.9, hold_threshold: 0.5, evaluation_window_hours: 24 }) } });
  const { submitForApproval } = await import('../services/campaignApprovalService');
  await submitForApproval(row.id);
  log(`campaign: created ${row.id}, pending approval`);
}

function previewHtml(): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cases = [
    { label: 'Attended (checked in)', input: { track: 'attended' as const, firstName: 'Jordan', eventDate: 'Thursday, December 3' } },
    { label: 'Missed, not registered for the next one', input: { track: 'missed' as const, firstName: 'Jordan', eventDate: 'Thursday, December 3', next: { when_label: 'Thursday, December 17 at 6:30 PM CST', registered: false } } },
    { label: 'Missed, already registered for the next one', input: { track: 'missed' as const, firstName: 'Jordan', eventDate: 'Thursday, December 3', next: { when_label: 'Thursday, December 17 at 6:30 PM CST', registered: true } } },
    { label: 'Missed, with a recording link set', input: { track: 'missed' as const, firstName: 'Jordan', eventDate: 'Thursday, December 3', replayUrl: 'https://enterprise.colaberry.ai/example-recording-link', next: { when_label: 'Thursday, December 17 at 6:30 PM CST', registered: false } } },
  ];
  const cards = cases.map((c) => {
    const copy = followupCopy(c.input);
    const problems = screenFollowupCopy(copy);
    return `<section style="border:1px solid #cbd5e0;border-radius:8px;margin:16px 0;padding:14px 18px">
<h2 style="font-size:16px;color:#1a365d;margin:0 0 8px">${esc(c.label)}</h2>
<p style="margin:0 0 8px"><b>Subject:</b> ${esc(copy.subject)}</p>${copy.body}
<p style="color:#718096;font-size:13px">[Maya's signature and the unsubscribe footer are added here]</p>
<p style="font-size:13px;color:${problems.length ? '#c53030' : '#2f855a'}">Copy screen: ${problems.length ? esc(problems.join('; ')) : 'passes'}</p></section>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Open House Follow-up Copy</title></head>
<body style="font-family:Segoe UI,Arial;max-width:760px;margin:24px auto;padding:0 16px;color:#1a202c">
<h1 style="color:#1a365d;font-size:22px">Open House follow-up: the emails for your approval</h1>
<p>One email per person, the morning after each Open House at 10:00 AM CT, from Maya. "Attended" means they checked in on the platform. Everyone else who registered gets a "missed" version, which thanks them in case they joined on Zoom directly.</p>
${cards}</body></html>`;
}

async function main(): Promise<void> {
  const apply = has('--apply');
  const log = (s: string) => console.log(`${apply ? '' : '[dry run] '}${s}`);

  const out = arg('--preview');
  if (out) { fs.writeFileSync(out, previewHtml()); console.log(`preview written to ${out}`); return; }

  const replaySession = arg('--replay');
  if (replaySession) {
    const url = arg('--replay', 2) || '';
    if (!/^https:\/\/\S+$/.test(url)) throw new Error('--replay <sessionId> <https url>');
    const c = await findFollowupCampaign();
    if (!c) throw new Error('No follow-up campaign yet; run with --apply first');
    log(`replay link for session ${replaySession}: ${url}`);
    if (apply) {
      await sequelize.query(
        `UPDATE campaigns SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{replay_urls}',
                COALESCE(settings->'replay_urls', '{}'::jsonb) || jsonb_build_object(CAST(:sid AS text), CAST(:url AS text))), updated_at = NOW()
          WHERE id = :id`, { replacements: { sid: replaySession, url, id: c.id } });
    }
    return;
  }

  const session = arg('--session');
  if (session) {
    const people = await sequelize.query<{ email: string; track: string; lead_id: number | null }>(
      FOLLOWUP_PEOPLE_SQL, { replacements: { sid: session, campaignId: (await findFollowupCampaign())?.id ?? '00000000-0000-0000-0000-000000000000' }, type: QueryTypes.SELECT });
    const count = (t: string) => people.filter((p) => p.track === t).length;
    console.log(JSON.stringify({ session, attended: count('attended'), missed: count('missed'), no_lead: people.filter((p) => !p.lead_id).length,
      attended_sample: people.filter((p) => p.track === 'attended').slice(0, 5).map((p) => mask(p.email)) }));
    return;
  }

  const book = arg('--book');
  if (book) { console.log(JSON.stringify(await bookOpenHouseFollowups(book))); return; }

  await ensureCampaign(apply, log);
}

main().then(() => process.exit(0)).catch((err) => { console.error('[ensureOpenHouseFollowupCampaign] failed:', err?.message); process.exit(1); });
