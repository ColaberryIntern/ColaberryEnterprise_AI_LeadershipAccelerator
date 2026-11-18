import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { classInstant } from './acceleratorService';
import { formatCentralClock } from './centralDate';
import { sessionCheckinUrl, longSessionDate } from './email/sessionReminderEmail';

/**
 * OH1 (Ali, 2026-11-17): the Open House countdown is a CAMPAIGN, sent by Maya.
 *
 * "You should be building through the campaign system ... The plan calls for an
 * entire campaign ... Maya should be the one sending out these emails."
 *
 * Every Open House registrant is enrolled on sign-up. Each step is timed back from
 * the start of the Open House THEY registered for (`minutes_before_event`), the
 * message is written for the person by the campaign's AI prompt, and it goes
 * through every gate the campaign system already has (approval, activation gate,
 * consent, suppression, kill switch, sender preflight).
 *
 * This file holds the parts that are specific to an event countdown:
 *   - finding the countdown campaign (by `settings.campaign_key`, never by name)
 *   - resolving a lead's next Open House (when, what, the Join link)
 *   - the copy screen every AI-written step must pass before it is sent
 *   - enrolling a new registrant (never throws: a sign-up must never fail on it)
 */

export const OPEN_HOUSE_COUNTDOWN_KEY = 'open_house_countdown';

export interface OpenHouseEventForLead {
  session_id: string;
  event_id: string;
  title: string;
  starts_at: Date;
  /** "Thursday, November 19 at 6:30 PM CST" */
  when_label: string;
  /** The portal check-in for THIS session: the only place attendance is recorded. */
  join_url: string;
}

/**
 * When a step fires: `minutesBefore` before the event, or null when that moment
 * has already passed (a countdown step for a moment gone by is never sent late).
 */
export function eventStepTime(startsAt: Date, minutesBefore: number, now: Date): Date | null {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) return null;
  if (!Number.isFinite(minutesBefore) || minutesBefore < 0) return null;
  const at = new Date(startsAt.getTime() - minutesBefore * 60_000);
  return at.getTime() > now.getTime() ? at : null;
}

/**
 * Words an Open House reminder must never contain. Ali, 2026-11-17: "We don't talk
 * about discounts in the communication. That is Open House offer only." Plus the
 * standing rule never to say "free" (TWC, 40 TAC 807.172(d)).
 */
const BANNED: Array<[RegExp, string]> = [
  [/discount/i, 'discount'],
  [/\boffers?\b/i, 'offer'],
  [/early[\s-]?bird/i, 'early bird'],
  [/scholarship/i, 'scholarship'],
  [/\bfree\b/i, 'free'],
  [/\$\s?\d/, 'a dollar amount'],
  [/\d+\s?%/, 'a percentage'],
  [/\bprice|pricing|tuition|cost\b/i, 'price'],
  [/\bseats? (?:left|remaining)\b|\blimited seats?\b/i, 'seat scarcity'],
  [/\bstrategy call\b|ai-architect/i, 'a sales call'],
  [/\[[A-Z][A-Za-z ]*\]/, 'a placeholder'],
];

/**
 * Every problem with an AI-written Open House reminder; empty when it may be sent.
 * Checked on the subject and the body. The body must carry the event's own Join
 * link and no other web link except the main site.
 */
export function screenEventReminderCopy(subject: string, body: string, joinUrl: string): string[] {
  const problems: string[] = [];
  const text = `${subject || ''}\n${body || ''}`;
  for (const [re, label] of BANNED) if (re.test(text)) problems.push(`mentions ${label}`);
  if (!joinUrl || !(body || '').includes(joinUrl)) problems.push('missing the Join link');
  const urls = (body || '').match(/https?:\/\/[^\s"'<>)]+/g) || [];
  for (const u of urls) {
    const clean = u.replace(/[.,;:!?]+$/, '');
    if (clean === joinUrl || clean === 'https://enterprise.colaberry.ai' || clean === 'https://enterprise.colaberry.ai/') continue;
    problems.push(`links somewhere else (${clean.slice(0, 60)})`);
  }
  return problems;
}

/**
 * The SAFE body a step falls back to when the AI copy fails the screen or the AI
 * is unavailable. Plain, true, and carrying the Join link. Paragraph HTML, because
 * the campaign wrapper adds Maya's signature and the footer around it.
 */
export function fallbackReminderBody(firstName: string | null, event: Pick<OpenHouseEventForLead, 'when_label' | 'join_url' | 'title'>, minutesBefore: number): string {
  const hi = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';
  const lead = minutesBefore <= 180
    ? `The Colaberry Open House starts soon: ${escapeHtml(event.when_label)}. We are looking forward to seeing you.`
    : `A quick reminder that you are registered for the Colaberry Open House on ${escapeHtml(event.when_label)}. We are looking forward to seeing you there.`;
  return [
    `<p>${hi}</p>`,
    `<p>${lead}</p>`,
    `<p>Join here when it is time. The link signs you in and checks you in: <a href="${event.join_url}">${event.join_url}</a></p>`,
    '<p>Bring your questions. If you can no longer make it, just reply and let me know.</p>',
  ].join('\n');
}

/**
 * The countdown TEXT. Deterministic (not AI-written): the general SMS prompt caps a text
 * at 160 characters and the Join link alone is ~95, and a fixed text cannot drift into an
 * offer. Plain text; it is written into the GHL `cory_sms_composed` field, and GHL's own
 * workflow on that field sends it (Ali: texts go out by updating a GHL field).
 */
export function fallbackReminderSms(firstName: string | null, event: Pick<OpenHouseEventForLead, 'when_label' | 'join_url'>): string {
  const hi = firstName ? `Hi ${firstName}, ` : 'Hi, ';
  const clock = (event.when_label.split(' at ')[1] || '').trim();
  const when = clock ? `starts at ${clock} today` : `starts soon (${event.when_label})`;
  return `${hi}it's Maya at Colaberry. The Open House ${when}, and we're looking forward to seeing you. Join here: ${event.join_url}`;
}

/**
 * What Maya's voice agent is told on a countdown call (Ali, 2026-11-17): "Our AI can
 * make those phone calls, relate to what they are doing, but not try to sell. Just help
 * and bring up the Open House event they registered and how we are really looking fwd
 * to seeing you. Then ... if they happen to say they are ready to sign up now, or give
 * some buying intent signals, then they should go on Rose's list to call."
 *
 * Deterministic on purpose: a call prompt is instructions to an agent, not copy, so it
 * is authored here and pinned by tests rather than written by a second model.
 */
export function countdownCallScript(
  firstName: string | null,
  event: Pick<OpenHouseEventForLead, 'title' | 'when_label'>,
  platformActivity: string,
): string {
  const who = firstName ? firstName : 'the person';
  return [
    `You are Maya, Director of Admissions at Colaberry, making a short, friendly call to ${who}.`,
    `${who} registered for the ${event.title}, ${event.when_label}. It is a live online session.`,
    platformActivity ? `What they have done on the Colaberry platform so far (true, from our records): ${platformActivity}` : 'We have no record of platform activity for them yet.',
    '',
    'YOUR GOAL: help them, and make them feel expected tonight. You are NOT selling.',
    '1. Say who you are and that you are calling because they registered for the Open House.',
    '2. If they have done something on the platform, mention it naturally and ask how it is going. If they are stuck, help briefly.',
    '3. Tell them we are really looking forward to seeing them, and that the Join link is in their email from Maya. It signs them in and checks them in.',
    '4. Ask if there is a question they want answered live at the Open House.',
    '5. Thank them and end the call. Aim for under two minutes.',
    '',
    'RULES:',
    '- Do not discuss pricing, payment, discounts, offers or enrollment terms. If they ask, say those are covered live at the Open House, and that an admissions advisor will follow up with them personally.',
    '- If they say they are ready to enroll now, or ask how to sign up, thank them, say an admissions advisor will call them, and note it clearly before ending the call.',
    '- Never invent facts about the program, jobs or salaries. Never pressure.',
    '- If they ask not to be called, apologize, confirm they will not be called again, and end the call.',
    '- If you reach voicemail: one short message that you are looking forward to seeing them at the Open House and the Join link is in their email. No other details.',
  ].join('\n');
}

/**
 * True only when this lead may be called or texted: a phone on file AND a current
 * express consent record for that channel. A countdown call or text is scheduled only
 * for these people, so the queue never fills with sends the consent gate would block.
 * (The scheduler's consent gate still runs again at send time.)
 */
export async function mayContactByPhone(channel: 'voice' | 'sms', leadId: number, phone: string | null | undefined): Promise<boolean> {
  if (!phone || !String(phone).trim()) return false;
  try {
    const { evaluateConsent } = await import('./consentService');
    const d = await evaluateConsent({ channel, leadId, phone });
    return d.verdict === 'allow';
  } catch {
    return false; // fail closed: no consent answer, no call or text
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The next Open House this email is registered for that has not started.
 * Null when there is none, and the caller then schedules NOTHING (fail closed:
 * an undated countdown must never collapse into "send everything now").
 */
export async function findNextOpenHouseForEmail(email: string, now: Date = new Date()): Promise<OpenHouseEventForLead | null> {
  const e = (email || '').trim().toLowerCase();
  if (!e) return null;
  const rows = await sequelize.query<{ id: string; title: string; session_date: string; start_time: string; open_house_event_id: string }>(
    `SELECT s.id, s.title, s.session_date::text AS session_date, s.start_time, s.open_house_event_id
       FROM open_house_registrations r
       JOIN live_sessions s ON s.open_house_event_id = r.event_id
      WHERE r.email_lower = :email
        AND s.status IN ('scheduled', 'live')
        AND s.session_date >= (CURRENT_DATE - 1)
      ORDER BY s.session_date ASC, s.start_time ASC`,
    { replacements: { email: e }, type: QueryTypes.SELECT },
  );
  for (const r of rows) {
    const startsAt = classInstant(r.session_date, r.start_time);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= now.getTime()) continue;
    return {
      session_id: String(r.id),
      event_id: String(r.open_house_event_id),
      title: r.title,
      starts_at: startsAt,
      when_label: `${longSessionDate(r.session_date)} at ${formatCentralClock(r.session_date, r.start_time)}`,
      join_url: sessionCheckinUrl(String(r.id)),
    };
  }
  return null;
}

/** The countdown campaign row, found by its key. Null when it has not been set up. */
export async function findOpenHouseCountdownCampaign(): Promise<{ id: string; status: string; sequence_id: string | null } | null> {
  const rows = await sequelize.query<{ id: string; status: string; sequence_id: string | null }>(
    `SELECT id, status, sequence_id FROM campaigns
      WHERE settings->>'campaign_key' = :key AND archived_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
    { replacements: { key: OPEN_HOUSE_COUNTDOWN_KEY }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/** True when the countdown campaign is live, so the scheduler's plain reminder sweep stands down. */
export async function isOpenHouseCountdownLive(): Promise<boolean> {
  const c = await findOpenHouseCountdownCampaign();
  return c?.status === 'active';
}

/**
 * Enroll one registrant in the countdown. NEVER throws: it runs inside the sign-up
 * request, and a person must get their account and their seat whatever happens here.
 *
 * While the campaign is a draft or paused the lead is queued (`enrolled`) and nothing
 * is scheduled; activating the campaign schedules them. That is the campaign system's
 * own behaviour (enrollLeadsInCampaign), not something added here.
 */
export async function enrollInOpenHouseCountdown(email: string): Promise<'enrolled' | 'no_campaign' | 'no_lead' | 'failed'> {
  try {
    const campaign = await findOpenHouseCountdownCampaign();
    if (!campaign || !campaign.sequence_id) return 'no_campaign';
    const leads = await sequelize.query<{ id: number }>(
      `SELECT id FROM leads WHERE LOWER(email) = :email ORDER BY id ASC LIMIT 1`,
      { replacements: { email: (email || '').trim().toLowerCase() }, type: QueryTypes.SELECT },
    );
    if (!leads[0]) return 'no_lead';
    const { enrollLeadsInCampaign } = await import('./campaignService');
    await enrollLeadsInCampaign(campaign.id, [Number(leads[0].id)]);
    return 'enrolled';
  } catch (err: any) {
    console.error('[OpenHouseCountdown] enrollment failed (sign-up unaffected):', err?.message);
    return 'failed';
  }
}
