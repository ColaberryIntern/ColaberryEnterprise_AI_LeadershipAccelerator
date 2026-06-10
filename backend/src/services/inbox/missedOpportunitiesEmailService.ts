// Missed Opportunities Report — daily executive email. Renders the report
// object into an Outlook-safe HTML brief (exec summary, attention heat-map
// snapshot, top 10 missed, top hidden topics, deleted-but-valuable, learning
// metrics) and sends it at 8 PM CT. Idempotent: one send per CT report date
// unless forced (CLAUDE.md idempotency contract for transactional sends).

import { getReport } from './missedOpportunitiesReportService';
import type { MissedOpportunitiesReport, HeatMapWord, MissedEmailRow } from './missedOpportunitiesReportService';
import { reportDateCT } from './opportunityScoringService';
import { getSetting, setSetting } from '../settingsService';

const LOG_PREFIX = '[MissedOpportunities]';
const LAST_SENT_KEY = 'missed_opportunities_last_sent';

function getTransporter(): any {
  try {
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mandrillapp.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER || process.env.MANDRILL_USER || 'apikey',
        pass: process.env.SMTP_PASS || process.env.MANDRILL_API_KEY,
      },
    });
  } catch {
    return null;
  }
}

const BAND_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#94a3b8' };
const BAND_BG: Record<string, string> = { high: '#dcfce7', medium: '#fef3c7', low: '#f1f5f9' };

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  } catch {
    return iso;
  }
}

// Attention heat-map as colored word chips: size = frequency, color = band,
// opacity = classification confidence. (Email clients can't run a JS canvas,
// so the word cloud is rendered as inline-styled spans.)
function heatMapHtml(words: HeatMapWord[]): string {
  if (!words.length) return `<p style="color:#64748b;font-style:italic">No hidden topics today.</p>`;
  const maxFreq = Math.max(...words.map((w) => w.frequency));
  const chips = words.slice(0, 24).map((w) => {
    const size = 13 + Math.round((w.frequency / maxFreq) * 15); // 13-28px
    const opacity = Math.max(0.55, Math.min(1, w.avgConfidence / 100));
    return `<span style="display:inline-block;margin:3px 6px;font-size:${size}px;font-weight:700;color:${BAND_COLOR[w.band]};opacity:${opacity.toFixed(2)}">${esc(w.topic)}</span>`;
  }).join('');
  return `<div style="background:#0f172a;border-radius:10px;padding:18px 16px;text-align:center;line-height:1.9">${chips}</div>
    <div style="font-size:11px;color:#64748b;margin-top:8px;text-align:center">Size = volume · Color = opportunity (green high, amber medium, gray low) · Opacity = filter confidence</div>`;
}

function missedRowsHtml(rows: MissedEmailRow[]): string {
  if (!rows.length) {
    return `<tr><td colspan="5" style="padding:18px;text-align:center;color:#64748b;font-style:italic">No hidden emails surfaced as likely-missed today.</td></tr>`;
  }
  return rows.map((r) => {
    const color = BAND_COLOR[r.band] || '#94a3b8';
    return `<tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:10px 12px;text-align:center"><span style="display:inline-block;min-width:34px;background:${BAND_BG[r.band]};color:${color};font-weight:800;border-radius:6px;padding:4px 8px">${r.score}</span></td>
      <td style="padding:10px 12px"><strong style="color:#0f172a">${esc(r.subject)}</strong><div style="font-size:12px;color:#64748b;margin-top:2px">${esc(r.explanation)}</div></td>
      <td style="padding:10px 12px;font-size:13px">${esc(r.fromName || r.fromAddress)}<div style="font-size:11px;color:#94a3b8">${esc(r.fromAddress)}</div></td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;white-space:nowrap">${fmtDate(r.receivedAt)}</td>
      <td style="padding:10px 12px"><span style="background:#e2e8f0;color:#475569;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap">${esc(r.currentFolder)}</span></td>
    </tr>`;
  }).join('');
}

export function buildReportHtml(report: MissedOpportunitiesReport, baseUrl: string): string {
  const s = report.summary;
  const fullLink = `${baseUrl.replace(/\/$/, '')}/admin/missed-opportunities`;
  const dateLabel = new Date(s.reportDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const tile = (label: string, value: string | number, bg: string, fg: string, sub?: string) =>
    `<div style="flex:1;min-width:120px;background:${bg};color:${fg};padding:16px;border-radius:10px;text-align:center">
      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;opacity:0.85">${label}</div>
      <div style="font-size:30px;font-weight:800;margin-top:4px">${value}</div>
      ${sub ? `<div style="font-size:11px;opacity:0.8;margin-top:2px">${sub}</div>` : ''}
    </div>`;

  const themes = s.topThemes.length
    ? s.topThemes.map((t) => `<span style="display:inline-block;background:#eef2ff;color:#3730a3;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;margin:2px 4px">${esc(t)}</span>`).join('')
    : '<span style="color:#64748b;font-style:italic">No high-signal themes today.</span>';

  const narrative = `${s.totalProcessed.toLocaleString()} emails processed. ${s.totalHidden.toLocaleString()} routed away from your Inbox by Inbox COS. ` +
    `<strong>${s.potentiallyValuable}</strong> ${s.potentiallyValuable === 1 ? 'email was' : 'emails were'} flagged as potentially valuable and not surfaced` +
    `${s.mediumValue ? `, plus ${s.mediumValue} worth a glance` : ''}.`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">
<div style="max-width:760px;margin:0 auto;background:white;font-family:arial,helvetica,sans-serif;color:#0f172a;line-height:1.55">

  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);color:white;padding:30px 28px">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#93c5fd;font-weight:700">Missed Opportunities Report</div>
    <div style="font-size:26px;font-weight:800;margin-top:6px">${dateLabel}</div>
    <div style="font-size:13px;color:#cbd5e0;margin-top:4px">Executive visibility into filtered, hidden, archived & automated communications</div>
  </div>

  <div style="padding:24px 28px">

    <div style="background:#f8fafc;border-left:4px solid #1e3a8a;padding:14px 18px;border-radius:6px;font-size:14px;margin-bottom:22px">${narrative}</div>

    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
      ${tile('Processed', s.totalProcessed.toLocaleString(), '#0f172a', 'white')}
      ${tile('Hidden', s.totalHidden.toLocaleString(), '#475569', 'white')}
      ${tile('Likely Missed', s.potentiallyValuable, '#16a34a', 'white', 'high opportunity')}
      ${tile('Worth a Glance', s.mediumValue, '#d97706', 'white', 'medium')}
    </div>

    <h2 style="font-size:17px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin:8px 0 12px">Attention Blind-Spot Heat Map</h2>
    ${heatMapHtml(report.heatMap)}

    <h2 style="font-size:17px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin:28px 0 6px">Top Hidden Themes</h2>
    <div style="margin:10px 0 4px">${themes}</div>

    <h2 style="font-size:17px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin:28px 0 12px">Most Likely Missed Emails</h2>
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#0f172a;color:white">
        <th align="center" style="padding:10px 12px">Score</th>
        <th align="left" style="padding:10px 12px">Subject</th>
        <th align="left" style="padding:10px 12px">Sender</th>
        <th align="left" style="padding:10px 12px">Date</th>
        <th align="left" style="padding:10px 12px">Folder</th>
      </tr></thead>
      <tbody>${missedRowsHtml(report.topMissed.slice(0, 10))}</tbody>
    </table>

    <h2 style="font-size:17px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin:28px 0 12px">Deleted But Potentially Valuable</h2>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;font-size:13px;color:#92400e">
      Deleted &amp; Spam recovery activates once Trash/Spam ingestion is enabled. No deleted-email analysis in this edition.
    </div>

    <h2 style="font-size:17px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin:28px 0 12px">Learning Loop</h2>
    <div style="font-size:13px;color:#475569">
      Restored: <strong>${report.learning.restored}</strong> ·
      Reopened: <strong>${report.learning.reopened}</strong> ·
      Marked important: <strong>${report.learning.markedImportant}</strong> ·
      Always-show rules: <strong>${report.learning.surfacePreferences}</strong>
    </div>

    <div style="text-align:center;margin:30px 0 8px">
      <a href="${fullLink}" style="display:inline-block;background:#1e3a8a;color:white;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:8px;font-size:14px">View Full Report &rarr;</a>
    </div>

  </div>

  <div style="background:#f8fafc;padding:14px 28px;font-size:11px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0">
    Executive attention-protection system · Inbox COS · Colaberry Enterprise AI
  </div>

</div>
</body></html>`;
}

export interface SendResult { sent: boolean; skipped?: boolean; reportDate: string; messageId?: string; reason?: string }

export async function runMissedOpportunitiesReport(
  opts: { force?: boolean; recipients?: string[] } = {},
): Promise<SendResult> {
  const date = reportDateCT();
  const recipients = opts.recipients && opts.recipients.length ? opts.recipients : ['ali@colaberry.com'];

  // Idempotency: one send per CT date unless forced.
  if (!opts.force) {
    const lastSent = await getSetting(LAST_SENT_KEY);
    if (lastSent === date) {
      console.log(`${LOG_PREFIX} Already sent for ${date}, skipping.`);
      return { sent: false, skipped: true, reportDate: date, reason: 'already_sent_today' };
    }
  }

  const report = await getReport(date);
  const baseUrl = process.env.APP_BASE_URL || 'https://enterprise.colaberry.ai';
  const html = buildReportHtml(report, baseUrl);

  const transporter = getTransporter();
  if (!transporter) {
    console.error(`${LOG_PREFIX} SMTP not configured`);
    return { sent: false, reportDate: date, reason: 'smtp_unconfigured' };
  }

  const subject = `[Missed Opportunities] ${report.summary.potentiallyValuable} likely-missed · ${date}`;
  const info = await transporter.sendMail({
    from: '"Inbox COS - Missed Opportunities" <ali@colaberry.com>',
    to: recipients.join(', '),
    subject,
    html,
    headers: {
      'X-MC-Track': 'false',
      'X-MC-AutoText': 'false',
      'X-Priority': '1',
      'Importance': 'high',
    },
  });

  await setSetting(LAST_SENT_KEY, date);
  console.log(`${LOG_PREFIX} Report emailed to ${recipients.join(', ')} (msgId: ${info.messageId})`);
  return { sent: true, reportDate: date, messageId: info.messageId };
}
