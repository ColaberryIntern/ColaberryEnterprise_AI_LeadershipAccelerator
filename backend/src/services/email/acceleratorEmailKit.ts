/**
 * The Accelerator email design language: tokens and row primitives.
 *
 * WHERE THIS CAME FROM. Aleem (Mohammed Abdul Aleem) posted two redesigns on
 * the UX Team to-do "Re-Design Screens Colaberry Platforms"
 * (https://app.basecamp.com/3945211/buckets/12724483/todos/10478732232) on
 * 2026-11-05 and Ali accepted them: the portal access email and the daily
 * community digest. His note on the first one states the problem both share:
 *
 *   "When user login, we are sending an email which is not matching the design
 *    language of website"
 *
 * His two digest attachments (community-digest-active-day.email.html and
 * community-digest-quiet-day.email.html) are hand-written, table-based,
 * Outlook-safe email HTML, and they are the authority for every value in
 * TOKENS below. This module exists so the two emails share one copy of that
 * language instead of each carrying its own near-identical 200 lines, and so
 * the next Accelerator email inherits it for free.
 *
 * WHY TABLES AND INLINE STYLES. Email clients, not browsers. Outlook renders
 * through Word, which ignores `display:grid`, `border-radius` on a `<div>` and
 * most of a `<style>` block. Aleem's own files use nested presentation tables,
 * inline styles, `mso-line-height-rule:exactly` and VML for the button, so the
 * primitives here do too. The one `<style>` block carries only the mobile
 * media query, which Outlook is free to ignore.
 *
 * Pure string building — no I/O, no env reads beyond the portal base URL, and
 * no sending. The send, the recipient override and the audit row stay in
 * emailService.
 */
import { env } from '../../config/env';

/** Design tokens, read off Aleem's accepted .email.html attachments. */
export const TOKENS = {
  pageBg: '#F8F8F7',
  brand: '#C20E1E',
  brandTint: '#FFF0F1',
  onBrandMuted: '#FFDBDD',
  card: '#FFFFFF',
  border: '#E4E4E3',
  borderInner: '#EFEFEE',
  ink: '#1A1A1A',
  inkMuted: '#4A4A4A',
  inkSubtle: '#5C5C5C',
  link: '#2E6A86',
  avatarBg: '#367895',
  sans: "Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif",
  mono: "'Roboto Mono',Menlo,Consolas,'Courier New',monospace",
} as const;

const T = TOKENS;

/** Portal origin, e.g. https://enterprise.colaberry.ai (no trailing slash). */
export function portalBase(): string {
  return (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
}

/**
 * Escape anything that reaches the markup from the database — a display name,
 * a post body, a cohort name. These emails interpolate learner-authored text
 * (the mention snippets), so this is a correctness requirement, not a nicety.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Mohammed Abdul Aleem" -> "Mohammed". Aleem's headlines address by first name. */
export function firstName(fullName: string): string {
  const first = String(fullName || '').trim().split(/\s+/)[0];
  return first || 'there';
}

/** The 20 zero-width spacers Aleem uses to stop clients pulling body copy into the preview line. */
const PREHEADER_PAD = '&#847;&zwnj;&nbsp;'.repeat(20);

/** A vertical gap between cards: 12px, as a table row (margins are unreliable in Outlook). */
export const spacerRow = '<tr><td style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>';

/** Row 1 of every Accelerator email: the wordmark, linked to the portal. */
export function logoRow(): string {
  const base = portalBase();
  return `  <tr>
    <td style="padding:0 0 20px;">
      <a href="${base}" target="_blank" style="text-decoration:none;"><img src="${base}/colaberry-horizontal.png" width="132" height="31" alt="Colaberry" style="display:block;width:132px;height:auto;max-width:132px;border:0;font-family:Arial,sans-serif;font-size:20px;line-height:31px;font-weight:700;color:${T.brand};"></a>
    </td>
  </tr>`;
}

export interface HeroOptions {
  /** Small mono caps line above the headline, e.g. "Accelerator Portal". */
  eyebrow: string;
  /** The one-line verdict. Plain text; escaped here. */
  headline: string;
  subhead: string;
  ctaHref: string;
  ctaLabel: string;
}

/** The cherry hero: eyebrow, verdict headline, one sentence, one white pill CTA. */
export function heroRow(o: HeroOptions): string {
  const label = escapeHtml(o.ctaLabel);
  return `  <tr>
    <td class="cb-hero" bgcolor="${T.brand}" style="background-color:${T.brand};border-radius:16px;padding:40px 36px;">
      <p style="margin:0 0 12px;font-family:${T.mono};font-size:12px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:1.2px;text-transform:uppercase;color:${T.onBrandMuted};">${escapeHtml(o.eyebrow)}</p>
      <h1 class="cb-h1" style="margin:0 0 12px;font-family:${T.sans};font-size:34px;line-height:40px;mso-line-height-rule:exactly;font-weight:900;letter-spacing:-0.5px;color:#FFFFFF;">${escapeHtml(o.headline)}</h1>
      <p style="margin:0 0 28px;font-family:${T.sans};font-size:16px;line-height:24px;mso-line-height-rule:exactly;color:#FFFFFF;">${escapeHtml(o.subhead)}</p>
      <table role="presentation" class="cb-btn" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
        <tr>
          <td align="center">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${o.ctaHref}" style="height:52px;v-text-anchor:middle;width:240px;" arcsize="50%" stroke="f" fillcolor="#FFFFFF"><w:anchorlock/><center style="color:${T.brand};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label} &rarr;</center></v:roundrect><![endif]-->
            <!--[if !mso]><!--><a href="${o.ctaHref}" target="_blank" style="display:block;background-color:#FFFFFF;padding:16px 28px;font-family:${T.sans};font-size:16px;line-height:20px;font-weight:700;color:${T.brand};text-decoration:none;text-align:center;border-radius:999px;white-space:nowrap;">${label} &rarr;</a><!--<![endif]-->
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** The white rounded card every content block sits in. `inner` is its contents. */
export function card(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.card}" style="background-color:${T.card};border:1px solid ${T.border};border-radius:16px;border-collapse:separate;">
        <tr><td class="cb-tile" valign="top" style="padding:22px 24px;">${inner}</td></tr>
      </table>`;
}

/** A card as its own full-width row. */
export function cardRow(inner: string): string {
  return `  <tr>
    <td>
      ${card(inner)}
    </td>
  </tr>`;
}

/** The mono caps label that heads a card, e.g. "UPCOMING". */
export function cardEyebrow(text: string): string {
  return `<p style="margin:0 0 8px;font-family:${T.mono};font-size:12px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:1.2px;text-transform:uppercase;color:${T.inkSubtle};">${escapeHtml(text)}</p>`;
}

/**
 * Big honest number over a small caption. Zeros are shown, not hidden — that
 * is the point Aleem makes about the old digest, which "buried two zeros".
 * `valueSize` is 36 in the digest and 32 in the portal access email.
 */
export function statTile(value: string, label: string, valueSize = 36): string {
  return card(`
              <p style="margin:0;font-family:${T.sans};font-size:${valueSize}px;line-height:${valueSize + 4}px;mso-line-height-rule:exactly;font-weight:900;letter-spacing:-0.5px;color:${T.ink};">${escapeHtml(value)}</p>
              <p style="margin:4px 0 0;font-family:${T.sans};font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:${T.inkSubtle};">${escapeHtml(label)}</p>
            `);
}

/** A wide card: mono caps label over one short bold line (the "Program" tile). */
export function labelledTile(label: string, value: string): string {
  return card(`
              <p style="margin:0 0 6px;font-family:${T.mono};font-size:12px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:1.2px;text-transform:uppercase;color:${T.inkSubtle};">${escapeHtml(label)}</p>
              <p style="margin:0;font-family:${T.sans};font-size:22px;line-height:30px;mso-line-height-rule:exactly;font-weight:700;color:${T.ink};">${escapeHtml(value)}</p>
            `);
}

/**
 * Two cards side by side at an uneven split, 12px gutter. Aleem's portal email
 * uses a 3-column grid in which a wide card spans two columns and a stat card
 * takes the third, then the next pair reverses that. `leftWidth` is the left
 * cell's percentage.
 */
export function splitRow(left: string, right: string, leftWidth: number): string {
  return `  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="${leftWidth}%" valign="top" style="padding:0 6px 0 0;">${left}</td>
        <td width="${100 - leftWidth}%" valign="top" style="padding:0 0 0 6px;">${right}</td>
      </tr></table>
    </td>
  </tr>`;
}

/** Two stat tiles side by side, 50/50 with a 12px gutter. */
export function twoTileRow(left: string, right: string): string {
  return `  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="50%" valign="top" style="padding:0 6px 0 0;">${left}</td>
        <td width="50%" valign="top" style="padding:0 0 0 6px;">${right}</td>
      </tr></table>
    </td>
  </tr>`;
}

/** A divided list item inside a card. */
export function listItem(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-top:1px solid ${T.borderInner};padding:14px 0;">${inner}</td>
          </tr></table>`;
}

/** The small teal link that ends a list item, e.g. "Reply", "Add to calendar". */
export function inlineLink(href: string, label: string, size = 13): string {
  return `<a class="gm-link" href="${href}" target="_blank" style="font-family:${T.sans};font-size:${size}px;line-height:${size + 5}px;font-weight:600;color:${T.link};text-decoration:none;">${escapeHtml(label)} &rarr;</a>`;
}

/** Closing row: the program line, then one line of smaller print. */
export function footerRow(programLine: string, fineHtml: string): string {
  return `  <tr>
    <td style="padding:16px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${T.border};padding:20px 0 0;">
        <p style="margin:0 0 4px;font-family:${T.sans};font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:${T.inkMuted};">${escapeHtml(programLine)}</p>
        <p style="margin:0;font-family:${T.sans};font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:${T.inkSubtle};">${fineHtml}</p>
      </td></tr></table>
    </td>
  </tr>`;
}

/**
 * Wrap composed rows in the document Aleem's attachments use: the mobile media
 * query, the hidden preheader, the grey page table and the 600px frame with its
 * Outlook-only width shim.
 */
export function emailShell(title: string, preheader: string, rows: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
html,body{margin:0!important;padding:0!important;width:100%!important}
*{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%}
table,td{mso-table-lspace:0pt!important;mso-table-rspace:0pt!important}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
u + .body .gm-link{color:${T.link}!important}
@media screen and (max-width:600px){
.cb-outer{padding:16px 12px 32px!important}
.cb-hero{padding:32px 22px!important}
.cb-h1{font-size:28px!important;line-height:34px!important}
.cb-tile{padding:20px!important}
.cb-btn{width:100%!important}
}
</style>
</head>
<body class="body" style="margin:0;padding:0;width:100%;background-color:${T.pageBg};word-spacing:normal;">
<div role="article" aria-roledescription="email" aria-label="${escapeHtml(title)}" lang="en" style="background-color:${T.pageBg};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${T.pageBg};">${escapeHtml(preheader)}${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.pageBg}" style="background-color:${T.pageBg};">
<tr><td class="cb-outer" align="center" style="padding:32px 16px 40px;">
<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;font-family:${T.sans};">
${rows}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`;
}
