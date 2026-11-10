/**
 * render - PURE. Composed report -> { subject, html, text }.
 *
 * Each intern is ONE story told on ONE timeline (renderTimeline.ts): the color says what kind of
 * thing happened, the gap says how long nothing did, and the timeline ends at TODAY with what is
 * late, what is waiting on Ali, and what is next. Facts that used to sit in separate sections
 * (commits, verified stories, emails, training) now live on that timeline, in date order.
 *
 * Email-safe: tables and inline styles only, no external CSS, no scripts. Every interpolated value
 * goes through esc().
 */
import type { InternCard, PortfolioReport, StatusKey } from './types';
import { legendHtml, stripHtml, timelineHtml, topNextHtml } from './renderTimeline';

const NAVY = '#1a365d';
const RED = '#C20E1E';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const STATUS: Record<StatusKey, { fg: string; bg: string }> = {
  on_track: { fg: '#166534', bg: '#dcfce7' },
  attention: { fg: '#9a3412', bg: '#ffedd5' },
  stalled: { fg: '#991b1b', bg: '#fee2e2' },
};
/** Each status reason wears the color of the timeline kind it comes from. */
function reasonStyle(reason: string): { fg: string; bg: string } {
  if (/overdue/.test(reason)) return { fg: '#ffffff', bg: '#9f1239' };
  if (/no commit|no platform activity|quiet/.test(reason)) return { fg: '#b91c1c', bg: '#fee2e2' };
  if (/reply/.test(reason)) return { fg: '#ffffff', bg: '#0e7490' };
  if (/training/.test(reason)) return { fg: '#b45309', bg: '#fef3c7' };
  return { fg: '#9a3412', bg: '#ffedd5' };
}

export const esc = (s: unknown): string => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const noDash = (s: string): string => String(s || '').replace(/[—–]/g, '-');
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });

function pill(text: string, { fg, bg }: { fg: string; bg: string }): string {
  return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;color:${fg};background:${bg}">${esc(text)}</span>`;
}

function kpi(label: string, value: unknown, accent: string): string {
  return `<td style="padding:10px 12px;border:1px solid ${LINE};border-top:3px solid ${accent};background:#fff;width:14%"><div style="font-size:22px;font-weight:700;color:${NAVY}">${esc(value)}</div><div style="font-size:11px;color:${MUTED}">${esc(label)}</div></td>`;
}

function bar(pct: number | null): string {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<span style="display:inline-block;width:90px;height:8px;background:${LINE};border-radius:4px;vertical-align:middle"><span style="display:block;width:${p}%;height:8px;background:${p >= 75 ? '#16a34a' : NAVY};border-radius:4px"></span></span>`;
}

function list(items: string[]): string {
  if (!items || !items.length) return `<div style="color:${MUTED};font-size:13px">None.</div>`;
  return `<ul style="margin:4px 0 0 18px;padding:0;font-size:13px;line-height:1.5">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function factsLine(c: InternCard): string {
  const p = c.project;
  const t = c.training;
  const build = p
    ? `${bar(p.pct)} <strong>${esc(p.pct ?? 0)}%</strong> built (${esc(p.tasksDone ?? 0)}/${esc(p.tasksTotal ?? 0)})${p.repoUrl ? ` &middot; <a href="${esc(p.repoUrl)}" style="color:${NAVY}">repo</a>` : ' &middot; <strong style="color:#b91c1c">no repo connected</strong>'}`
    : '<strong style="color:#9a3412">No project</strong>';
  const gateColor = t.gateClear ? '#15803d' : '#b45309';
  const cert = c.cert && c.cert.sittings ? ` &middot; cert ${esc(c.cert.sittings)} sittings` : '';
  return `<div style="font-size:12px;color:#334155;margin-top:8px">${build} &middot; training ${esc(t.weeksCompleted)}/${esc(t.weeksTotal)} weeks &middot; <span style="color:${gateColor};font-weight:700">weeks 1-3 gate ${esc(t.gateDone)}/3</span>${cert}</div>`;
}

function internCard(c: InternCard): string {
  const st = STATUS[c.status.key];
  const link = c.agentTabUrl || c.govUrl;
  const track = link ? `<a href="${esc(link)}" style="color:${NAVY}">${esc(c.trackLabel)}</a>` : esc(c.trackLabel);
  const asks = c.asks.length
    ? `<div style="margin-top:10px;padding:8px 12px;background:#f5f3ff;border-left:3px solid #6d28d9;border-radius:4px"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#6d28d9;font-weight:700">What they are asking you</div>${list(c.asks)}</div>` : '';
  const subs = c.subscriptions.length
    ? `<div style="font-size:11px;color:${MUTED};margin-top:6px">Report emails on this agent tab: ${esc(c.subscriptions.map((s) => `${s.cadence} at ${s.hour}:00 (${(s.scope || []).join(', ')})`).join('; '))}</div>` : '';
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-left:5px solid ${st.fg};border-radius:6px;margin:0 0 16px;background:#fff">
<tr><td style="padding:14px 16px">
  <table role="presentation" width="100%"><tr>
    <td style="vertical-align:top"><div style="font-size:16px;font-weight:700;color:${NAVY}">${esc(c.name)}</div><div style="font-size:12px;color:${MUTED}">${track} &middot; day ${esc(c.day ?? '?')}</div></td>
    <td style="vertical-align:top;text-align:right;white-space:nowrap">${pill(c.status.label, st)}</td>
  </tr></table>
  ${c.status.reasons.length ? `<div style="margin-top:6px">${c.status.reasons.map((r) => pill(r, reasonStyle(r))).join('')}</div>` : ''}
  <div style="font-size:13px;color:#1e293b;margin-top:8px;font-weight:600">${esc(c.timeline.story)}</div>
  ${factsLine(c)}
  <div style="margin-top:10px">${stripHtml(c.timeline, 22)}</div>
  <div style="margin-top:10px">${timelineHtml(c.timeline)}</div>
  ${asks}
  ${subs}
  <div style="margin-top:10px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:700">Your nudge</div>
  <div style="font-size:13px;line-height:1.55;background:#f8fafc;border-left:3px solid ${RED};padding:8px 12px;margin-top:4px">${esc(c.nudge)}</div>
</td></tr></table>`;
}

function glanceRow(c: InternCard): string {
  const st = STATUS[c.status.key];
  return `<tr style="border-top:1px solid ${LINE}">
<td style="padding:6px 8px;vertical-align:middle"><div style="font-weight:700;color:${NAVY}">${esc(c.name)}</div><div style="font-size:10px;color:${MUTED}">${esc(c.trackLabel.replace(/^(Agent|Gov contract): /, ''))}</div></td>
<td style="padding:6px 8px;vertical-align:middle">${pill(c.status.label, st)}</td>
<td style="padding:6px 8px;vertical-align:middle">${stripHtml(c.timeline, 9)}</td>
<td style="padding:6px 8px;vertical-align:middle">${topNextHtml(c.timeline)}</td>
</tr>`;
}

export function renderInternshipPortfolio(report: PortfolioReport): { subject: string; html: string; text: string } {
  const date = fmtDate(report.generatedAt);
  const t = report.totals;
  const k = report.counts || {};
  const all = report.groups.flatMap((g) => g.interns);
  // Stable per day on purpose: the send ledger keys on (recipient, subject, event), so counts in the
  // subject would let a same-day re-run send a second copy. The counts live in the body.
  const subject = noDash(`[Internship Report] ${date}`);

  const html = noDash(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Internship Report</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Roboto,Segoe UI,Arial,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:920px">
<tr><td style="background:${NAVY};color:#fff;padding:18px 20px;border-radius:6px 6px 0 0">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Colaberry AI Internship</div>
  <div style="font-size:22px;font-weight:700;margin-top:2px">Internship Report</div>
  <div style="font-size:13px;opacity:.85;margin-top:2px">${esc(date)} &middot; ${esc(t.interns)} interns &middot; last 21 days, same data as Admin &gt; Interns</div>
</td></tr>
<tr><td style="padding:14px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
    ${kpi('Interns', t.interns, NAVY)}${kpi('On track', t.onTrack, '#16a34a')}${kpi('Need attention', t.attention, '#ea580c')}${kpi('Stalled', t.stalled, RED)}${kpi('Weeks 1-3 cleared', k.weeks_1_3_clear ?? '-', '#16a34a')}${kpi('No project', k.no_project ?? '-', '#ea580c')}${kpi('Replies you owe', t.repliesOwed, '#0e7490')}
  </tr></table>
</td></tr>
<tr><td style="padding:10px 0 0">
  <div style="background:#fff;border:1px solid ${LINE};border-radius:6px;padding:10px 14px">
    <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:700;margin-bottom:4px">How to read the timelines</div>${legendHtml()}
  </div>
</td></tr>
<tr><td style="padding:10px 0 0">
  <div style="background:#fff;border:1px solid ${LINE};border-top:3px solid ${RED};border-radius:6px;padding:12px 16px">
    <div style="font-size:14px;font-weight:700;color:${NAVY}">Your move</div>${list(report.aliMoves)}
  </div>
</td></tr>
<tr><td style="padding:14px 0 0">
  <div style="background:#fff;border:1px solid ${LINE};border-radius:6px;padding:12px 16px">
    <div style="font-size:14px;font-weight:700;color:${NAVY};margin-bottom:6px">Everyone, last 21 days</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse">
      <tr style="color:${MUTED};text-transform:uppercase;font-size:10px;letter-spacing:1px"><td style="padding:4px 8px">Intern</td><td style="padding:4px 8px">Status</td><td style="padding:4px 8px">Timeline</td><td style="padding:4px 8px">Most urgent</td></tr>
      ${all.map(glanceRow).join('')}
    </table>
  </div>
</td></tr>
${report.groups.map((g) => `<tr><td style="padding:18px 0 6px"><div style="font-size:17px;font-weight:700;color:${NAVY};border-bottom:2px solid ${RED};padding-bottom:4px">${esc(g.title)} (${g.interns.length})</div></td></tr>
<tr><td>${g.interns.map(internCard).join('')}</td></tr>`).join('')}
<tr><td style="padding:10px 4px 24px;font-size:11px;color:${MUTED};line-height:1.6">
  Stuck = an email that reports a blocker, or 4+ days with no commit or verified story. Unstuck = the first build work after either. Late = an unverified task past its due date.
  Your replies are messages from colaberry.com to them; the time shown is how long after their question it came. "You owe a reply" = their latest email is newer than anything sent to them and under 7 days old.
  ${report.operatorsExcluded.length ? `Operator accounts left out: ${esc(report.operatorsExcluded.join(', '))}.` : ''}
  Generated by backend/src/scripts/internshipPortfolioReport.ts.
</td></tr>
</table></td></tr></table></body></html>`);

  const text = noDash([
    `INTERNSHIP REPORT - ${date}`,
    `${t.interns} interns: ${t.onTrack} on track, ${t.attention} need attention, ${t.stalled} stalled. Replies you owe: ${t.repliesOwed}.`,
    '',
    'YOUR MOVE',
    ...(report.aliMoves.length ? report.aliMoves.map((m) => `- ${m}`) : ['- Nothing.']),
    ...report.groups.flatMap((g) => ['', `== ${g.title.toUpperCase()} (${g.interns.length}) ==`, ...g.interns.flatMap((c) => [
      '',
      `${c.name} - ${c.trackLabel} - ${c.status.label}${c.status.reasons.length ? ` (${c.status.reasons.join('; ')})` : ''}`,
      `  ${c.timeline.story}`,
      // Same order as the HTML: what needs attention now, then newest to oldest.
      ...c.timeline.next.map((n) => `  NEXT ${n.label}: ${n.detail}`),
      ...[...c.timeline.rows].reverse().map((r) => `  ${r.day.slice(5)}: ${r.events.map((e) => `${e.label}${e.detail ? ` ${e.detail}` : ''}${e.meta ? ` (${e.meta})` : ''}`).join(' | ')}${r.gapBefore >= 2 ? `  [${r.gapBefore}d before this]` : ''}`),
      c.asks.length ? `  Asks: ${c.asks.join('; ')}` : null,
      `  Nudge: ${c.nudge}`,
    ].filter((x): x is string => x !== null))]),
  ].join('\n'));

  return { subject, html, text };
}
