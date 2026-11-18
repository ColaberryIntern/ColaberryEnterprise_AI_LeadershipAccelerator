import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { classInstant } from './acceleratorService';
import { formatCentralClock } from './centralDate';
import { sessionCheckinUrl, longSessionDate } from './email/sessionReminderEmail';
import { meaningfulHistory } from './openHouseCountdownContext';

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

/** The platform Today page: the one link besides the event's Join link a countdown message may carry. */
export const PORTAL_TODAY_URL = 'https://enterprise.colaberry.ai/portal/today';

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
  [/\bfree\b/i, 'a no-cost claim'],
  [/\$\s?\d/, 'a dollar amount'],
  [/\d+\s?%/, 'a percentage'],
  [/\bprice|pricing|tuition|cost\b/i, 'price'],
  [/\bseats? (?:left|remaining)\b|\blimited seats?\b/i, 'seat scarcity'],
  [/\bstrategy call\b|ai-architect/i, 'a sales call'],
  [/\[[A-Z][A-Za-z ]*\]/, 'a placeholder'],
];

/**
 * OH1e: rewrite the harmless idioms the model keeps writing despite the prompt, BEFORE the
 * screen. Measured on prod (20 drafts, Nov 18): 9 of 10 rejections were "feel ___ to bring
 * your questions" and 1 was "what we offer". Neither advertises anything, but the ban on the
 * word is absolute, so a warm, personal draft was being thrown away for the plain fallback.
 * Only these exact phrases are rewritten; anything else still fails the screen.
 */
export function softenIdioms(text: string): string {
  return (text || '')
    .replace(/\bFeel free to\b/g, "You're welcome to")
    .replace(/\bfeel free to\b/gi, "you're welcome to")
    .replace(/\bwhat we offer\b/gi, 'what we do');
}

/**
 * Every problem with an AI-written Open House reminder; empty when it may be sent.
 * Checked on the subject and the body. The body must carry the event's own Join
 * link and no other web link except the main site.
 */
export function screenEventReminderCopy(subject: string, body: string, joinUrl: string, extraAllowed: string[] = []): string[] {
  const problems: string[] = [];
  const text = `${subject || ''}\n${body || ''}`;
  for (const [re, label] of BANNED) if (re.test(text)) problems.push(`mentions ${label}`);
  if (!joinUrl || !(body || '').includes(joinUrl)) problems.push('missing the Join link');
  const urls = (body || '').match(/https?:\/\/[^\s"'<>)]+/g) || [];
  for (const u of urls) {
    const clean = u.replace(/[.,;:!?]+$/, '');
    if (clean === joinUrl || clean === 'https://enterprise.colaberry.ai' || clean === 'https://enterprise.colaberry.ai/') continue;
    // OH1d: the platform Today page, which a momentum step may invite them back to.
    if (clean === PORTAL_TODAY_URL) continue;
    // OH1f: the links of this email's own brain piece (a builder's public case study, the Events schedule).
    if (extraAllowed.includes(clean)) continue;
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
  const when = escapeHtml(event.when_label);
  const link = `<a href="${event.join_url}">${event.join_url}</a>`;
  // OH1f: one wording per stage, so a rejected draft never swaps in a copy of the last
  // fallback. (Day of was "<= 180" while the day-of step ran at 240, so it read as a
  // days-ahead reminder on the day itself.)
  if (minutesBefore < 1440) {
    return [
      `<p>${hi}</p>`,
      `<p>The Colaberry Open House is today: ${when}.</p>`,
      `<p>Your Join link signs you in and checks you in: ${link}</p>`,
      '<p>Keep your phone handy for the live polls. See you there.</p>',
    ].join('\n');
  }
  if (minutesBefore < 5 * 1440) {
    return [
      `<p>${hi}</p>`,
      `<p>The Colaberry Open House is coming up on ${when}. In that hour you will see what people in the program are building, and you can ask anything live, or just listen.</p>`,
      `<p>Save your Join link: ${link}</p>`,
      '<p>If a question is already on your mind, reply with it and I will make sure it gets answered.</p>',
    ].join('\n');
  }
  return [
    `<p>${hi}</p>`,
    `<p>You are registered for the Colaberry Open House on ${when}, and I am glad you are coming.</p>`,
    `<p>Join here when it is time. The link signs you in and checks you in: ${link}</p>`,
    '<p>If you can no longer make it, just reply and let me know.</p>',
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
 * What Maya's voice agent is given for a countdown call. A BRIEF, not a script (Ali,
 * 2026-11-17): "It has to be dynamic and the voice calls takes prompt. It should pass in
 * the purpose and all the details and then let it flow."
 *
 *   PURPOSE     why we are calling (help, relate, "really looking forward to seeing you")
 *   THE PERSON  every fact we hold about THIS person, so each call is about them
 *   THE EVENT   what they registered for and when
 *   HISTORY     what we have already said to each other
 *   GUARDRAILS  the few things that must hold whatever the conversation does
 *
 * The agent runs the conversation from that. The Synthflow agent's saved prompt is only
 * `{prompt}`, so this text is the whole of what it knows.
 */
export function countdownCallBrief(input: {
  firstName: string | null;
  event: Pick<OpenHouseEventForLead, 'title' | 'when_label'>;
  facts: import('./openHouseCountdownContext').CallFacts | null;
  history?: string;
}): string {
  const who = input.firstName || 'them';
  const f = input.facts;
  const history = meaningfulHistory(input.history || '');
  const person: string[] = [];
  if (f) {
    if (f.signed_up_on) person.push(`Created their Colaberry account on ${f.signed_up_on}${f.signup_source ? ` (came in through ${f.signup_source})` : ''}.`);
    if (f.completed_count > 0) {
      const list = f.completed.map((c) => `"${c.title}"${c.on ? ` (${c.on})` : ''}`).join(', ');
      person.push(`Has completed ${f.completed_count} assignment${f.completed_count === 1 ? '' : 's'} on the platform. Most recent: ${list}.`);
    } else if (f.signed_up_on) {
      person.push('Has not completed an assignment on the platform yet.');
    }
    if (f.in_progress.length) person.push(`Started but has not finished: ${f.in_progress.map((t) => `"${t}"`).join(', ')}. They may be stuck here; this is a good place to offer help.`);
    if (f.last_active_on) person.push(`Last active on the platform: ${f.last_active_on}.`);
    if (f.tour) person.push(`Has ${f.tour}.`);
    if (f.title || f.company) person.push(`Works as ${[f.title, f.company].filter(Boolean).join(' at ')}${f.industry ? ` (${f.industry})` : ''}.`);
    if (f.interest) person.push(`Told us they are interested in: ${f.interest}.`);
    if (f.their_note) person.push(`What they wrote to us: "${f.their_note}"`);
  }
  if (person.length === 0) person.push('We have no platform activity or background recorded for them yet. Ask what made them sign up.');

  return [
    `You are Maya, Director of Admissions at Colaberry, calling ${who}.`,
    '',
    'PURPOSE OF THIS CALL',
    `${who} registered for the ${input.event.title}, ${input.event.when_label}, a live online session. You are calling to help them and to let them know we are really looking forward to seeing them there. Relate to what they are actually doing on the platform: ask how it is going, help if they are stuck, and find out what they hope to get out of tonight. This is a friendly, helpful call. You are not selling.`,
    '',
    `WHAT WE KNOW ABOUT ${who.toUpperCase()} (true, from our records; use it naturally, never read it out as a list)`,
    ...person.map((p) => `- ${p}`),
    '',
    'THE OPEN HOUSE',
    `- ${input.event.title}, ${input.event.when_label}. Online. A walk through the program and what people build in it, live questions and answers, and quick polls on their phone.`,
    '- Their Join link is in the email from Maya. It signs them in and checks them in. If they cannot find it, tell them to reply to that email or check spam.',
    ...(history ? ['', 'WHAT WE HAVE ALREADY SAID TO EACH OTHER (do not repeat it; build on it)', history.slice(0, 1500)] : []),
    '',
    'LET THE CONVERSATION FLOW',
    'Introduce yourself and why you are calling, then follow their lead. Keep it warm, natural and short, a few minutes at most. Invite them to bring a question to answer live tonight.',
    '',
    'GUARDRAILS (these hold whatever the conversation does)',
    '- Pricing, payment, discounts, offers and enrollment terms are covered live at the Open House. If they ask, say so, and that an admissions advisor will follow up with them personally. Do not quote numbers.',
    '- If they say they are ready to enroll, or ask how to sign up, thank them, tell them an admissions advisor will call them, and say clearly before ending the call that they want to talk to an advisor.',
    '- Never invent facts about the program, jobs, salaries or about them. If you do not know, say someone will follow up.',
    '- If they ask not to be called again, apologize, confirm it, and end the call.',
    '- Voicemail: one short message that you are looking forward to seeing them at the Open House and the Join link is in their email. Nothing else.',
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
