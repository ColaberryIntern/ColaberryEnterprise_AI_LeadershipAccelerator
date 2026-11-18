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
  fallbackReminderBody, fallbackReminderSms, PORTAL_TODAY_URL,
} from '../services/openHouseCountdown';
import type { SequenceStep } from '../models/FollowUpSequence';

const MAYA_EMAIL = 'maya@colaberry.com';
const MAYA_NAME = 'Maya at Colaberry';
const EMAIL_DOMAIN = 'colaberry.com';
const SEQUENCE_NAME = 'Open House Countdown (Maya)';
const CAMPAIGN_NAME = 'Open House Countdown (Maya)';
const CAMPAIGN_DESCRIPTION = 'Every Open House registrant is enrolled at sign-up. Maya emails them 10, 6, 3 and 1 day(s) before and the afternoon of their Open House, each written for that person from their profile (what they have done on the platform, where they are, their momentum), and texts the ones with text consent an hour before, through GHL. No price, offer or discount (Ali, 2026-11-17).';

/**
 * Maya's campaign persona. OH1d (Ali, 2026-11-17): "This prompt needs to be much more significant.
 * Reverse engineer some of the Cold Campaign prompts ... I want that level of detail."
 * Structure follows the Strategy Call Readiness prompt (the one existing prompt written for a single
 * message timed against a scheduled event); the program knowledge follows Maya Inbound. Every fact
 * about the person comes from the profile in the user prompt; nothing here describes a person.
 */
export const MAYA_SYSTEM_PROMPT = `You are Maya, Director of Admissions at Colaberry. You are writing to one person who registered for a Colaberry Open House: a live, online session about the Forward Deployed AI Engineer Accelerator.

THE SITUATION
This is not outreach. This person chose to come. Most of them signed up from an ad in the last two weeks, created a Colaberry account, and many have already started exploring the learning platform: opening lessons, watching the welcome video, walking the campus, passing knowledge checks. Your job is to help them show up, feel expected, and get the most out of the hour. You are not selling.

These messages are timed back from the start of their Open House. One may arrive ten days out, another the day before, another a few hours before. Each message tells you how far out it is. Write for that moment. Never sound like a calendar notification.

YOUR OBJECTIVES
1. Make them feel personally expected: a real person noticed they signed up and is glad.
2. Relate to what they are actually doing on the platform. Their profile is in the message instructions; use it.
3. Reduce uncertainty about the Open House: what happens, how long, how to get in.
4. Help them arrive with a question. The best Open Houses are driven by the questions people bring.
5. Make joining effortless: the Join link signs them in and checks them in, no password hunting.
6. Keep their momentum on the platform going between now and then, without turning it into homework.

WHAT THE OPEN HOUSE IS (you may describe it this way)
- A live online session, about an hour, hosted by the Colaberry team.
- A walk through the Forward Deployed AI Engineer Accelerator: how it works and what people build in it.
- Live questions and answers. People can ask anything about the program, the platform, or whether it fits them.
- Quick live polls on their phone, so keeping a phone handy helps.
- They can come just to listen. There is no pressure to decide anything.
Do not describe outcomes, salaries, job placement, or anything about the program beyond this list. If a detail is not here, say they can ask it live.

HOW TO USE THEIR PROFILE
The profile lists verified facts in sections: who they are, how they found us, what they have done on the platform, and their momentum.
- Lead with ONE specific, true fact that shows you know where they are: the last lesson they completed, a lesson they opened but did not finish, the part of campus they were in, their streak, what they told us about their goal.
- Use at most two facts per message. Weave them in naturally. Never list their activity back to them.
- If they opened a lesson and did not finish it, that is the most useful fact you have: offer that it is a great thing to ask about live, or suggest picking it back up.
- If they are deep into the platform, acknowledge the effort in plain words. If they have barely started, make starting feel small and easy.
- Never sound like surveillance. Say "I saw you started the welcome video" or "you're already a few lessons in", never "our records show" or "we tracked".
- Never invent anything. If the profile says there is no activity, write a warm, simple message and invite a question. Do not guess at their job, goals or interests.
- The section marked FOR YOUR TONE ONLY shapes how warm and direct you are. Never mention it.

THE QUESTIONS PEOPLE CARRY INTO AN OPEN HOUSE
You may gently name one of these and invite them to bring it, because the answer is always "ask it live":
- "Am I technical enough for this?"
- "Is this for someone like me?"
- "What would I actually build?"
- "How much time does it take each week?"
- "Can I just listen?" (Yes.)

TONE AND VOICE
Warm, personal, plain American English. A real person who is glad they registered. Short paragraphs. Peer to peer, never corporate. No hype, no emojis, no exclamation-mark pile-ups, no "I hope this email finds you well". Do not sound scripted or automated. Use their first name.

HARD RULES (these never bend)
- Links: the event Join link, exactly as given, is required in every message. The only other link allowed is the platform Today page, exactly as given, and only when a step invites them back to the platform. No other links of any kind.
- Never mention price, cost, tuition, payment, a discount, an offer, a deal, an early bird, a scholarship, seats, deadlines to buy, or anything being at no charge. Never use the word spelled f-r-e-e in any form, not even in the phrase "feel f-r-e-e to" (say "you're welcome to" or "just reply" instead). Any offer is shared live at the Open House only.
- Never ask them to book a call and never mention a cohort start date.
- Never claim a prior conversation that did not happen.
- Do not add a sign-off or signature. Maya's signature is added automatically.

POSITIONING
This is not a sales email. This is a host saying: I'm glad you're coming, here is how to get the most out of it, see you there.`;

/**
 * The countdown, timed back from the start of the Open House each person registered for.
 * OH1d: spread across the two weeks people typically register ahead (ad sign-ups), each step
 * with one distinct job. A step whose moment has already passed when someone registers is
 * skipped, so a late registrant starts wherever the countdown is.
 */
export const COUNTDOWN_STEPS: SequenceStep[] = [
  {
    delay_days: 0, minutes_before_event: 10 * 24 * 60, channel: 'email',
    subject: 'Glad you are coming to the Colaberry Open House',
    body_template: '', step_goal: 'Welcome: make them feel expected and connect the Open House to what they are already doing',
    ai_instructions: 'Ten days out. Welcome them personally and say you are glad they are coming. Use one specific fact from their profile to show you know where they are on the platform (a lesson finished, a lesson opened, where they were on campus); if there is no activity, say the platform is open to them before the Open House and keep it light. Say in two sentences what the Open House is: a live hour walking through the program and what people build, with live Q&A and phone polls. Ask them to reply with one question they want answered live. Include the Join link once and say to save it. 120-170 words.',
    ai_tone: 'warm, personal, welcoming',
  },
  {
    delay_days: 0, minutes_before_event: 6 * 24 * 60, channel: 'email',
    subject: 'Picking up where you left off before the Open House',
    body_template: '', step_goal: 'Momentum: one small, specific next step on the platform',
    ai_instructions: 'Six days out. A short, helpful nudge built around their profile. If they opened a lesson and did not finish it, suggest picking that one back up and say it is a great thing to ask about live. If they finished lessons, acknowledge the progress in plain words and point to keeping it going. If they have not started, suggest one small first step on the platform (the welcome video on the Today page). You may include the Today page link once. Also include the Join link once. Do not repeat the welcome email. 90-140 words.',
    ai_tone: 'encouraging, practical, brief',
  },
  {
    delay_days: 0, minutes_before_event: 3 * 24 * 60, channel: 'email',
    subject: 'What happens at the Colaberry Open House',
    body_template: '', step_goal: 'Set expectations and invite their question',
    ai_instructions: 'Three days out. Tell them what to expect, in plain words: about an hour, a walk through the program and what people build, live Q&A, quick phone polls, and that they can come just to listen. Name one of the common questions people bring that fits their profile (for example "am I technical enough" for someone just starting, or "what would I build" for someone deep into lessons) and invite them to bring it. Reference their platform activity in one clause at most. Include the Join link once. 100-150 words.',
    ai_tone: 'clear, reassuring, personal',
  },
  {
    delay_days: 0, minutes_before_event: 24 * 60, channel: 'email',
    subject: 'Tomorrow: the Colaberry Open House',
    body_template: '', step_goal: 'Logistics: day, time, how to join',
    ai_instructions: 'One day out. Short logistics: it is tomorrow, give the day and start time, the Join link signs them in and checks them in, suggest putting it on their calendar, keep a phone handy for the polls. One warm personal line that fits their profile. Do not repeat earlier emails. 70-110 words.',
    ai_tone: 'friendly, brief',
  },
  {
    // Day of, four hours out (2:30 PM CT for a 6:30 PM Open House). Four hours, not one: the
    // scheduler sends about 120 per campaign per hour, so a whole list due one hour out would
    // still be going out after the start.
    delay_days: 0, minutes_before_event: 240, channel: 'email',
    subject: 'Today: the Colaberry Open House',
    body_template: '', step_goal: 'Get them into the room tonight',
    ai_instructions: 'Today, a few hours from now. Two or three sentences only: it is today at the start time (name it), here is the Join link, keep your phone handy for the live polls. If their profile has one natural hook (a question to bring), use it in a few words.',
    ai_tone: 'warm, very brief',
  },
  // NO CALL STEP yet: PR 2 adds Maya's call on our own Synthflow agent, after a test call to Ali.
  {
    // Day of, one hour out. A text to people with express SMS consent, written into the GHL
    // `cory_sms_composed` field. Fixed copy (fallbackReminderSms): a text must carry the Join
    // link, and the AI's SMS limit of 160 characters cannot fit it.
    delay_days: 0, minutes_before_event: 60, channel: 'sms',
    subject: 'Open House starts in an hour (text)',
    body_template: '', step_goal: 'Get them into the room',
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
    log(`sequence: create "${SEQUENCE_NAME}" (${COUNTDOWN_STEPS.length} steps: emails at 10, 6, 3 and 1 day(s) and 4 hours before, text 1 hour before)`);
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
                 'draft', :profile, :tenant, :brand, 'consideration', NULL, NOW(), NOW())
         RETURNING id`,
        { name: CAMPAIGN_NAME, desc: CAMPAIGN_DESCRIPTION,
          seq: seq.id, prompt: MAYA_SYSTEM_PROMPT, settings: JSON.stringify(settings),
          cc: JSON.stringify({ email: { enabled: true, daily_limit: 500 }, sms: { enabled: true, daily_limit: 250 } }),
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
        `UPDATE campaigns SET settings = COALESCE(settings, '{}'::jsonb) || CAST(:s AS jsonb),
                ai_system_prompt = :prompt, description = :desc, updated_at = NOW() WHERE id = :id`,
        { replacements: { s: JSON.stringify(COUNTDOWN_SETTINGS), prompt: MAYA_SYSTEM_PROMPT, desc: CAMPAIGN_DESCRIPTION, id: campaign.id } });
      log('campaign: system prompt and description refreshed');
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

  // The dry run Ali reads: real AI drafts for N registrants of the NEXT Open House, screened,
  // emails masked. OH1d: sampled across activity levels (deep into lessons, exploring the portal,
  // no activity) so Ali sees how the profile changes the message, and each person's profile is
  // shown above their emails so the personalization can be checked against the facts.
  const drafts = Number(arg('--drafts') || 0);
  if (drafts > 0) {
    const { generateMessage } = await import('../services/aiMessageService');
    const { gatherPersonProfile, renderPersonProfile } = await import('../services/openHouseProfile');
    const sample = await sequelize.query<{ email: string; name: string | null; lead_id: number | null; band: string }>(
      `WITH nxt AS (
         SELECT s.open_house_event_id AS event_id FROM live_sessions s
          WHERE s.open_house_event_id IS NOT NULL AND s.status IN ('scheduled','live') AND s.session_date >= CURRENT_DATE
          ORDER BY s.session_date, s.start_time LIMIT 1),
       r AS (
         SELECT r.email_lower AS email, r.name,
                (SELECT l.id FROM leads l WHERE LOWER(l.email) = r.email_lower ORDER BY l.id LIMIT 1) AS lead_id,
                (SELECT COUNT(*) FROM timeline_card_progress p WHERE p.enrollment_id = r.enrollment_id AND p.status = 'completed') AS done,
                (SELECT COUNT(*) FROM page_events pe JOIN visitors v ON v.id = pe.visitor_id
                  WHERE v.lead_id = (SELECT l.id FROM leads l WHERE LOWER(l.email) = r.email_lower ORDER BY l.id LIMIT 1)
                    AND pe.page_path LIKE '/portal/%') AS views
           FROM open_house_registrations r JOIN nxt ON nxt.event_id = r.event_id),
       banded AS (
         SELECT *, CASE WHEN done > 0 THEN 'lessons' WHEN views > 0 THEN 'exploring' ELSE 'none' END AS band,
                ROW_NUMBER() OVER (PARTITION BY CASE WHEN done > 0 THEN 'lessons' WHEN views > 0 THEN 'exploring' ELSE 'none' END ORDER BY random()) AS rn
           FROM r)
       SELECT email, name, lead_id, band FROM banded ORDER BY rn, band LIMIT :n`,
      { replacements: { n: drafts }, type: QueryTypes.SELECT });
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const label = (m: number) => (m >= 1440 ? `${m / 1440} day(s) before` : `${m / 60} hour(s) before`);
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Open House Countdown Drafts</title></head><body style="font-family:Segoe UI,Arial;max-width:900px;margin:20px auto;padding:0 16px">
<h1 style="color:#1a365d">Open House countdown: real AI drafts (dry run)</h1>
<p>${sample.length} registrants of the next Open House, picked across activity levels. Each person's profile (what the AI is given) is shown first, then every step written for them by Maya's prompt. Emails are masked. A draft marked REJECTED would not be sent; the safe fallback goes instead.</p>`;
    for (const p of sample) {
      const ev = await findNextOpenHouseForEmail(p.email);
      if (!ev) continue;
      const firstName = (p.name || '').trim().split(/\s+/)[0] || null;
      const profile = renderPersonProfile(await gatherPersonProfile(p.email, p.lead_id ?? null, firstName));
      const masked = p.email.replace(/^(.).*(@.*)$/, '$1***$2');
      html += `<h2 style="border-top:2px solid #1a365d;padding-top:10px">${esc(masked)} <small style="color:#888">(${p.band})</small></h2>
<details open><summary><b>Profile passed to the AI</b></summary><pre style="white-space:pre-wrap;background:#f7f9fc;padding:10px;border-radius:6px">${esc(profile)}</pre></details>`;
      for (const step of COUNTDOWN_STEPS) {
        if (step.channel === 'sms') {
          html += `<div style="border:1px solid #ccd;border-radius:8px;margin:10px 0;padding:10px 14px;background:#f7f9fc"><b>Text, 1 hour before</b> (only with text permission; sent through GHL)
            <p>${esc(fallbackReminderSms(firstName, ev))}</p></div>`;
          continue;
        }
        if (step.channel !== 'email') continue;
        try {
          const r = await generateMessage({
            channel: 'email', ai_instructions: step.ai_instructions!, tone: step.ai_tone,
            lead: { name: p.name || '' } as any,
            campaignContext: { type: 'behavioral_trigger', name: CAMPAIGN_NAME, system_prompt: MAYA_SYSTEM_PROMPT },
            eventContext: {
              title: ev.title, when: ev.when_label, join_url: ev.join_url, minutes_before: step.minutes_before_event!,
              person_profile: profile, step_goal: step.step_goal, portal_url: PORTAL_TODAY_URL,
            },
          } as any);
          const problems = screenEventReminderCopy(r.subject || '', r.body || '', ev.join_url);
          html += `<div style="border:1px solid #ccd;border-radius:8px;margin:10px 0;padding:10px 14px"><b>${label(step.minutes_before_event!)}:</b> ${esc(r.subject || step.subject)}
            <span style="margin-left:8px;padding:2px 8px;border-radius:10px;background:${problems.length ? '#fbe9e7;color:#b3261e' : '#e6f4ec;color:#1f7a4d'}">${problems.length ? 'REJECTED: ' + esc(problems.join('; ')) : 'passes the screen'}</span>
            <div style="margin-top:8px">${problems.length ? fallbackReminderBody(firstName, ev, step.minutes_before_event!) + '<p style="color:#888">(fallback shown, since the AI draft was rejected)</p>' : r.body}</div>
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
