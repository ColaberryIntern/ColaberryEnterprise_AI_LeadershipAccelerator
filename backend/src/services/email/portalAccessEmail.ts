/**
 * The Accelerator portal access email (the magic-link sign-in mail).
 *
 * REDESIGN SOURCE. Aleem, UX Team to-do "Re-Design Screens Colaberry
 * Platforms", comment 10478789584, 2026-11-05 08:02 UTC, accepted by Ali:
 *
 *   "When user login, we are sending an email which is not matching the design
 *    language of website so i have designed new please find the mockup and
 *    attached standalone HTML file"
 *
 * His mockup (Accelerator Portal Access Email (3).html) is a design-canvas
 * file, not email HTML: it lays the cards out with `display:grid` and carries
 * `{{ handlebars }}` for its desktop/mobile preview switch. So the structure,
 * copy and every token here are taken from his file, and the markup is
 * rewritten as the nested presentation tables his *digest* attachments use —
 * those are hand-written email HTML and are the house pattern. See
 * acceleratorEmailKit.ts.
 *
 * Layout, top to bottom, exactly as his mockup places it (his grid is three
 * columns; a card spanning two plus a stat card, then that pair reversed):
 *
 *   logo -> cherry hero (eyebrow, verdict headline, one line, white pill CTA)
 *   -> [ Program | 24h ] -> [ 1 | Inside your portal ]
 *   -> paste-the-link fallback + "didn't request this" notice
 *   -> divider + Colaberry Enterprise AI Division footer
 *
 * ── TWO CLAIMS FROM THE MOCKUP THAT ARE NOT TRUE, AND ARE NOT SHIPPED ──────
 *
 * His mockup says "Sign in with your secure one-time link" and gives a stat
 * tile reading "1x / single-use link". The token is NOT single use.
 * verifyMagicLink() in participantService.ts keeps it deliberately reusable:
 *
 *   "Keep token reusable — don't clear it. The token expires naturally
 *    via portal_token_expires_at. This lets users bookmark their portal link."
 *
 * The email this replaces made the same false claim ("can only be used once"),
 * so this is a copy fix carried along with the redesign, not a regression of
 * his design. What IS true, and is what the tile now says: requesting a link
 * overwrites `portal_token` (sendMagicLink in participantService.ts), so only
 * the newest link works. If the product decides single-use is the wanted
 * behavior, that is a change to verifyMagicLink and this copy follows it.
 */
import {
  TOKENS,
  emailShell,
  escapeHtml,
  firstName,
  footerRow,
  heroRow,
  labelledTile,
  logoRow,
  spacerRow,
  splitRow,
  statTile,
} from './acceleratorEmailKit';

const T = TOKENS;

export interface PortalAccessEmailData {
  fullName: string;
  cohortName: string;
}

/** What a learner finds behind the link — carried over from the old email verbatim. */
const PORTAL_INCLUDES = [
  'Session schedule and materials',
  'Assignment submissions',
  'Your readiness score and progress',
  'Session recordings',
];

function includesTile(): string {
  const lines = PORTAL_INCLUDES
    .map(
      (item) =>
        `<p style="margin:0;font-family:${T.sans};font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:${T.ink};">${escapeHtml(item)}</p>`
    )
    .join('\n              ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.card}" style="background-color:${T.card};border:1px solid ${T.border};border-radius:16px;border-collapse:separate;">
        <tr><td class="cb-tile" valign="top" style="padding:22px 24px;">
              <p style="margin:0 0 8px;font-family:${T.mono};font-size:12px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:1.2px;text-transform:uppercase;color:${T.inkSubtle};">Inside your portal</p>
              ${lines}
        </td></tr>
      </table>`;
}

/**
 * The fallback block. The full link is printed, not truncated as in the
 * mockup — a shortened URL cannot be pasted, which is the only reason this
 * block exists.
 */
function fallbackRow(magicLink: string): string {
  const href = escapeHtml(magicLink);
  return `  <tr>
    <td style="padding:16px 0 0;">
      <p style="margin:0 0 8px;font-family:${T.sans};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${T.inkSubtle};">Button not working? Paste this link into your browser:<br><a href="${href}" target="_blank" style="color:${T.link};text-decoration:underline;word-break:break-all;font-family:${T.mono};">${href}</a></p>
      <p style="margin:0;font-family:${T.sans};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${T.inkSubtle};">This link signs in as you, so please do not forward it. Did not request it? You can safely ignore this email.</p>
    </td>
  </tr>`;
}

/** Render the portal access email. Pure: no env-dependent branching, no I/O. */
export function buildPortalAccessEmailHtml(data: PortalAccessEmailData, magicLink: string): string {
  const name = firstName(data.fullName);
  const rows = [
    logoRow(),
    heroRow({
      eyebrow: 'Accelerator Portal',
      headline: `${name}, your portal is ready.`,
      subhead: 'Sign in with your secure personal link.',
      ctaHref: magicLink,
      ctaLabel: 'Access my portal',
    }),
    spacerRow,
    splitRow(labelledTile('Program', data.cohortName), statTile('24h', 'until the link expires', 32), 66),
    spacerRow,
    splitRow(statTile('1', 'link at a time, so use the newest', 32), includesTile(), 34),
    fallbackRow(magicLink),
    footerRow(
      'Colaberry Enterprise AI Division',
      'AI Leadership &middot; Architecture &middot; Implementation &middot; Advisory'
    ),
  ].join('\n');

  return emailShell(
    'Your Accelerator Portal Access',
    `${name}, your portal is ready. Sign in with your secure personal link.`,
    rows
  );
}
