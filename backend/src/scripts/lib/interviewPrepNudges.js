/* eslint-disable */
/**
 * interviewPrepNudges.js
 *
 * Pure content builder for the student-facing interview-prep nudges. Given a
 * classified interview row (from interviewPrepData.normalize), returns the nudge
 * "beat" to fire today (or null), plus the student-facing subject/html/text.
 *
 * Design intent (per Ali): every message reads as informative + encouraging, but
 * each one is engineered to move the student exactly one step down the funnel:
 *   logged -> review 10 Qs -> draft answers -> Auto Mock (repeat) -> mentor mock
 *   -> interview -> post-interview survey.
 * After the interview we flip from "prepare" to "how did it go": congratulate one
 * day out, then push the post-interview survey (the IPBC "Send Survey link").
 *
 * NO I/O. The engine (dailyInterviewPrepNudges.js) decides preview-vs-live,
 * idempotency, recipient resolution, and sending. This module only builds words.
 *
 * One beat per interview per day. beatKey is stored in state so the same beat is
 * not re-sent; a new beat fires only when the student advances a stage or the
 * timeline crosses a threshold (day-of, +1 day, survey-overdue).
 */

const BRAND = '#0f1729';
const ACCENT = '#1d4ed8';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Shared, student-appropriate sign-off (NOT Ali's MD signature block — these go
// to students from the coaching system).
function signoffHtml() {
  return `<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
    Cheering you on,<br/><b style="color:${BRAND};">Colaberry IPBC Placement Team</b></div>`;
}
function signoffText() {
  return `\n\nCheering you on,\nColaberry IPBC Placement Team`;
}
function wrap(inner) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:560px;">${inner}${signoffHtml()}</div>`;
}
function btn(label) {
  // The IPBC app is the action surface; we name the button rather than deep-link
  // (deep links require an authed session). Students act inside app.colaberry.com.
  return `<div style="margin:14px 0;"><span style="display:inline-block;background:${ACCENT};color:#fff;font-weight:700;padding:10px 18px;border-radius:6px;">${esc(label)}</span></div>`;
}

function header(row) {
  return `<div style="font-size:12px;color:#6b7280;">${esc(row.company)} &middot; ${esc(row.jobTitle)} &middot; ${esc(row.type)}</div>`;
}

/* Decide which beat fires today for this interview. Returns a beat key or null. */
function pickBeat(row) {
  if (row.days > 0) {
    // pre-interview: push the next funnel step, escalating as the date nears.
    // Only nudge within a 10-day runway (earlier than that, leave them be).
    if (row.days > 10) return null;
    switch (row.stage) {
      case 'NOT_STARTED': return 'kickoff';
      case 'PRACTICING': return 'practice';
      case 'AUTO_READY': return 'book_mentor';
      case 'MENTOR_DONE': return 'final_polish';
      default: return null;
    }
  }
  if (row.days === 0) return 'day_of';
  if (row.days === -1) return 'congrats_survey';        // congratulate + first survey ask
  if (row.days <= -2 && !row.hasSurvey) return 'survey_reminder';
  return null;
}

function urgencyPrefix(row) {
  if (row.tier === 'CRITICAL') return 'Time-sensitive: ';
  if (row.tier === 'IMMINENT') return 'Almost there: ';
  return '';
}

function build(row) {
  const beat = pickBeat(row);
  if (!beat) return null;
  const who = (row.student || '').split(/\s+/)[0] || 'there';
  const when = row.days > 0 ? `in ${row.days} day${row.days === 1 ? '' : 's'}` : row.days === 0 ? 'today' : `${Math.abs(row.days)} days ago`;
  let subject, lead, body, cta, congrats = false;

  switch (beat) {
    case 'kickoff':
      subject = `${urgencyPrefix(row)}Let's get your ${row.company} interview prep started`;
      lead = `Your ${esc(row.type)} interview with <b>${esc(row.company)}</b> is ${when}. Right now your prep score is ${row.prepScore}% and you have not started your mock interviews yet.`;
      body = `Here is the single most valuable thing you can do today: review the 10 interview questions we sent, draft your answers, and run your first <b>Auto Mock interview</b> to get scored. That one action moves you from "not started" to "in progress" and tells your mentor you are engaged.`;
      cta = btn('Start your first Auto Mock interview');
      break;
    case 'practice':
      subject = `${urgencyPrefix(row)}Keep your ${row.company} momentum — finish your Auto Mocks`;
      lead = `Nice work starting your prep for <b>${esc(row.company)}</b> (${when}). You have ${row.autoMocks} Auto Mock${row.autoMocks === 1 ? '' : 's'} in.`;
      body = `The students who land offers run the Auto Mock until the answers come out smoothly. Get to <b>at least 2</b> and push your score up. Once you have the reps in, you unlock the mentor mock, which is the last gate before the real thing.`;
      cta = btn('Run another Auto Mock interview');
      break;
    case 'book_mentor':
      subject = `${urgencyPrefix(row)}You're ready for your mentor mock — book it with ${row.mentor || 'your mentor'}`;
      lead = `Strong prep for <b>${esc(row.company)}</b> (${when}). You have the Auto Mock reps in.`;
      body = `The next step is the <b>instructor mock interview</b> with ${esc(row.mentor || 'your mentor')}. They will run the same 10 questions and rate your delivery so there are no surprises in the real interview. Reach out today to lock in a time before your interview date.`;
      cta = btn('Schedule your mentor mock interview');
      break;
    case 'final_polish':
      subject = `Final polish for your ${row.company} interview`;
      lead = `Your mentor mock is done and your <b>${esc(row.company)}</b> interview is ${when}. You are in great shape.`;
      body = `One last thing that pays off: run the Auto Mock one more time to keep the answers warm and your delivery confident. Walk in knowing you have already answered these questions out loud.`;
      cta = btn('Do a final Auto Mock run-through');
      break;
    case 'day_of':
      subject = `Your ${row.company} interview is today — you've got this`;
      lead = `Today is the day: your ${esc(row.type)} interview with <b>${esc(row.company)}</b>.`;
      body = `Breathe, slow down, and lean on the answers you practiced. One ask for right after: as soon as it wraps, <b>log how it went</b> with your post-interview survey while it is fresh. That is how we line up your next step.`;
      cta = btn('After the interview: complete your survey');
      break;
    case 'congrats_survey':
      congrats = true;
      subject = `Congratulations on your ${row.company} interview! How did it go?`;
      lead = `Congratulations on getting through your <b>${esc(row.company)}</b> interview yesterday. Win or learn, showing up and competing is the hard part, and you did it.`;
      body = `Now help us help you: take <b>2 minutes</b> to complete your post-interview survey. It tells us exactly how it went so we can prep you for the next round, line up the next opportunity, or celebrate the offer with you.`;
      cta = btn('Complete your 2-minute post-interview survey');
      break;
    case 'survey_reminder':
      subject = `Quick follow-up on your ${row.company} interview`;
      lead = `Your <b>${esc(row.company)}</b> interview was ${when} and we have not heard how it went yet.`;
      body = `Whether it was a home run or a tough one, your post-interview survey is how we move you to what is next. It takes 2 minutes and it is the only thing standing between you and your next step.`;
      cta = btn('Tell us how it went — 2-minute survey');
      break;
    default:
      return null;
  }

  const html = wrap(`<div style="font-size:16px;font-weight:800;color:${BRAND};margin-bottom:4px;">Hi ${esc(who)},</div>
    ${header(row)}
    <p style="margin:12px 0;">${lead}</p>
    <p style="margin:12px 0;">${body}</p>
    ${cta}
    <p style="font-size:12px;color:#6b7280;margin-top:14px;">Open <b>app.colaberry.com</b> &rarr; My Roles &rarr; IPBC to take action.</p>`);

  const text = `Hi ${who},\n\n${row.company} - ${row.jobTitle} (${row.type})\n\n`
    + `${lead.replace(/<[^>]+>/g, '')}\n\n${body.replace(/<[^>]+>/g, '')}\n\n`
    + `Open app.colaberry.com > My Roles > IPBC to take action.${signoffText()}`;

  return { beat, congrats, subject, html, text };
}

module.exports = { build, pickBeat };
