/**
 * What a new paying member is told (C10.18). PURE: context in, subject and body out.
 *
 * Separated from the sending so the copy can be tested as copy. Two of this project's gates act
 * on these exact strings and neither is forgiving:
 *
 *   1. `bannedWordOutboundCopy` (40 TAC 807.172(d)) fails the build on the word that means
 *      no-cost, in any string literal under `backend/src`, and a NEW file must contain ZERO
 *      occurrences - there is no baseline entry to inherit. The approved phrasings are
 *      "$0 to start" and "No card needed", and neither belongs in an email to somebody who has
 *      just paid, so the word simply does not appear.
 *   2. No em dashes or en dashes anywhere in outbound copy.
 *
 * ── WHAT THIS EMAIL HAS TO SAY, AND THE ORDER IT SAYS IT ──
 *
 * Ali's own ranking, from the ticket: that the curriculum is SELF-PACED and they can start
 * immediately is "the single most important line, because the batch name reads like a class that
 * begins later". So it is the first thing after the confirmation, above the orientation date,
 * above the room, above everything. A member who reads one line should read that one.
 *
 * The orientation date comes AFTER it, deliberately, because leading with a December date on a
 * November purchase is exactly the misreading the self-paced line exists to prevent.
 *
 * ── WHAT IS NOT CLAIMED ──
 *
 * No certification, no job guarantee, no placement claim. Colaberry does not certify anyone, and
 * an email is not the place to imply otherwise.
 */

/** Everything the copy needs. No model types, so the tests can build one literally. */
export interface PaidMemberWelcomeContext {
  /** Their name as given. A blank or missing name degrades to a greeting with no name. */
  fullName?: string | null;
  /** "November 2026" - the batch they were placed in, from the month they paid in. */
  batchLabel: string;
  /** "Monday, December 7, 2026 at 6:30 PM CT", or null when it cannot be resolved. */
  orientationLabel?: string | null;
  /** Absolute URL of the batch's own room, or null when there is not one yet. */
  roomUrl?: string | null;
  /** Absolute URL of the portal home. */
  portalUrl: string;
}

export interface PaidMemberWelcomeCopy {
  subject: string;
  html: string;
  text: string;
}

/** The first name, or '' when there is nothing usable. Never "Hi undefined". */
export function firstNameOf(fullName: string | null | undefined): string {
  const first = String(fullName ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}\p{M}'-]{1,40}$/u.test(first) ? first : '';
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The lines of the email, in order, as plain sentences.
 *
 * Returned as an array rather than a formatted blob so the HTML and the plain-text body are built
 * from ONE source. Two hand-written bodies drift, and the plain-text one drifts first because
 * nobody looks at it.
 */
export function paidMemberWelcomeLines(ctx: PaidMemberWelcomeContext): string[] {
  const lines: string[] = [];
  lines.push(`Your payment is confirmed and you are in the ${ctx.batchLabel} batch.`);
  // THE line. See the header: self-paced first, before any date.
  lines.push(
    'The curriculum is self-paced, so nothing waits for a start date. You can sign in and begin '
    + 'your first module today.',
  );
  if (ctx.roomUrl) {
    lines.push(
      'Your batch has its own room in the portal, visible only to your batch and to staff. Your '
      + 'first live meeting happens there.',
    );
  }
  if (ctx.orientationLabel) {
    // Ali, 2026-11-09: name the date and stop. What the sessions after it look like is not this
    // email's job.
    lines.push(`Your first live session is ${ctx.orientationLabel}.`);
  }
  return lines;
}

export function buildPaidMemberWelcomeCopy(ctx: PaidMemberWelcomeContext): PaidMemberWelcomeCopy {
  const name = firstNameOf(ctx.fullName);
  const greeting = name ? `You are in, ${name}.` : 'You are in.';
  const lines = paidMemberWelcomeLines(ctx);

  // The batch is named in the subject because the first question a new member has is which one
  // they joined, and the self-paced promise is second because it is what stops them waiting.
  const subject = `You are in the ${ctx.batchLabel} batch, and you can start today`;

  const buttonHref = ctx.roomUrl || ctx.portalUrl;
  const buttonLabel = ctx.roomUrl ? 'Open your batch room' : 'Open your portal';

  const html = [
    '<div style="font-family: arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2d3748;">',
    `<h1 style="font-size: 22px; color: #1a365d; margin: 0 0 16px;">${escapeHtml(greeting)}</h1>`,
    ...lines.map((line) => `<p style="margin: 0 0 14px;">${escapeHtml(line)}</p>`),
    '<p style="margin: 22px 0;">',
    `<a href="${escapeHtml(buttonHref)}" style="display: inline-block; background: #2b6cb0; color: #ffffff;`
    + ` padding: 11px 22px; border-radius: 4px; text-decoration: none; font-weight: 600;">`
    + `${escapeHtml(buttonLabel)}</a>`,
    '</p>',
    `<p style="margin: 0 0 14px;">Everything is in your portal: <a href="${escapeHtml(ctx.portalUrl)}"`
    + ` style="color: #2b6cb0;">${escapeHtml(ctx.portalUrl)}</a></p>`,
    '<p style="margin: 20px 0 0; color: #4a5568;">The Colaberry Training Team</p>',
    '</div>',
  ].join('\n');

  const text = [
    greeting,
    '',
    ...lines.flatMap((line) => [line, '']),
    `${buttonLabel}: ${buttonHref}`,
    `Your portal: ${ctx.portalUrl}`,
    '',
    'The Colaberry Training Team',
  ].join('\n');

  return { subject, html, text };
}
