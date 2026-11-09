/**
 * render - PURE. Composed report -> { subject, html, text }.
 *
 * Email-safe on purpose: tables and inline styles only, no external CSS, no scripts, so the same
 * HTML renders in Gmail, Outlook and a browser. Every interpolated value goes through esc().
 */
import type { InternCard, PortfolioReport, StatusKey, TrainingView } from './types';

const NAVY = '#1a365d';
const RED = '#C20E1E';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const STATUS: Record<StatusKey, { fg: string; bg: string }> = {
  on_track: { fg: '#166534', bg: '#dcfce7' },
  attention: { fg: '#9a3412', bg: '#ffedd5' },
  stalled: { fg: '#991b1b', bg: '#fee2e2' },
};
const CATEGORY_COLOR: Record<string, string> = { training: '#f97316', project: '#dc2626', certification: '#92400e', community: '#8b5cf6', other: '#94a3b8' };

export const esc = (s: unknown): string => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const noDash = (s: string): string => String(s || '').replace(/[—–]/g, '-');
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
const shortDate = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

function pill(text: string, { fg, bg }: { fg: string; bg: string }): string {
  return `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;color:${fg};background:${bg}">${esc(text)}</span>`;
}

function kpi(label: string, value: unknown, accent: string): string {
  return `<td style="padding:10px 12px;border:1px solid ${LINE};border-top:3px solid ${accent};background:#fff;width:14%"><div style="font-size:22px;font-weight:700;color:${NAVY}">${esc(value)}</div><div style="font-size:11px;color:${MUTED}">${esc(label)}</div></td>`;
}

function trainingStrip(strip: TrainingView['strip']): string {
  return strip.filter((w) => w.week >= 1).map((w) => {
    const bg = w.done ? '#16a34a' : w.pct > 0 ? '#fdba74' : '#e2e8f0';
    return `<span title="Week ${w.week}: ${w.pct}%" style="display:inline-block;width:14px;height:14px;margin-right:2px;border-radius:2px;background:${bg};border:${w.week <= 3 ? `1px solid ${RED}` : '1px solid transparent'}"></span>`;
  }).join('');
}

function activityStrip(days: InternCard['activity']['days']): string {
  return (days || []).map((d) => {
    let top: string | null = null;
    let max = 0;
    for (const [k, v] of Object.entries(d.by_category || {})) if (v > max) { max = v; top = k; }
    const bg = top ? CATEGORY_COLOR[top] : '#eef2f7';
    const op = top ? Math.min(1, 0.45 + d.events * 0.12) : 1;
    return `<span title="${esc(d.date)}: ${d.events} events" style="display:inline-block;width:9px;height:14px;margin-right:1px;border-radius:1px;background:${bg};opacity:${op}"></span>`;
  }).join('');
}

function bar(pct: number | null): string {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<span style="display:inline-block;width:120px;height:8px;background:${LINE};border-radius:4px;vertical-align:middle"><span style="display:block;width:${p}%;height:8px;background:${p >= 75 ? '#16a34a' : NAVY};border-radius:4px"></span></span>`;
}

function list(items: string[]): string {
  if (!items || !items.length) return `<div style="color:${MUTED};font-size:13px">None.</div>`;
  return `<ul style="margin:4px 0 0 18px;padding:0;font-size:13px;line-height:1.5">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function label(t: string): string {
  return `<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:700;margin:12px 0 2px">${esc(t)}</div>`;
}

function projectBlock(c: InternCard): string {
  const p = c.project;
  if (!p) return `${label('Project')}<div style="font-size:13px;color:${MUTED}">No project yet.</div>`;
  const repo = p.repoUrl ? ` &middot; <a href="${esc(p.repoUrl)}" style="color:${NAVY}">repo</a>` : ' &middot; no repo connected';
  const lastCommit = p.lastCommitDays === null ? 'no commits yet' : `last commit ${p.lastCommitDays}d ago`;
  const commits = p.commitsRecent.slice(0, 3).map((x) => `${shortDate(x.date)}: ${x.message}`);
  const verified = p.verifiedRecent.slice(0, 4).map((v) => `${shortDate(v.at)}: ${v.title}`);
  return `${label('Project')}
<div style="font-size:13px"><strong>${esc(p.name)}</strong>${p.stage ? ` &middot; ${esc(p.stage)}` : ''}${repo}</div>
<div style="font-size:13px;margin-top:4px">${bar(p.pct)} <strong>${esc(p.pct ?? 0)}%</strong> &middot; ${esc(p.tasksDone ?? 0)} of ${esc(p.tasksTotal ?? 0)} verified &middot; ${esc(lastCommit)}${p.overdue ? ` &middot; <span style="color:${RED};font-weight:700">${esc(p.overdue)} overdue</span>` : ''}</div>
${verified.length ? `<div style="font-size:12px;color:${MUTED};margin-top:6px">Recently verified</div>${list(verified)}` : ''}
${commits.length ? `<div style="font-size:12px;color:${MUTED};margin-top:6px">Recent commits</div>${list(commits)}` : ''}`;
}

function emailBlock(c: InternCard): string {
  const e = c.emails;
  const waiting = e.awaitingReply ? ` ${pill('Waiting on your reply', STATUS.stalled)}` : '';
  if (!e.count) return `${label('Their emails to you')}<div style="font-size:13px;color:${MUTED}">No emails in the last 21 days.</div>`;
  const asks = c.asks && c.asks.length ? `<div style="font-size:12px;color:${MUTED};margin-top:4px">What they are asking for</div>${list(c.asks)}` : '';
  const threads = e.threads.slice(0, 5).map((t) => `${shortDate(t.date)}: ${t.subject}`);
  return `${label(`Their emails to you (${e.count} in 21 days)`)}${waiting}${asks}<div style="font-size:12px;color:${MUTED};margin-top:4px">Threads</div>${list(threads)}`;
}

function internCard(c: InternCard): string {
  const st = STATUS[c.status.key];
  const link = c.agentTabUrl || c.govUrl;
  const track = link ? `<a href="${esc(link)}" style="color:${NAVY}">${esc(c.trackLabel)}</a>` : esc(c.trackLabel);
  const t = c.training;
  const cert = c.cert && c.cert.available ? `${c.cert.sittings} sittings, ${c.cert.completed} scored` : 'not started';
  const lately = list(c.lately);
  const subs = c.subscriptions && c.subscriptions.length
    ? `${label('Report emails set up on this agent tab')}${list(c.subscriptions.map((s) => `${s.cadence} at ${s.hour}:00, covering ${(s.scope || []).join(', ')}${s.enabled ? '' : ' (paused)'}`))}` : '';
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-left:4px solid ${st.fg};border-radius:6px;margin:0 0 14px;background:#fff">
<tr><td style="padding:14px 16px">
  <table role="presentation" width="100%"><tr>
    <td style="vertical-align:top"><div style="font-size:16px;font-weight:700;color:${NAVY}">${esc(c.name)}</div><div style="font-size:12px;color:${MUTED}">${track} &middot; day ${esc(c.day ?? '?')} &middot; ${esc(c.email)}</div></td>
    <td style="vertical-align:top;text-align:right;white-space:nowrap">${pill(c.status.label, st)}</td>
  </tr></table>
  ${c.status.reasons.length ? `<div style="font-size:12px;color:${st.fg};margin-top:6px">${esc(c.status.reasons.join(' · '))}</div>` : ''}
  <table role="presentation" width="100%" style="margin-top:10px"><tr>
    <td style="vertical-align:top;width:50%;padding-right:12px">${label('Training / triage')}
      <div>${trainingStrip(t.strip)}</div>
      <div style="font-size:12px;color:#334155;margin-top:4px">${esc(t.weeksCompleted)} of ${esc(t.weeksTotal)} weeks done &middot; weeks 1-3 gate ${esc(t.gateDone)}/3${t.pace ? ` &middot; pace ${esc(t.pace.band)}` : ''}${c.sessions !== null ? ` &middot; ${esc(c.sessions)} sessions` : ''} &middot; cert: ${esc(cert)}</div></td>
    <td style="vertical-align:top;width:50%">${label('Activity, last 28 days')}
      <div>${activityStrip(c.activity.days)}</div>
      <div style="font-size:12px;color:#334155;margin-top:4px">Active ${esc(c.activity.last28.activeDays)} of 28 days &middot; last 7d: ${esc(c.activity.last7.training)} training, ${esc(c.activity.last7.project)} project, ${esc(c.activity.last7.certification)} cert &middot; last seen ${c.activity.daysSince === 0 ? 'today' : `${esc(c.activity.daysSince)}d ago`}</div></td>
  </tr></table>
  ${projectBlock(c)}
  ${label('Lately (14 days)')}${lately}
  ${emailBlock(c)}
  ${subs}
  ${label('Next steps')}${list(c.nextSteps)}
  ${label('Your nudge')}
  <div style="font-size:13px;line-height:1.55;background:#f8fafc;border-left:3px solid ${RED};padding:8px 12px;margin-top:4px">${esc(c.nudge)}</div>
</td></tr></table>`;
}

function glanceRow(c: InternCard): string {
  const st = STATUS[c.status.key];
  const p = c.project;
  return `<tr style="border-top:1px solid ${LINE}">
<td style="padding:6px 8px;font-weight:700;color:${NAVY}">${esc(c.name)}</td>
<td style="padding:6px 8px;color:#334155">${esc(c.trackLabel)}</td>
<td style="padding:6px 8px">${pill(c.status.label, st)}</td>
<td style="padding:6px 8px;text-align:center">${esc(c.training.gateDone)}/3</td>
<td style="padding:6px 8px;text-align:center">${esc(c.activity.last7.activeDays)}/7</td>
<td style="padding:6px 8px;text-align:center">${p ? `${esc(p.pct ?? 0)}%` : '-'}</td>
<td style="padding:6px 8px;text-align:center">${p && p.lastCommitDays !== null ? `${esc(p.lastCommitDays)}d` : '-'}</td>
<td style="padding:6px 8px;text-align:center">${c.emails.awaitingReply ? '<strong style="color:#991b1b">yes</strong>' : '-'}</td>
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:900px">
<tr><td style="background:${NAVY};color:#fff;padding:18px 20px;border-radius:6px 6px 0 0">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Colaberry AI Internship</div>
  <div style="font-size:22px;font-weight:700;margin-top:2px">Internship Report</div>
  <div style="font-size:13px;opacity:.85;margin-top:2px">${esc(date)} &middot; ${esc(t.interns)} interns &middot; same data as Admin &gt; Interns (Projects, Intern Console, Activity Timeline)</div>
</td></tr>
<tr><td style="padding:14px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
    ${kpi('Interns', t.interns, NAVY)}${kpi('On track', t.onTrack, '#16a34a')}${kpi('Need attention', t.attention, '#ea580c')}${kpi('Stalled', t.stalled, RED)}${kpi('Weeks 1-3 cleared', k.weeks_1_3_clear ?? '-', '#16a34a')}${kpi('No project', k.no_project ?? '-', '#ea580c')}${kpi('Replies you owe', t.repliesOwed, RED)}
  </tr></table>
</td></tr>
<tr><td style="padding:10px 0 0">
  <div style="background:#fff;border:1px solid ${LINE};border-top:3px solid ${RED};border-radius:6px;padding:12px 16px">
    <div style="font-size:14px;font-weight:700;color:${NAVY}">Your move</div>${list(report.aliMoves)}
  </div>
</td></tr>
<tr><td style="padding:14px 0 0">
  <div style="background:#fff;border:1px solid ${LINE};border-radius:6px;padding:12px 16px">
    <div style="font-size:14px;font-weight:700;color:${NAVY};margin-bottom:6px">At a glance</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse">
      <tr style="color:${MUTED};text-transform:uppercase;font-size:10px;letter-spacing:1px"><td style="padding:4px 8px">Intern</td><td style="padding:4px 8px">Track</td><td style="padding:4px 8px">Status</td><td style="padding:4px 8px;text-align:center">Wk 1-3</td><td style="padding:4px 8px;text-align:center">Active 7d</td><td style="padding:4px 8px;text-align:center">Build</td><td style="padding:4px 8px;text-align:center">Last commit</td><td style="padding:4px 8px;text-align:center">Reply owed</td></tr>
      ${all.map(glanceRow).join('')}
    </table>
  </div>
</td></tr>
${report.groups.map((g) => `<tr><td style="padding:18px 0 6px"><div style="font-size:17px;font-weight:700;color:${NAVY};border-bottom:2px solid ${RED};padding-bottom:4px">${esc(g.title)} (${g.interns.length})</div></td></tr>
<tr><td>${g.interns.map(internCard).join('')}</td></tr>`).join('')}
<tr><td style="padding:10px 4px 24px;font-size:11px;color:${MUTED};line-height:1.6">
  Training strip: weeks 1 to the end of the curriculum, green = week done (30%+ of cards), orange = started; weeks 1-3 outlined in red. Activity strip: last 28 days, colored by the main kind of activity (orange training, red project, brown certification, purple community).
  "Lately" covers the last ${esc(report.lookbackDays)} days; emails cover the last ${esc(report.emailLookbackDays)} days. "Waiting on your reply" = their latest email is newer than anything sent to them from colaberry.com and under 7 days old.
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
      `  Training: ${c.training.weeksCompleted}/${c.training.weeksTotal} weeks, gate ${c.training.gateDone}/3. Active ${c.activity.last7.activeDays}/7 days.`,
      c.project ? `  Project: ${c.project.name}, ${c.project.pct ?? 0}% (${c.project.tasksDone ?? 0}/${c.project.tasksTotal ?? 0})${c.project.overdue ? `, ${c.project.overdue} overdue` : ''}` : '  Project: none',
      `  Lately: ${c.lately.join(' ') || 'nothing recorded'}`,
      c.asks && c.asks.length ? `  Asks: ${c.asks.join('; ')}` : null,
      c.emails.awaitingReply ? `  WAITING ON YOUR REPLY: "${c.emails.awaitingSubject}"` : null,
      `  Next: ${c.nextSteps.join(' ') || '-'}`,
      `  Nudge: ${c.nudge}`,
    ].filter(Boolean))]),
  ].join('\n'));

  return { subject, html, text };
}


