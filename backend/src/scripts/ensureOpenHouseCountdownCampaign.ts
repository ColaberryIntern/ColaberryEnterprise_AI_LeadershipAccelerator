/**
 * OH1 (Ali, 2026-11-17): set up Maya's Open House countdown CAMPAIGN in the campaign
 * system. Idempotent; DRY RUN by default; it never sends anything and never activates.
 *
 *   npx ts-node src/scripts/ensureOpenHouseCountdownCampaign.ts            # dry run: prints the plan
 *   npx ts-node src/scripts/ensureOpenHouseCountdownCampaign.ts --apply    # writes it
 *   ... --apply --enroll-registrants   # queues every upcoming registrant (as 'enrolled', no sends)
 *   ... --drafts 5                     # AI-writes 5 real drafts to /tmp/oh_countdown_drafts.html (the dry run Ali reads)
 *   ... --attest claims_approved,dry_run_reviewed --by <admin email>
 *          # records Ali's sign-offs for the activation gate. Run ONLY on his word.
 *
 * What --apply does, in order:
 *   1. colaberry.com email domain: checks SPF (includes Mandrill), Mandrill DKIM and DMARC in
 *      live DNS, and marks the brand_domains row verified ONLY if all three are present.
 *   2. Maya's sender profile: "Maya at Colaberry" <maya@colaberry.com>, Colaberry brand, active
 *      only when the domain verified in step 1.
 *   3. The sequence: three AI-written emails timed back from each person's Open House.
 *   4. The campaign: a DRAFT with campaign_key=open_house_countdown, Maya as sender, a stop
 *      rule, a send limit, governance thresholds, and submitted for approval.
 *
 * Then a human (Ali) approves it in Admin > Campaigns and activates it there. Activation runs
 * the full activation gate (approval, sender, stop rule, sendable contacts, attestations).
 */
import * as dns from 'dns/promises';
import * as fs from 'fs';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import {
  OPEN_HOUSE_COUNTDOWN_KEY, findOpenHouseCountdownCampaign, findNextOpenHouseForEmail, screenEventReminderCopy,
  fallbackReminderBody, fallbackReminderSms, countdownCallScript,
} from '../services/openHouseCountdown';
import type { SequenceStep } from '../models/FollowUpSequence';

const MAYA_EMAIL = 'maya@colaberry.com';
const MAYA_NAME = 'Maya at Colaberry';
const EMAIL_DOMAIN = 'colaberry.com';
const SEQUENCE_NAME = 'Open House Countdown (Maya)';
const CAMPAIGN_NAME = 'Open House Countdown (Maya)';

export const MAYA_SYSTEM_PROMPT = `You are Maya, Director of Admissions at Colaberry. You write to people who registered for a Colaberry Open House, a live online session about the Forward Deployed AI Engineer Accelerator.

Your job in these emails is to help them show up: remind them warmly, make it easy to join, and make them feel expected. You are not selling. Any offer is shared live at the Open House, never in email.

Write like a real person who is glad they registered: short, plain American English, no hype, no emojis.`;

/** The countdown. Timed back from the start of the Open House each person registered for. */
export const COUNTDOWN_STEPS: SequenceStep[] = [
  {
    delay_days: 0,
    minutes_before_event: 2 * 24 * 60,
    channel: 'email',
    subject: 'Looking forward to seeing you at the Colaberry Open House',
    body_template: '',
    step_goal: 'Make them feel expected and set up what the Open House is',
    ai_instructions: 'Two days out. Thank them for registering and say you are looking forward to seeing them. If the facts say what they have done on the platform, mention it in one natural sentence and say the Open House is a good place to ask about it. Tell them what to expect: a walk through the program and what you build in it, live questions and answers, and quick polls on their phone. Give the Join link and invite them to reply with a question they want answered live.',
    ai_tone: 'warm, personal, brief',
  },
  {
    delay_days: 0,
    minutes_before_event: 24 * 60,
    channel: 'email',
    subject: 'Tomorrow: the Colaberry Open House',
    body_template: '',
    step_goal: 'Remind them it is tomorrow and how to join',
    ai_instructions: 'One day out. A short reminder that the Open House is tomorrow, with the day and time. Give the Join link and say it signs them in and checks them in. Suggest they put it on their calendar and bring their questions. Do not repeat the previous email.',
    ai_tone: 'friendly, brief',
  },
  {
    // Day of, noon CT for a 6:30 PM Open House. Only people with a phone AND express
    // voice consent are scheduled. The script is countdownCallScript (help, not sell).
    delay_days: 0,
    minutes_before_event: 390,
    channel: 'voice',
    voice_agent_type: 'interest',
    subject: 'Maya calls ahead of the Open House',
    body_template: '',
    step_goal: 'Help them, relate to what they are doing on the platform, make them feel expected. No selling.',
  },
  {
    // Day of, 2:30 PM CT. Four hours out, not one: the scheduler sends at most about 120
    // per campaign per hour, so a whole list due one hour out would still be going out
    // after the Open House began.
    delay_days: 0,
    minutes_before_event: 240,
    channel: 'email',
    subject: 'Today: the Colaberry Open House',
    body_template: '',
    step_goal: 'Get them into the room tonight',
    ai_instructions: 'It is today, a few hours from now. Two or three sentences only: it is today at the start time (name it), here is the Join link, and keep your phone handy for the live polls.',
    ai_tone: 'warm, very brief',
  },
  {
    // Day of, 5:30 PM CT. A text to people with express SMS consent, through GHL.
    // Fixed copy (fallbackReminderSms), so no ai_instructions.
    delay_days: 0,
    minutes_before_event: 60,
    channel: 'sms',
    subject: 'Open House starts in an hour (text)',
    body_template: '',
    step_goal: 'Get them into the room',
  },
];

/** Campaign settings. The key names are the ones the scheduler reads (campaignSendWindow.ts). */
export const COUNTDOWN_SETTINGS = {
  campaign_key: OPEN_HOUSE_COUNTDOWN_KEY,
  agent_name: 'Maya',
  sender_name: MAYA_NAME,
  sender_email: MAYA_EMAIL,
  stop_rule: { max_unsubscribe_rate_pct: 2, max_bounce_rate_pct: 5, note: 'Pause if either is crossed in any 24 hours.' },
  max_leads_per_cycle: 100,
  // The default 120 s between sends would make ~170 emails take hours.
  delay_between_sends: 0,
  // Email and text: 8 AM to 9 PM Central, every day (the default stops at 5 PM, before the Open House).
  send_timezone: 'America/Chicago',
  send_time_start: '08:00',
  send_time_end: '21:00',
  send_active_days: [0, 1, 2, 3, 4, 5, 6],
  // Calls: 10 AM to 5 PM Central, weekdays.
  call_timezone: 'America/Chicago',
  call_time_start: '10:00',
  call_time_end: '17:00',
  call_active_days: [1, 2, 3, 4, 5],
  max_daily_calls: 75,
};

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? '') : null;
};
const has = (name: string): boolean => process.argv.includes(name);

async function checkDomainDns(domain: string): Promise<{ spf: boolean; dkim: boolean; dmarc: boolean }> {
  const txt = async (name: string): Promise<string[]> => {
    try { return (await dns.resolveTxt(name)).map((r) => r.join('')); } catch { return []; }
  };
  const root = await txt(domain);
  const dkim = await txt(`mandrill._domainkey.${domain}`);
  const dmarc = await txt(`_dmarc.${domain}`);
  return {
    spf: root.some((t) => /^v=spf1\b/i.test(t) && /include:spf\.mandrillapp\.com/i.test(t)),
    dkim: dkim.some((t) => /v=DKIM1/i.test(t) && /p=[A-Za-z0-9+/]/.test(t)),
    dmarc: dmarc.some((t) => /^v=DMARC1/i.test(t)),
  };
}

async function one<T extends object>(sql: string, replacements: Record<string, unknown> = {}): Promise<T | null> {
  const rows = await sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
  return (rows[0] as T) ?? null;
}

async function main(): Promise<void> {
  const apply = has('--apply');
  const log = (s: string) => console.log(`${apply ? '' : '[dry run] '}${s}`);

  // 1. The email domain
  const domainRow = await one<{ id: string; brand_id: string; tenant_id: string; verification_status: string }>(
    `SELECT id, brand_id, tenant_id, verification_status FROM brand_domains WHERE hostname = :h AND purpose = 'email' ORDER BY is_primary DESC LIMIT 1`, { h: EMAIL_DOMAIN });
  if (!domainRow) throw new Error(`No brand_domains email row for ${EMAIL_DOMAIN}; nothing to attach Maya's sender to`);
  const dnsCheck = await checkDomainDns(EMAIL_DOMAIN);
  const domainOk = dnsCheck.spf && dnsCheck.dkim && dnsCheck.dmarc;
  log(`${EMAIL_DOMAIN}: SPF(Mandrill) ${dnsCheck.spf ? 'yes' : 'NO'}, DKIM(Mandrill) ${dnsCheck.dkim ? 'yes' : 'NO'}, DMARC ${dnsCheck.dmarc ? 'yes' : 'NO'} (row was ${domainRow.verification_status})`);
  if (apply && domainOk) {
    await sequelize.query(
      `UPDATE brand_domains SET verification_status = 'verified', spf_status = 'pass', dkim_status = 'pass', dmarc_status = 'pass',
              verified_at = COALESCE(verified_at, NOW()), updated_at = NOW() WHERE id = :id`,
      { replacements: { id: domainRow.id } });
    log(`${EMAIL_DOMAIN}: marked verified from live DNS`);
  }

  // 2. Maya's sender profile
  let profile = await one<{ id: string; status: string }>(`SELECT id, status FROM sender_profiles WHERE LOWER(from_email) = :e LIMIT 1`, { e: MAYA_EMAIL });
  const profileStatus = domainOk ? 'active' : 'draft';
  if (!profile) {
    log(`sender profile: create "${MAYA_NAME}" <${MAYA_EMAIL}> (${profileStatus})`);
    if (apply) {
      profile = await one<{ id: string; status: string }>(
        `INSERT INTO sender_profiles (id, tenant_id, brand_id, name, from_name, from_email, reply_to_email, sending_domain_id, provider,
                                      unsubscribe_url, physical_mailing_address, status, is_default, metadata, created_at, updated_at)
         VALUES (gen_random_uuid(), :tenant, :brand, 'Maya (Admissions)', :fromName, :email, :email, :domain, 'mandrill',
                 'https://enterprise.colaberry.ai/api/unsubscribe','Colaberry Inc., 200 Chisholm Place, Suite 200, Plano, TX 75075',
                 :status, false, '{"created_by":"OH1 ensureOpenHouseCountdownCampaign"}'::jsonb, NOW(), NOW())
         RETURNING id, status`,
        { tenant: domainRow.tenant_id, brand: domainRow.brand_id, fromName: MAYA_NAME, email: MAYA_EMAIL, domain: domainRow.id, status: profileStatus });
    }
  } else {
    log(`sender profile: exists (${profile.status})`);
    if (apply && profile.status !== profileStatus) {
      await sequelize.query(`UPDATE sender_profiles SET status = :s, updated_at = NOW() WHERE id = :id`, { replacements: { s: profileStatus, id: profile.id } });
      log(`sender profile: status -> ${profileStatus}`);
    }
  }

  // 3. The sequence
  let seq = await one<{ id: string }>(`SELECT id FROM follow_up_sequences WHERE name = :n LIMIT 1`, { n: SEQUENCE_NAME });
  if (!seq) {
    log(`sequence: create "${SEQUENCE_NAME}" (${COUNTDOWN_STEPS.length} steps: email T-2 days, email T-1 day, call day-of noon, email day-of 2:30 PM, text T-1 hour)`);
    if (apply) {
      seq = await one<{ id: string }>(
        `INSERT INTO follow_up_sequences (id, name, description, steps, is_active, tenant_id, created_at, updated_at)
         VALUES (gen_random_uuid(), :n, :d, CAST(:steps AS jsonb), true, :tenant, NOW(), NOW()) RETURNING id`,
        { n: SEQUENCE_NAME, d: 'OH1: Maya reminds every Open House registrant, timed back from their Open House. AI-written per person; no price or offer.', steps: JSON.stringify(COUNTDOWN_STEPS), tenant: domainRow.tenant_id });
    }
  } else {
    log('sequence: exists, steps refreshed');
    if (apply) await sequelize.query(`UPDATE follow_up_sequences SET steps = CAST(:steps AS jsonb), updated_at = NOW() WHERE id = :id`, { replacements: { steps: JSON.stringify(COUNTDOWN_STEPS), id: seq.id } });
  }

  // 4. The campaign (a DRAFT; never activated here)
  let campaign = await findOpenHouseCountdownCampaign();
  if (!campaign) {
    log(`campaign: create "${CAMPAIGN_NAME}" as a draft, Maya as sender, submitted for approval`);
    if (apply && seq && profile) {
      const settings = COUNTDOWN_SETTINGS;
      const row = await one<{ id: string }>(
        `INSERT INTO campaigns (id, name, description, type, status, sequence_id, ai_system_prompt, settings, channel_config, channel, objective,
                                destination_path, tracking_link, approval_status, sender_profile_id, tenant_id, brand_id, funnel_stage, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), :name, :desc, 'behavioral_trigger', 'draft', :seq, :prompt, CAST(:settings AS jsonb), CAST(:cc AS jsonb), 'email',
                 'Get Open House registrants into the room', '/open-house', 'https://enterprise.colaberry.ai/open-house?utm_source=maya&utm_campaign=open_house_countdown',
                 'draft', :profile, :tenant, :brand, 'consideration', 'OH1 script', NOW(), NOW())
         RETURNING id`,
        { name: CAMPAIGN_NAME, desc: 'Every Open House registrant is enrolled at sign-up. Maya emails them (T-2 days, T-1 day, day-of), calls the ones with call consent at noon on the day (help, not sell), and texts the ones with text consent an hour before, through GHL. No price, offer or discount (Ali, 2026-11-17).',
          seq: seq.id, prompt: MAYA_SYSTEM_PROMPT, settings: JSON.stringify(settings),
          cc: JSON.stringify({ email: { enabled: true, daily_limit: 500 }, voice: { enabled: true, daily_limit: 75 }, sms: { enabled: true, daily_limit: 250 } }),
          profile: profile.id, tenant: domainRow.tenant_id, brand: domainRow.brand_id });
      if (row) {
        await sequelize.query(
          `INSERT INTO campaign_governance_configs (id, campaign_id, ramp_profile, max_unsubscribe_rate, max_bounce_rate, max_sms_failure_rate, min_open_rate, min_reply_rate, updated_by, created_at, updated_at)
           VALUES (gen_random_uuid(), :id, CAST(:ramp AS jsonb), 2, 5, 10, 0.05, 0.001, 'OH1 script', NOW(), NOW())`,
          { replacements: { id: row.id, ramp: JSON.stringify({ phase_sizes: [-1], advance_threshold: 0.9, hold_threshold: 0.5, evaluation_window_hours: 24 }) } });
        const { submitForApproval } = await import('../services/campaignApprovalService');
        await submitForApproval(row.id);
        campaign = await findOpenHouseCountdownCampaign();
        log(`campaign: created ${row.id}, pending approval`);
      }
    }
  } else {
    log(`campaign: exists ${campaign.id} (${campaign.status}), settings refreshed (sign-offs kept)`);
    if (apply) {
      await sequelize.query(
        `UPDATE campaigns SET settings = COALESCE(settings, '{}'::jsonb) || CAST(:s AS jsonb), updated_at = NOW() WHERE id = :id`,
        { replacements: { s: JSON.stringify(COUNTDOWN_SETTINGS), id: campaign.id } });
    }
  }

  // Registrants of upcoming Open Houses, queued (no sends while it is a draft).
  if (has('--enroll-registrants') && campaign) {
    const people = await sequelize.query<{ lead_id: number }>(
      `SELECT DISTINCT l.id AS lead_id
         FROM open_house_registrations r
         JOIN live_sessions s ON s.open_house_event_id = r.event_id AND s.status IN ('scheduled','live') AND s.session_date >= CURRENT_DATE
         JOIN leads l ON LOWER(l.email) = r.email_lower`, { type: QueryTypes.SELECT });
    const { checkLeadSendable } = await import('../services/communicationSafetyService');
    const sendable: number[] = [];
    let held = 0;
    for (const p of people) {
      const s = await checkLeadSendable(Number(p.lead_id), 'email' as any);
      if (s.sendable) sendable.push(Number(p.lead_id)); else held += 1;
    }
    log(`registrants: ${people.length} with a lead record; ${sendable.length} sendable to enroll, ${held} held back (unsubscribed, bounced or suppressed)`);
    if (apply && sendable.length) {
      const { enrollLeadsInCampaign } = await import('../services/campaignService');
      const res = await enrollLeadsInCampaign(campaign.id, sendable);
      const counts: Record<string, number> = {};
      for (const r of res as any[]) counts[r.status] = (counts[r.status] || 0) + 1;
      log(`registrants: ${JSON.stringify(counts)}`);
    }
  }

  // The dry run Ali reads: real AI drafts for N registrants, screened, emails masked.
  const drafts = Number(arg('--drafts') || 0);
  if (drafts > 0) {
    const { generateMessage } = await import('../services/aiMessageService');
    const { describePlatformActivity } = await import('../services/openHouseCountdownContext');
    const sample = await sequelize.query<{ email: string; name: string | null }>(
      `SELECT r.email_lower AS email, r.name FROM open_house_registrations r
         JOIN live_sessions s ON s.open_house_event_id = r.event_id AND s.status IN ('scheduled','live') AND s.session_date >= CURRENT_DATE
        ORDER BY random() LIMIT :n`, { replacements: { n: drafts }, type: QueryTypes.SELECT });
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Open House Countdown Drafts</title></head><body style="font-family:Segoe UI,Arial;max-width:900px;margin:20px auto;padding:0 16px">
<h1 style="color:#1a365d">Open House countdown: real AI drafts (dry run)</h1><p>${sample.length} registrants picked at random, each step written for that person by Maya's prompt. Emails are masked. Any draft marked REJECTED would not be sent; the safe fallback goes instead.</p>`;
    for (const p of sample) {
      const ev = await findNextOpenHouseForEmail(p.email);
      if (!ev) continue;
      const activity = await describePlatformActivity(p.email).catch(() => '');
      const masked = p.email.replace(/^(.).*(@.*)$/, '$1***$2');
      html += `<h2 style="border-top:2px solid #1a365d;padding-top:10px">${esc(masked)}</h2><p><i>${esc(activity || 'no platform activity recorded')}</i></p>`;
      const firstName = (p.name || '').trim().split(/\s+/)[0] || null;
      for (const step of COUNTDOWN_STEPS) {
        if (step.channel === 'voice') {
          html += `<div style="border:1px solid #ccd;border-radius:8px;margin:10px 0;padding:10px 14px;background:#f7f9fc"><b>Call, day of at noon</b> (only if they gave call permission): what Maya's voice agent is told
            <pre style="white-space:pre-wrap;font-family:inherit">${esc(countdownCallScript(firstName, ev, activity))}</pre></div>`;
          continue;
        }
        if (step.channel === 'sms') {
          html += `<div style="border:1px solid #ccd;border-radius:8px;margin:10px 0;padding:10px 14px;background:#f7f9fc"><b>Text, 1 hour before</b> (only if they gave text permission; sent through GHL)
            <p>${esc(fallbackReminderSms(firstName, ev))}</p></div>`;
          continue;
        }
        try {
          const r = await generateMessage({
            channel: 'email', ai_instructions: step.ai_instructions!, tone: step.ai_tone,
            lead: { name: p.name || '' } as any,
            campaignContext: { type: 'behavioral_trigger', name: CAMPAIGN_NAME, system_prompt: MAYA_SYSTEM_PROMPT },
            eventContext: { title: ev.title, when: ev.when_label, join_url: ev.join_url, minutes_before: step.minutes_before_event!, platform_activity: activity },
          } as any);
          const problems = screenEventReminderCopy(r.subject || '', r.body || '', ev.join_url);
          html += `<div style="border:1px solid #ccd;border-radius:8px;margin:10px 0;padding:10px 14px"><b>T-${step.minutes_before_event! >= 1440 ? step.minutes_before_event! / 1440 + ' day(s)' : step.minutes_before_event! / 60 + ' hours'}:</b> ${esc(r.subject || step.subject)}
            <span style="margin-left:8px;padding:2px 8px;border-radius:10px;background:${problems.length ? '#fbe9e7;color:#b3261e' : '#e6f4ec;color:#1f7a4d'}">${problems.length ? 'REJECTED: ' + esc(problems.join('; ')) : 'passes the screen'}</span>
            <div style="margin-top:8px">${problems.length ? fallbackReminderBody((p.name || '').split(' ')[0] || null, ev, step.minutes_before_event!) + '<p style="color:#888">(fallback shown, since the AI draft was rejected)</p>' : r.body}</div>
            <div style="color:#555;margin-top:6px;border-left:3px solid #1a365d;padding-left:10px"><b>${MAYA_NAME}</b><br>Director of Admissions<br>Colaberry Inc.</div></div>`;
        } catch (err: any) {
          html += `<p style="color:#b3261e">AI unavailable for this step (${esc(err.message)}): the fallback would be sent.</p>`;
        }
      }
    }
    fs.writeFileSync('/tmp/oh_countdown_drafts.html', html + '</body></html>');
    console.log(`drafts: wrote /tmp/oh_countdown_drafts.html (${sample.length} people)`);
  }

  // Ali's sign-offs for the two manual activation checks. Only on his word.
  const attest = arg('--attest');
  const by = arg('--by');
  if (attest && campaign) {
    if (!by || !by.includes('@')) throw new Error('--attest needs --by <admin email>');
    const ids = attest.split(',').map((s) => s.trim()).filter((s) => s === 'claims_approved' || s === 'dry_run_reviewed');
    for (const id of ids) {
      log(`attest ${id} by ${by}`);
      if (apply) {
        await sequelize.query(
          `UPDATE campaigns
              SET settings = COALESCE(settings, '{}'::jsonb)
                    || jsonb_build_object('activation_gate',
                         COALESCE(settings->'activation_gate', '{}'::jsonb) || jsonb_build_object(CAST(:key AS text), CAST(:val AS jsonb))),
                  updated_at = NOW()
            WHERE id = :id`,
          { replacements: { key: id, val: JSON.stringify({ by, at: new Date().toISOString() }), id: campaign.id } });
      }
    }
  }

  await sequelize.close();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('ensureOpenHouseCountdownCampaign failed:', err?.message || err);
    try { await sequelize.close(); } catch { /* closed */ }
    process.exit(1);
  });
}
