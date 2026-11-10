/**
 * renderBriefing - PURE. The report EMAIL: the 10 most impactful things in today's report, Ali's
 * moves, and everyone at a glance, with the full interactive page attached.
 *
 * Ali, 10 Nov 2026: "in the email, focus on the 10 most impactful and I can open the html and take
 * the guided tour or just dive into the data." So the per-intern cards (timelines, artifacts,
 * prompts) now live in the attached page (dashboard/renderDashboard.ts), and the email is the short
 * version of the same report: the same highlights the tour walks through, the same tiles, the same
 * glance table, all from the same composed report and sidecar.
 *
 * Email-safe: tables and inline styles only; every value through esc(); no em/en-dashes (the send
 * path lints for them).
 */
import { BRAND, brandHeader } from './brand';
import { STATUS, esc, glanceRow, kpi } from './render';
import { legendHtml } from './renderTimeline';
import { POSITIVE } from './sidecar/highlights';
import type { Sidecar } from './sidecar/types';
import type { PortfolioReport } from './types';

const MUTED = '#64748b';
const LINE = '#e2e8f0';
const noDash = (s: string): string => String(s || '').replace(/[—–]/g, '-');
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });

/** The attachment names, shared with the send path so the email can name them exactly. */
export const pageFileName = (reportDate: string): string => `internship-report-${reportDate}.html`;
export const jsonFileName = (reportDate: string): string => `internship-report-${reportDate}.json`;

function highlightRows(report: PortfolioReport, s: Sidecar): string {
  const byId = new Map(report.groups.flatMap((g) => g.interns).map((c) => [c.enrollmentId, c]));
  if (!s.highlights.length) return `<div style="color:${MUTED};font-size:13px">Nothing stood out today.</div>`;
  return s.highlights.map((h) => {
    const good = POSITIVE.has(h.kind);
    const c = byId.get(h.enrollment_id);
    const st = c ? STATUS[c.status.key] : { fg: '#334155', bg: '#f1f5f9' };
    const badge = good ? '#15803d' : BRAND.red;
    return `<tr><td style="padding:8px 10px 8px 0;vertical-align:top;width:30px"><div style="width:26px;height:26px;border-radius:13px;background:${badge};color:#ffffff;font-size:12px;font-weight:700;text-align:center;line-height:26px">${h.rank}</div></td>
<td style="padding:8px 0;vertical-align:top;border-bottom:1px solid ${LINE}">
  <div style="font-size:14px;font-weight:700;color:${BRAND.navy}">${esc(h.title)}</div>
  <div style="font-size:13px;color:#334155;margin-top:2px">${esc(h.why)}</div>
  <div style="margin-top:4px"><span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;color:${st.fg};background:${st.bg}">${esc(h.intern)}${c ? ` &middot; ${esc(c.status.label)}` : ''}</span>${good ? ' <span style="font-size:11px;font-weight:700;color:#15803d">good news</span>' : ''}</div>
</td></tr>`;
  }).join('');
}

export function renderBriefing(report: PortfolioReport, s: Sidecar, opts: { edition?: 'daily' | 'meeting' } = {}): { subject: string; html: string; text: string } {
  const date = fmtDate(report.generatedAt);
  const meeting = opts.edition === 'meeting';
  const t = report.totals;
  const k = report.counts || {};
  const all = report.groups.flatMap((g) => g.interns);
  const page = pageFileName(s.report_date);
  // Stable per day, and starting "Ali, here's": the send ledger keys on it, and the inbox manager
  // keeps self-sent mail with this prefix in the INBOX (hardRuleEngine rule 0a).
  const subject = noDash(`Ali, here's your Internship Report for ${date}`);
  const box = (inner: string, top = ''): string => `<tr><td style="padding:12px 0 0"><div style="background:#ffffff;border:1px solid ${LINE};${top}border-radius:6px;padding:14px 18px">${inner}</div></td></tr>`;
  const h2 = (x: string): string => `<div style="font-size:16px;font-weight:700;color:${BRAND.navy};margin-bottom:6px">${esc(x)}</div>`;

  const html = noDash(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Internship Report</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Roboto,Segoe UI,Arial,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px">
<tr><td>${brandHeader(meeting ? 'Your Internship Report for today\'s intern meeting' : 'Your Internship Report', `${date} · ${t.interns} interns · last 21 days${meeting ? ' · fresh as of 10:00 AM' : ''}`)}</td></tr>
<tr><td style="padding:12px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
  ${kpi('Interns', t.interns, BRAND.navy)}${kpi('On track', t.onTrack, '#16a34a')}${kpi('Need attention', t.attention, '#ea580c')}${kpi('Stalled', t.stalled, BRAND.red)}${kpi('Weeks 1-3 cleared', k.weeks_1_3_clear ?? '-', '#16a34a')}${kpi('No project', k.no_project ?? '-', '#ea580c')}${kpi('Replies you owe', t.repliesOwed, '#0e7490')}
</tr></table></td></tr>
${box(`<div style="font-size:14px;color:#0f172a"><strong>Open the attached ${esc(page)}</strong> to take the guided tour of these ${s.highlights.length}, or click any intern to see their timeline, artifacts and the prompts to send them.</div>`, `border-left:5px solid ${BRAND.red};`)}
${box(`${h2(`Today's ${s.highlights.length} most impactful things`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${highlightRows(report, s)}</table>`)}
${box(`${h2('Your move')}${report.aliMoves.length ? `<ul style="margin:4px 0 0 18px;padding:0;font-size:13px;line-height:1.5">${report.aliMoves.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : `<div style="color:${MUTED};font-size:13px">Nothing.</div>`}`, `border-top:3px solid ${BRAND.red};`)}
${box(`${h2('Everyone at a glance')}<div style="margin-bottom:8px">${legendHtml()}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse"><tr style="color:${MUTED};text-transform:uppercase;font-size:10px;letter-spacing:1px"><td style="padding:4px 8px">Intern</td><td style="padding:4px 8px">Status</td><td style="padding:4px 8px">Timeline</td><td style="padding:4px 8px">Most urgent</td></tr>${all.map((c) => glanceRow(c)).join('')}</table>`)}
<tr><td style="padding:12px 4px 24px;font-size:11px;color:${MUTED};line-height:1.6">
  Attached: ${esc(page)} (the full report: guided tour, one timeline for everyone, filter by person, every intern's timeline, artifacts and prompts) and ${esc(jsonFileName(s.report_date))} (the same data for an agent).
  ${report.operatorsExcluded.length ? `Operator accounts left out: ${esc(report.operatorsExcluded.join(', '))}.` : ''}
  Generated every morning by backend/src/scripts/internshipPortfolioReport.ts.
</td></tr>
</table></td></tr></table></body></html>`);

  const text = noDash([
    `INTERNSHIP REPORT - ${date}`,
    `${t.interns} interns: ${t.onTrack} on track, ${t.attention} need attention, ${t.stalled} stalled. Replies you owe: ${t.repliesOwed}.`,
    '',
    `Open the attached ${page} for the guided tour and every intern's timeline, artifacts and prompts.`,
    '',
    `TODAY'S ${s.highlights.length} MOST IMPACTFUL THINGS`,
    ...(s.highlights.length ? s.highlights.map((h) => `${h.rank}. ${h.title} (${h.intern}). ${h.why}`) : ['Nothing stood out today.']),
    '',
    'YOUR MOVE',
    ...(report.aliMoves.length ? report.aliMoves.map((m) => `- ${m}`) : ['- Nothing.']),
    '',
    'EVERYONE',
    ...all.map((c) => `- ${c.name}: ${c.status.label}${c.timeline.next[0] ? `. ${c.timeline.next[0].label}: ${c.timeline.next[0].detail}` : ''}`),
  ].join('\n'));

  return { subject, html, text };
}
