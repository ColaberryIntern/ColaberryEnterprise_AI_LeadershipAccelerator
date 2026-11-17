/**
 * The live-session reminder email ("Tomorrow" and "Starting in 1 Hour"): the
 * data it needs and the HTML it renders. Pure; the send, the recipient
 * override and the audit row stay in emailService.
 *
 * WHY THE BUTTON GOES TO THE PORTAL AND NOT TO ZOOM. Attendance on this
 * platform is captured by ONE thing: the student pressing Join inside the
 * portal (`joinLiveSession`, via the check-in page or the live room). Zoom
 * has no participant feed we read. Until 2026-09-15 this email's "Join
 * Session" button was the raw Zoom link, so a student who clicked it, which
 * is the natural thing to do with a button that says Join, walked straight
 * into class and past the only turnstile we have. Measured that night: 16 of
 * 49 and 18 of 49 active students were marked present on the two most recent
 * sessions, and one wrote in, rightly, to ask why he was being emailed that
 * he had missed classes he sat through. His four "absences" each showed a
 * click on this button at class time.
 *
 * So the button now lands on `/portal/class-checkin/<session>`, which is the
 * same page the Class Kit QR code opens: it records attendance (idempotent),
 * then hands the student the live room and the Zoom link. A student who is
 * signed out is asked to sign in and comes straight back. The direct Zoom
 * link is kept underneath, in plain words, labelled with what it costs.
 */
import { env } from '../../config/env';
import { formatCentralClock } from '../centralDate';

export interface SessionReminderData {
  to: string;
  fullName: string;
  /** The live_sessions row id; the check-in page is keyed on it. */
  sessionId: string;
  sessionTitle: string;
  sessionNumber: number;
  sessionDate: string;
  startTime: string;
  meetingLink: string | null;
  materialsJson: any[] | null;
  isOneHour: boolean;
  /**
   * OH1 (Ali, 2026-11-17): true for an Open House, which is reminded from its
   * registrations (runOpenHouseReminderSweep). Those readers are prospects, not
   * students, so they get their own email: no "Session 0", no "pre-work".
   */
  isOpenHouse?: boolean;
}

/** One definition of the check-in URL, shared with the Class Kit QR code. */
export function sessionCheckinUrl(sessionId: string, base: string = env.frontendUrl || 'https://enterprise.colaberry.ai'): string {
  return `${base.replace(/\/+$/, '')}/portal/class-checkin/${encodeURIComponent(sessionId)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "Thursday, November 19" from a Central calendar date key; the raw key if it is not one. */
export function longSessionDate(sessionDate: string): string {
  const key = (sessionDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const ms = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(ms)) return key;
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(ms));
}

/** The first word of a full name, or null when there is none worth greeting. */
function firstName(full: string): string | null {
  const w = (full || '').trim().split(/\s+/)[0] || '';
  return w && !w.includes('@') ? w : null;
}

/**
 * The Open House subject line. Prospects read it in a crowded inbox, so it leads
 * with WHEN, in their words: "Tomorrow at 6:30 PM CDT" or "Starting in 1 hour".
 */
export function openHouseReminderSubject(data: SessionReminderData, urgencyLabel: string): string {
  const time = formatCentralClock(data.sessionDate, data.startTime);
  return data.isOneHour
    ? 'Starting in 1 hour: the Colaberry Open House'
    : `${urgencyLabel} at ${time}: the Colaberry Open House`;
}

/**
 * OH1 (Ali, 2026-11-17): the Open House reminder.
 *
 * Its readers registered from an ad or the training site; most have never been
 * to a class. The class template told them "Session 0", "your upcoming
 * Accelerator session" and "complete any pre-work". This one says what it is,
 * when, and how to get in.
 *
 * It deliberately says NOTHING about price, an offer or a discount. Ali's rule:
 * the Open House offer is announced live, in the room, and nowhere else.
 *
 * The button is the same portal check-in the class email uses, because that is
 * the only place attendance is recorded (see the header of this file).
 */
export function buildOpenHouseReminderHtml(data: SessionReminderData, urgencyLabel: string): string {
  const checkin = sessionCheckinUrl(data.sessionId);
  const name = firstName(data.fullName);
  const when = `${longSessionDate(data.sessionDate)} at ${formatCentralClock(data.sessionDate, data.startTime)}`;
  const opener = data.isOneHour
    ? 'We start in about an hour, and we are looking forward to seeing you.'
    : `You are registered for the Colaberry Open House, and we are looking forward to seeing you ${urgencyLabel === 'Today' ? 'today' : 'tomorrow'}.`;
  const fallback = data.meetingLink
    ? `<p class="note">If the button will not load, use the direct Zoom link: <a href="${escapeHtml(data.meetingLink)}">${escapeHtml(data.meetingLink)}</a></p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 22px; margin: 0 0 12px; }
    .when { background: #f7fafc; border-left: 4px solid #1a365d; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; font-weight: 600; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 8px 0; }
    .note { font-size: 14px; color: #4a5568; margin: 4px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>${data.isOneHour ? 'The Open House starts in 1 hour' : `See you ${urgencyLabel === 'Today' ? 'today' : 'tomorrow'} at the Open House`}</h1>

  <p>Hi${name ? ` ${escapeHtml(name)}` : ''},</p>

  <p>${opener}</p>

  <div class="when">${escapeHtml(when)}<br>${escapeHtml(data.sessionTitle)}</div>

  <p><a href="${checkin}" class="cta">Join the Open House</a></p>
  <p class="note">The button signs you in, checks you in, and takes you into the room.</p>
  ${fallback}

  <h2 style="color:#1a365d;font-size:17px;margin-top:24px;">What to expect</h2>
  <ul>
    <li>A walk through the program: what you build, week by week, and how the work becomes a portfolio.</li>
    <li>Live questions and answers. Bring yours.</li>
    <li>Keep your phone handy: we use it for quick polls during the session.</li>
  </ul>

  <p>Can't make it after all? Just reply and let us know.</p>

  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}

export function buildSessionReminderHtml(data: SessionReminderData, urgencyLabel: string): string {
  if (data.isOpenHouse) return buildOpenHouseReminderHtml(data, urgencyLabel);
  const materialsHtml = data.materialsJson?.length
    ? `<h2>Session Materials</h2><ul>${data.materialsJson.map((m: any) => `<li><a href="${m.url}">${m.title || m.url}</a></li>`).join('')}</ul>`
    : '';

  const checkin = sessionCheckinUrl(data.sessionId);
  const joinBlock = [
    `<p><a href="${checkin}" class="cta">Join Session</a></p>`,
    '<p class="join-note">Joining from this button records your attendance, then takes you into the class.</p>',
    data.meetingLink
      ? `<p class="join-note">If the portal will not load, the direct Zoom link is <a href="${escapeHtml(data.meetingLink)}">${escapeHtml(data.meetingLink)}</a>. Attendance is not recorded that way, so tell us if you had to use it.</p>`
      : '<p><em>The meeting link will be shared before the session starts.</em></p>',
  ].join('\n  ');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .join-note { font-size: 14px; color: #4a5568; margin: 4px 0; }
    .urgency { background: #fff3cd; border: 1px solid #ffc107; padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>Session ${data.sessionNumber}: ${data.sessionTitle}</h1>

  <div class="urgency">${urgencyLabel}</div>

  <p>Dear ${data.fullName},</p>

  <p>This is a reminder for your upcoming Accelerator session.</p>

  <div class="highlight">
    <strong>Session:</strong> #${data.sessionNumber} - ${data.sessionTitle}<br>
    <strong>Date:</strong> ${data.sessionDate}<br>
    <strong>Time:</strong> ${formatCentralClock(data.sessionDate, data.startTime)}
  </div>

  ${joinBlock}

  ${materialsHtml}

  <p>Please ensure you have completed any pre-work assignments before the session begins.</p>

  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}
