/**
 * brand - PURE. The Colaberry header the report email and the interactive page share, so the two
 * always look like the same product (Ali, 10 Nov 2026: "do some colaberry branding up top").
 *
 * The logo is the white horizontal wordmark served by the platform itself, not an inline image:
 * Gmail strips data: URIs, and a hosted image keeps the email small. `alt="Colaberry"` keeps the
 * name readable when images are blocked. Email-safe: tables and inline styles only.
 */
export const BRAND = {
  navy: '#1a365d',
  red: '#C20E1E',
  logoUrl: 'https://enterprise.colaberry.ai/knowledge/assets/logo/colaberry-horizontal-white.png',
  site: 'https://enterprise.colaberry.ai',
} as const;

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Navy band: logo, a red rule, the product line, the title and a sub-line. `right` is optional
 * markup placed at the right (the page puts the guided-tour button there); it is NOT escaped, so
 * callers pass only markup they built.
 */
export function brandHeader(title: string, sub: string, right = ''): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.navy};border-radius:6px 6px 0 0">
<tr><td style="padding:18px 22px 14px">
  <a href="${BRAND.site}" style="text-decoration:none"><img src="${BRAND.logoUrl}" alt="Colaberry" width="150" style="display:block;width:150px;height:auto;border:0;color:#ffffff;font-size:22px;font-weight:700"></a>
  <div style="height:3px;width:48px;background:${BRAND.red};margin:12px 0 10px"></div>
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#cbd5e1">AI Internship &middot; Enterprise AI Leadership Accelerator</div>
  <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:2px">${esc(title)}</div>
  <div style="font-size:13px;color:#e2e8f0;margin-top:2px">${esc(sub)}</div>
</td>${right ? `<td style="padding:18px 22px;text-align:right;vertical-align:middle">${right}</td>` : ''}</tr></table>`;
}
