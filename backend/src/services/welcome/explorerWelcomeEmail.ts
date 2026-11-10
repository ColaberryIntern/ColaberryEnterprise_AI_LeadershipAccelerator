/**
 * The welcome a new Explorer actually receives — the Open House / landing-page
 * funnel's first contact.
 *
 * ── WHY A SECOND TEMPLATE ───────────────────────────────────────────────────
 *
 * `buildTrainingWelcomeHtml` greets someone who enrolled in a program: "your
 * seat is reserved", "your program roadmap", "what to expect week one". A person
 * who just signed up on a landing page has not enrolled in anything. They clicked
 * an ad about an Open House, gave an email, and now have an account they did not
 * explicitly ask for. That email also never mentioned the Open House, the first
 * assignment, or why any of it is worth two minutes of their evening.
 *
 * Ali, 2026-11-10, on the rendered original: "This is not the right message."
 *
 * The existing template is kept untouched for the paths that genuinely do greet
 * an enrolment (paidMemberWelcomeService, the recovery send). Its own header warns
 * against duplicating a branded layout, and that warning is respected in the one
 * way that matters: this is not a copy of it. It is a different layout for a
 * different reader, and the two will not drift into each other because neither
 * generates the other.
 *
 * ── EVERY CLAIM HERE TRACES TO A SOURCE ─────────────────────────────────────
 *
 * This email's job is to get somebody to finish a two-minute video, and the most
 * persuasive material available is what the video itself says. Every line below
 * about the market, the role or the programme comes from
 * `week0ProgramVideoFirst.ts`, whose answers were checked against the video's
 * transcript on 2026-11-09. The assignment names and durations are the live
 * `timeline_cards` rows for week 0, read from production on 2026-11-10.
 *
 * Nothing here invents a salary, a placement rate or a job count. The video does
 * quote figures; this email points at them rather than restating numbers it
 * cannot verify.
 *
 * ── THE WORD THAT CANNOT APPEAR ─────────────────────────────────────────────
 *
 * 40 TAC 807.172(d) governs how a licensed career school may advertise, so the
 * approved phrasings in this repo are "$0 to start" and "No card needed". That
 * holds in an email as much as on a page.
 */

export interface ExplorerWelcomeData {
  fullName: string;
  /** The magic link. Already carries `next=` to the first assignment (OH-4). */
  portalLink: string;
}

export const EXPLORER_WELCOME_SUBJECT = "You're in. Your first assignment takes 2 minutes.";

/**
 * The first assignments as they actually exist, in `timeline_cards` order for
 * week 0. Titles and minutes read from production 2026-11-10.
 *
 * A promise of work a new Explorer will not find is worse than no promise, so
 * these are stated rather than described, and the list stops where certainty
 * does.
 */
export const FIRST_ASSIGNMENTS: ReadonlyArray<{ title: string; minutes: number; note: string }> = [
  { title: 'A welcome from Ali', minutes: 2, note: 'Where the AI market is right now, and what to do about it' },
  { title: 'Quick check: how this program works', minutes: 5, note: 'Five questions, all answered in the video' },
  { title: 'Self study', minutes: 15, note: 'Your first look at building, not just reading' },
  { title: 'Video: What is Colaberry', minutes: 10, note: 'Who we are and how the program runs' },
];

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** First name only, for a greeting. Falls back to nothing rather than to "there". */
export function greetingName(fullName: string | null | undefined): string {
  if (typeof fullName !== 'string') return '';
  const first = fullName.trim().split(/\s+/)[0] || '';
  return /^[\p{L}'-]{1,40}$/u.test(first) ? first : '';
}

const INK = '#1A1A1A';
const BODY = '#2B2B2B';
const MUTED = '#6B6B6B';
const LINE = '#E4E4E3';
const CHERRY = '#FB2832';
const PAGE = '#F4F4F3';
const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function assignmentRow(index: number, item: { title: string; minutes: number; note: string }): string {
  return `
            <tr>
              <td style="padding:0 0 14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td width="34" valign="top" style="width:34px; padding-top:1px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr><td width="26" height="26" align="center" valign="middle" style="width:26px; height:26px; background:${CHERRY}; border-radius:13px; color:#ffffff; font-family:${FONT}; font-size:13px; font-weight:700; line-height:26px;">${index}</td></tr>
                      </table>
                    </td>
                    <td valign="top" style="font-family:${FONT};">
                      <div style="font-size:15px; font-weight:700; color:${INK}; line-height:1.35;">${esc(item.title)} <span style="font-weight:400; color:${MUTED}; font-size:13px;">&nbsp;${item.minutes} min</span></div>
                      <div style="font-size:13.5px; color:${MUTED}; line-height:1.5; margin-top:2px;">${esc(item.note)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

export function buildExplorerWelcomeHtml(data: ExplorerWelcomeData): string {
  const name = greetingName(data.fullName);
  // ESCAPED FOR AN ATTRIBUTE, not used raw. The link carries `?token=...&next=...`,
  // and a bare `&` inside an attribute is ambiguous markup that a strict parser is
  // entitled to read as the start of an entity. Email clients vary in how lenient
  // they are, and a sign-in link that works in nine of them is still a broken
  // link. `&amp;` is the same URL to every client that follows the spec.
  const link = esc(data.portalLink);
  const greeting = name ? `You&#39;re in, ${esc(name)}.` : 'You&#39;re in.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(EXPLORER_WELCOME_SUBJECT)}</title>
</head>
<body style="margin:0; padding:0; background:${PAGE};">
<!-- Preheader: the first line an inbox shows next to the subject. -->
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Two minutes with Ali on where the AI market actually is &mdash; then your account is live. No card needed.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAGE};">
  <tr><td align="center" style="padding:28px 12px 40px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px; background:#ffffff; border:1px solid ${LINE}; border-radius:18px; overflow:hidden;">

      <!-- Brand -->
      <tr><td style="padding:26px 32px 0; font-family:${FONT};">
        <span style="font-size:20px; font-weight:700; color:${INK}; letter-spacing:-.01em;"><span style="color:${CHERRY};">C</span>olaberry</span>
        <span style="display:inline-block; margin-left:8px; padding-left:10px; border-left:1px solid ${LINE}; font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:${MUTED}; vertical-align:middle;">AI Preview</span>
      </td></tr>

      <!-- Headline -->
      <tr><td style="padding:22px 32px 0; font-family:${FONT};">
        <div style="display:inline-block; padding:5px 12px; border-radius:999px; background:rgba(251,40,50,.10); color:#C20E1E; font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase;">$0 to start &nbsp;&bull;&nbsp; No card needed</div>
        <h1 style="margin:16px 0 0; font-size:30px; line-height:1.18; font-weight:700; color:${INK}; letter-spacing:-.02em;">${greeting}</h1>
        <h1 style="margin:2px 0 0; font-size:30px; line-height:1.18; font-weight:700; color:${CHERRY}; letter-spacing:-.02em;">Your AI training starts now.</h1>
      </td></tr>

      <!-- The pitch, and the reason to press play -->
      <tr><td style="padding:18px 32px 0; font-family:${FONT}; font-size:15.5px; line-height:1.62; color:${BODY};">
        <p style="margin:0 0 14px;">Start with two minutes from <strong>Ali Muwwakkil</strong> &mdash; Managing Director, and the person who built this platform. He walks through where the AI job market actually is right now, what a <em>frontier engineer</em> does, and why this is the moment to start.</p>
        <p style="margin:0 0 14px;">A frontier engineer is the person who doesn&#39;t just chat with AI &mdash; they go into a business and build real AI systems that work. That is the job this program is pointed at.</p>
        <p style="margin:0;">One thing to watch for: the Ali you see in that video is an <strong>AI avatar</strong>, made with the same kind of tools you&#39;re about to learn here.</p>
      </td></tr>

      <!-- CTA -->
      <tr><td style="padding:24px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="border-radius:12px; background:${CHERRY};">
            <a href="${link}" style="display:block; padding:16px 24px; font-family:${FONT}; font-size:16.5px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:12px;">Claim your account &amp; watch &nbsp;&rarr;</a>
          </td></tr>
        </table>
        <p style="margin:10px 0 0; font-family:${FONT}; font-size:13px; line-height:1.5; color:${MUTED}; text-align:center;">Opens your account and plays the video. Nothing to install, nothing to pay.</p>
      </td></tr>

      <!-- The line from the video itself -->
      <tr><td style="padding:22px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F7F6; border-left:3px solid ${CHERRY}; border-radius:0 10px 10px 0;">
          <tr><td style="padding:14px 16px; font-family:${FONT}; font-size:15px; line-height:1.55; color:${INK};">
            &ldquo;Stay with me to the end. <strong>Finishing this video is your first win.</strong>&rdquo;
            <div style="font-size:12.5px; color:${MUTED}; margin-top:4px;">&mdash; Ali, in the video</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- What comes next -->
      <tr><td style="padding:26px 32px 0; font-family:${FONT};">
        <div style="font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:${MUTED}; margin-bottom:14px;">Your first assignments</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${FIRST_ASSIGNMENTS.map((a, i) => assignmentRow(i + 1, a)).join('')}
        </table>
      </td></tr>

      <!-- Why it stays current, and that they are not alone -->
      <tr><td style="padding:8px 32px 0; font-family:${FONT}; font-size:15px; line-height:1.6; color:${BODY};">
        <p style="margin:0 0 12px;">After that, it keeps going. <strong>Every week Ali goes live on a new topic</strong>, so what you learn is current &mdash; never last year&#39;s slides.</p>
        <p style="margin:0;">And you won&#39;t be doing it alone: we meet at the Open House and in class. <strong>You don&#39;t need to be technical to start.</strong> You just need to show up.</p>
      </td></tr>

      <!-- Fallback link -->
      <tr><td style="padding:24px 32px 0; font-family:${FONT};">
        <p style="margin:0 0 6px; font-size:12.5px; color:${MUTED};">Button not working? Paste this into your browser:</p>
        <p style="margin:0; font-size:12.5px; line-height:1.5; word-break:break-all;"><a href="${link}" style="color:#2E6A86;">${link}</a></p>
        <p style="margin:12px 0 0; font-size:12.5px; color:${MUTED};">This sign-in link is yours alone and works for the next 30 days.</p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:22px 32px 26px; margin-top:8px; border-top:1px solid ${LINE}; background:#FAFAF9; font-family:${FONT};">
        <div style="font-size:14px; font-weight:700; color:${INK};">The Colaberry Team</div>
        <div style="font-size:12px; line-height:1.55; color:${MUTED}; margin-top:4px;">
          Colaberry &bull; AI Training, Architecture &amp; Career Acceleration<br>
          You received this because you signed up for a Colaberry Open House and your $0 account was created at the same time.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`.trim();
}
