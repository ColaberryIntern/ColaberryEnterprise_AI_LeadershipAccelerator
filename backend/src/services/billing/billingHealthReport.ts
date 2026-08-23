/**
 * The billing watch, and the email it sends when something needs Ali.
 *
 * It stays quiet when the book is healthy. That is the whole design: a daily
 * "everything is fine" trains you to archive it unread, and then the one that
 * matters gets archived too.
 *
 * DRY RUN BY DEFAULT, like every other job that can reach a person.
 */

import nodemailer from 'nodemailer';
import { runBillingHealthCheck, type Finding, type HealthResult } from './billingHealthCheck';
import { getPaySimpleGatewayState } from './billingGatewayState';

const FROM = '"Colaberry Billing Watch" <ali@colaberry.com>';
const TO = 'ali@colaberry.com';

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  act_now: 'ACT NOW',
  soon: 'SOON',
  watch: 'FYI',
};

const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderReport(r: HealthResult): { subject: string; text: string; html: string } {
  const worst = r.findings[0]?.severity;
  const actNow = r.findings.filter((f) => f.severity === 'act_now').length;

  // The subject carries the whole message for someone scanning a phone.
  const subject = actNow
    ? `[Billing] ${actNow} thing${actNow === 1 ? '' : 's'} need${actNow === 1 ? 's' : ''} you now`
    : r.findings.length
      ? `[Billing] ${r.findings.length} thing${r.findings.length === 1 ? '' : 's'} to look at`
      : `[Billing] Milestone: ${r.milestones[0]?.what ?? 'checkpoint'}`;

  const lines: string[] = [];
  if (r.milestones.length) {
    lines.push('MILESTONE TODAY');
    r.milestones.forEach((m) => lines.push(`  ${m.what}\n    ${m.why}`));
    lines.push('');
  }
  if (r.findings.length) {
    r.findings.forEach((f) => {
      lines.push(`[${SEVERITY_LABEL[f.severity]}] ${f.headline}`);
      lines.push(`  ${f.detail}`);
      lines.push(`  What to do: ${f.action}`);
      (f.rows ?? []).slice(0, 12).forEach((row) => lines.push(`    - ${row}`));
      if ((f.rows ?? []).length > 12) lines.push(`    ...and ${(f.rows as string[]).length - 12} more`);
      lines.push('');
    });
  } else {
    lines.push('No problems found in the subscription book.');
    lines.push('');
  }
  lines.push(`Checked ${r.checkedAt}. This only arrives when something needs you.`);

  const text = lines.join('\n');

  const colour: Record<Finding['severity'], string> = {
    act_now: '#a8301c', soon: '#a8501c', watch: '#4a5568',
  };
  const html = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 680px;">
${r.milestones.map((m) => `<div style="border-left:3px solid #1f6f4a;padding-left:14px;margin-bottom:18px;">
<div style="font-weight:700;color:#1a365d;">Milestone today: ${esc(m.what)}</div>
<div style="color:#4a5568;">${esc(m.why)}</div></div>`).join('\n')}
${r.findings.length ? r.findings.map((f) => `<div style="border-left:3px solid ${colour[f.severity]};padding-left:14px;margin-bottom:18px;">
<div style="font-size:11px;letter-spacing:.1em;color:${colour[f.severity]};font-weight:700;">${SEVERITY_LABEL[f.severity]}</div>
<div style="font-weight:700;color:#1a365d;">${esc(f.headline)}</div>
<div style="color:#4a5568;">${esc(f.detail)}</div>
<div style="margin-top:6px;"><strong>What to do:</strong> ${esc(f.action)}</div>
${(f.rows ?? []).length ? `<ul style="margin:8px 0 0;padding-left:18px;color:#4a5568;">${(f.rows as string[]).slice(0, 12).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
</div>`).join('\n') : '<p>No problems found in the subscription book.</p>'}
<p style="color:#718096;font-size:12px;">Checked ${esc(r.checkedAt)}. This only arrives when something needs you.</p>
</div>`;

  return { subject, text, html };
}

export async function runBillingWatch(
  opts: { send?: boolean } = {},
): Promise<{ needsAttention: boolean; sent: boolean; subject?: string; result: HealthResult }> {
  const gateway = await getPaySimpleGatewayState();
  const result = await runBillingHealthCheck(gateway);

  const log = {
    timestamp: new Date().toISOString(), level: 'info', service: 'billing-watch',
    event: 'run_finished', outcome: 'success',
    context: {
      findings: result.findings.length,
      act_now: result.findings.filter((f) => f.severity === 'act_now').length,
      milestones: result.milestones.length,
      needs_attention: result.needsAttention,
    },
  };
  console.log(JSON.stringify(log));

  if (!result.needsAttention) return { needsAttention: false, sent: false, result };

  const { subject, text, html } = renderReport(result);
  if (!opts.send) return { needsAttention: true, sent: false, subject, result };

  if (!process.env.MANDRILL_API_KEY) {
    console.error('[billing-watch] MANDRILL_API_KEY missing, cannot send');
    return { needsAttention: true, sent: false, subject, result };
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  await transport.sendMail({
    from: FROM, to: TO, replyTo: TO,
    subject,
    text: text.replace(/—/g, '-').replace(/–/g, '-'),
    html: html.replace(/—/g, '-').replace(/–/g, '-'),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  return { needsAttention: true, sent: true, subject, result };
}
