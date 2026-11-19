import { env } from '../../config/env';

/**
 * The campaign email wrapper: body, the one CTA button, the sender's signature block (name, title,
 * Colaberry Inc., site and address) and the legal footer with the unsubscribe link.
 *
 * OH1o: moved here UNCHANGED from schedulerService.ts so Explorer Growth emails carry the exact same
 * Maya signature the campaign and Open House countdown emails get (Ali, 2026-11-18: Explorer emails
 * had no signature). One function, two callers: the scheduler at send time, and the Explorer approval
 * queue at compose time (that queue stores the exact bytes that leave, so it is wrapped there).
 */
export function wrapEmailHtml(
  body: string,
  tracking?: { campaignId?: string; campaignType?: string; leadId?: number; senderName?: string; senderEmail?: string; unsubscribeUrl?: string },
): string {
  const senderName = tracking?.senderName || 'Colaberry Enterprise AI';
  const senderEmail = tracking?.senderEmail || env.emailFrom;
  // OH1: Maya signs her campaign mail with her own title (the same one the
  // admissions-document email uses).
  const title = senderEmail === 'ali@colaberry.com' ? 'Managing Director / Forward Deployed AI Engineer'
    : senderEmail === 'maya@colaberry.com' ? 'Director of Admissions' : '';
  const titleLine = title ? `<div style="font-size:14px;color:#2b6cb0;font-weight:600;">${title}</div>` : '';

  // Detect the first prominent CTA URL in the body (pilot, partners, demo pages on enterprise.colaberry.ai)
  // and inject a styled button after the body so it's visually prominent rather than buried inline.
  let primaryCtaButton = '';
  // OH1: an Open House countdown email's Join link (the portal check-in) gets the button.
  const joinMatch = body.match(/https?:\/\/enterprise\.colaberry\.ai\/portal\/class-checkin\/[0-9a-f-]{36}/i);
  const ctaMatch = joinMatch ? null : body.match(/https?:\/\/enterprise\.colaberry\.ai\/(pilot\/[a-z0-9-]+|partners|demo|contact|executive-overview|ai-architect|enroll|ai-workforce-designer)(?:\?[^\s"<>]*)?/i);
  if (joinMatch) {
    primaryCtaButton = `
  <div style="text-align: center; margin: 28px 0;">
    <a href="${joinMatch[0]}" class="cta" style="display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">Join the Open House &rarr;</a>
  </div>`;
  }
  if (ctaMatch) {
    const ctaUrl = ctaMatch[0];
    const slug = ctaMatch[1];
    let label = 'Book Your 30-Minute Strategy Call';
    if (/pilot\/zero-risk/i.test(slug)) label = 'Start Your Zero-Risk AI Pilot';
    else if (/pilot\/ai-team/i.test(slug)) label = 'See the AI Team Pilot';
    else if (/pilot\/exclusive/i.test(slug)) label = 'See the Exclusive Build Program';
    else if (/partners/i.test(slug)) label = 'Become a Delivery Partner';
    else if (/ai-workforce-designer/i.test(slug)) label = 'Design Your AI Workforce';
    else if (/ai-architect/i.test(slug)) label = 'Talk to Our AI Architect';
    primaryCtaButton = `
  <div style="text-align: center; margin: 28px 0;">
    <a href="${ctaUrl}" class="cta" style="display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">${label} &rarr;</a>
  </div>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#2d3748;line-height:1.6;max-width:600px;margin:0 auto;padding:24px;">
    ${body}
    ${primaryCtaButton}
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
      <tr><td style="border-left:3px solid #1a365d;padding-left:14px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-weight:700;font-size:16px;color:#1a365d;">${senderName}</div>
        ${titleLine}
        <div style="font-size:14px;color:#718096;">Colaberry Inc.</div>
        <div style="font-size:14px;margin-top:6px;color:#2d3748;"><a href="https://enterprise.colaberry.ai" style="color:#2b6cb0;text-decoration:none;">enterprise.colaberry.ai</a> &nbsp;&middot;&nbsp; <a href="mailto:${senderEmail}" style="color:#2b6cb0;text-decoration:none;">${senderEmail}</a></div>
      </td></tr>
    </table>
    <div style="margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0;line-height:1.5;">
      Colaberry Inc., 200 Chisholm Place, Suite 200, Plano, TX 75075<br>
      Not relevant? <a href="${tracking?.unsubscribeUrl || `mailto:${senderEmail}?subject=unsubscribe`}" style="color:#a0aec0;">Unsubscribe</a> or reply &ldquo;unsubscribe&rdquo;.
    </div>
  </div>
</body>
</html>
  `.trim();
}
