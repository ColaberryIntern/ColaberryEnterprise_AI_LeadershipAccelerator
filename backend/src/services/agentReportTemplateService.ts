import { AgentReportContentSection } from '../models/AgentReportSubscription';
import type { TicketTypeCount, TopAuthorizationReason } from './agentReportStatsService';

// Report redesign (2026-10-02) — pure HTML/text rendering, zero I/O, given a
// fully-assembled ReportData object. Separated from agentReportRunService.ts's
// own data-fetching/orchestration (single-responsibility, Modular Composition
// Rule) so the template itself is testable with fixed fake data, without
// mocking a dozen DB calls. Matches this codebase's own established email-safe
// convention (emailService.ts's buildCommunityReplyHtml/buildTrainingWelcomeHtml):
// a 600px table-based layout, 100% inline CSS, no <style> block, no flex/grid —
// many email clients strip <style> or ignore modern CSS, but every client
// renders inline-styled tables.

const NAVY = '#1a365d';
const BODY_TEXT = '#2d3748';
const MUTED = '#718096';
const MUTED_2 = '#6b7280';
const PAGE_BG = '#f7fafc';
const BORDER = '#e2e8f0';
const GREEN = '#38a169';
const RED = '#e53e3e';
const BRAND_RED = '#FB2832';
const TEAL = '#367895';
const AMBER_BG = '#fdf6e3';
const AMBER_BORDER = '#d9a441';
const AMBER_TEXT = '#8a6116';

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeDays(date: Date | null, now: Date): string {
  if (!date) return 'never';
  const days = Math.floor((now.getTime() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export interface ReportData {
  agentId: string;
  agentName: string;
  cadenceLabel: 'DAILY' | 'WEEKLY';
  generatedAt: Date;
  timezone: string;
  triggerTypeLabel: string;
  abacMode: 'off' | 'shadow' | 'enforce';
  sections: AgentReportContentSection[];

  openTicketCount: number;
  openTicketDelta: number | null;
  completedTicketCount30d: number;
  allTimeTicketBreakdown: TicketTypeCount[];
  openTicketBreakdown: TicketTypeCount[];
  needsReplyCount: number;
  pastDueCount: number;
  verifiedResolutionCount: number;
  ownedTicketCountAllTime: number;
  oldestOpenTicketAgeDays: number | null;
  lastTicketActivityAt: Date | null;

  authSummary: { windowDays: number; total: number; allow: number; approval: number; block: number; enforcedCount: number } | null;
  topReasons: TopAuthorizationReason[];

  costUsd: number | null;
  costRuns: number | null;
  totalTokens: number | null;
  topModel: string | null;
  errorCount30d: number | null;

  scheduledTasksOn: number;
  scheduledTasksOff: number;

  /** `null` for a preview of a subscription that hasn't been created yet
   * (handleReportPreview can render ANY contentScope combination before a
   * manager commits to it — there is no real recipient to name). */
  recipient: { displayName: string; email: string } | null;
  agentPageUrl: string;
}

function has(sections: AgentReportContentSection[], s: AgentReportContentSection): boolean {
  return sections.includes(s);
}

function renderBadge(label: string, bg: string, fg: string): string {
  return `<span style="display:inline-block; background:${bg}; color:${fg}; font-size:11px; font-weight:700; letter-spacing:0.3px; text-transform:uppercase; padding:3px 9px; border-radius:999px; margin-right:6px;">${escapeHtml(label)}</span>`;
}

function renderHeader(d: ReportData): string {
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: d.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d.generatedAt);
  const modeBadgeColors = d.abacMode === 'enforce' ? { bg: '#fde8ea', fg: RED } : { bg: '#eef2f7', fg: NAVY };
  return `
<tr><td style="background:${NAVY}; padding:24px 32px 20px;">
  <div style="color:#9fb3cc; font-size:11px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase;">Agent report &middot; ${escapeHtml(d.cadenceLabel)}</div>
  <div style="color:#c3d2e3; font-size:12px; margin-top:4px;">${escapeHtml(dateLabel)}</div>
  <h1 style="margin:14px 0 10px; color:#ffffff; font-size:26px; font-weight:700; line-height:1.2;">${escapeHtml(d.agentName)}</h1>
  <div>
    ${renderBadge(titleCase(d.triggerTypeLabel), 'rgba(255,255,255,0.12)', '#e2e8f0')}
    ${renderBadge(`Mode: ${d.abacMode}`, modeBadgeColors.bg, modeBadgeColors.fg)}
  </div>
</td></tr>`;
}

function renderSummaryLine(d: ReportData): string {
  const parts: string[] = [`${fmtInt(d.openTicketCount)} open ticket${d.openTicketCount === 1 ? '' : 's'}.`];
  if (has(d.sections, 'trust') && d.authSummary) {
    const { allow, total, windowDays } = d.authSummary;
    const allowLabel = allow === 0 ? 'None' : fmtInt(allow);
    parts.push(`${allowLabel} of ${fmtInt(total)} actions cleared without approval in the last ${windowDays} days.`);
  }
  return `<tr><td style="padding:20px 32px 0;"><p style="margin:0; color:${BODY_TEXT}; font-size:15px; line-height:1.6;">${parts.map(escapeHtml).join(' ')}</p></td></tr>`;
}

function renderNeedsAttention(d: ReportData): string {
  const bullets: string[] = [];
  if (has(d.sections, 'trust') && d.authSummary && (d.authSummary.block > 0 || d.authSummary.approval > 0)) {
    bullets.push(`${fmtInt(d.authSummary.block)} action${d.authSummary.block === 1 ? '' : 's'} blocked and ${fmtInt(d.authSummary.approval)} held for approval out of ${fmtInt(d.authSummary.total)} checks`);
  }
  if (has(d.sections, 'tickets') && d.needsReplyCount > 0) {
    bullets.push(`${fmtInt(d.needsReplyCount)} ticket${d.needsReplyCount === 1 ? '' : 's'} waiting on a reply from ${escapeHtml(d.agentName)}`);
  }
  if (has(d.sections, 'tickets') && d.oldestOpenTicketAgeDays !== null && d.openTicketCount > 0) {
    bullets.push(`Oldest open ticket is ${fmtInt(d.oldestOpenTicketAgeDays)} day${d.oldestOpenTicketAgeDays === 1 ? '' : 's'} old`);
  }
  if (bullets.length === 0) return '';
  const items = bullets.map((b) => `<div style="padding:3px 0; color:${AMBER_TEXT}; font-size:14px; line-height:1.5;">&bull;&nbsp; ${b}</div>`).join('');
  return `
<tr><td style="padding:20px 32px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${AMBER_BG}; border:1px solid ${AMBER_BORDER}; border-radius:8px;">
    <tr><td style="padding:14px 18px;">
      <div style="color:${AMBER_TEXT}; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">Needs attention</div>
      ${items}
    </td></tr>
  </table>
</td></tr>`;
}

function renderStatTile(label: string, value: string, sub: string, valueColor = BODY_TEXT): string {
  return `
<td width="25%" valign="top" style="padding:0 6px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid ${BORDER}; border-radius:8px;">
    <tr><td style="padding:14px 14px;">
      <div style="color:${MUTED}; font-size:11px; font-weight:600;">${escapeHtml(label)}</div>
      <div style="color:${valueColor}; font-size:24px; font-weight:700; margin:4px 0 2px;">${value}</div>
      <div style="color:${MUTED_2}; font-size:11px;">${escapeHtml(sub)}</div>
    </td></tr>
  </table>
</td>`;
}

function renderStatTiles(d: ReportData): string {
  const tiles: string[] = [];
  if (has(d.sections, 'tickets')) {
    const deltaSub = d.openTicketDelta === null ? 'no prior report to compare' : `${d.openTicketDelta >= 0 ? '+' : ''}${d.openTicketDelta} since last report`;
    tiles.push(renderStatTile('Open tickets', fmtInt(d.openTicketCount), deltaSub));
    tiles.push(renderStatTile('Completed', fmtInt(d.completedTicketCount30d), 'last 30 days'));
  }
  if (has(d.sections, 'trust') && d.authSummary) {
    tiles.push(renderStatTile('Auto-allowed', fmtInt(d.authSummary.allow), `of ${fmtInt(d.authSummary.total)} policy checks, 30 days`, d.authSummary.allow === 0 ? RED : GREEN));
  }
  if (has(d.sections, 'cost')) {
    tiles.push(d.costUsd !== null
      ? renderStatTile('Cost', fmtUsd(d.costUsd), `${fmtInt(d.costRuns ?? 0)} AI events, 30 days`)
      : renderStatTile('Cost', 'No tracked cost', 'last 30 days'));
  }
  if (tiles.length === 0) return '';
  return `
<tr><td style="padding:20px 26px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tiles.join('')}</tr></table>
</td></tr>`;
}

function renderBar(label: string, count: number, max: number, color: string): string {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return `
<tr>
  <td style="padding:4px 0; color:${BODY_TEXT}; font-size:13px; width:40%;">${escapeHtml(label)}</td>
  <td style="padding:4px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:${BORDER}; border-radius:4px; height:10px;" width="100%">
        <table role="presentation" cellpadding="0" cellspacing="0" width="${pct}%"><tr><td style="background:${color}; border-radius:4px; height:10px; line-height:10px; font-size:1px;">&nbsp;</td></tr></table>
      </td>
    </tr></table>
  </td>
  <td style="padding:4px 0 4px 10px; color:${MUTED_2}; font-size:13px; text-align:right; width:40px;">${fmtInt(count)}</td>
</tr>`;
}

function renderSmallStatBox(label: string, value: string): string {
  return `
<td width="33%" style="padding:0 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG}; border-radius:6px;">
    <tr><td style="padding:10px 12px; text-align:center;">
      <div style="color:${BODY_TEXT}; font-size:17px; font-weight:700;">${escapeHtml(value)}</div>
      <div style="color:${MUTED_2}; font-size:10px; margin-top:2px;">${escapeHtml(label)}</div>
    </td></tr>
  </table>
</td>`;
}

function renderTicketsSection(d: ReportData): string {
  if (!has(d.sections, 'tickets')) return '';
  const allTimeHandled = d.allTimeTicketBreakdown.reduce((sum, t) => sum + t.count, 0);
  const maxAllTime = Math.max(1, ...d.allTimeTicketBreakdown.map((t) => t.count));
  const bars = d.allTimeTicketBreakdown.length
    ? d.allTimeTicketBreakdown.map((t) => renderBar(titleCase(t.type), t.count, maxAllTime, TEAL)).join('')
    : `<tr><td colspan="3" style="padding:6px 0; color:${MUTED_2}; font-size:13px;">No ticket history yet.</td></tr>`;
  const openSplit = d.openTicketBreakdown.length
    ? d.openTicketBreakdown.map((t) => `${titleCase(t.type)}: ${fmtInt(t.count)}`).join(', ')
    : 'none open';

  return `
<tr><td style="padding:26px 32px 0;">
  <h2 style="margin:0 0 4px; color:${NAVY}; font-size:16px; font-weight:700;">Tickets</h2>
  <div style="color:${MUTED_2}; font-size:12px; margin-bottom:12px;">${fmtInt(d.openTicketCount)} open now &middot; ${fmtInt(allTimeHandled)} handled all-time</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bars}</table>
  <div style="color:${MUTED_2}; font-size:11px; margin:8px 0 14px;">All-time by type. Open-only split: ${escapeHtml(openSplit)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${renderSmallStatBox('waiting on a reply', fmtInt(d.needsReplyCount))}
    ${renderSmallStatBox('past due date', fmtInt(d.pastDueCount))}
    ${renderSmallStatBox('verified resolutions', `${fmtInt(d.verifiedResolutionCount)} of ${fmtInt(d.ownedTicketCountAllTime)}`)}
  </tr></table>
</td></tr>`;
}

function renderTrustSection(d: ReportData): string {
  if (!has(d.sections, 'trust') || !d.authSummary) return '';
  const { total, allow, approval, block, enforcedCount, windowDays } = d.authSummary;
  const shadowCount = Math.max(0, total - enforcedCount);
  const approvalPct = total > 0 ? Math.round((approval / total) * 100) : 0;
  const blockPct = total > 0 ? Math.round((block / total) * 100) : 0;
  const reasonsBlock = d.topReasons.length
    ? `<div style="color:${MUTED_2}; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; margin:14px 0 6px;">Top reasons</div>` +
      d.topReasons.map((r) => `<div style="padding:3px 0; color:${BODY_TEXT}; font-size:13px; display:flex;"><span style="flex:1;">${escapeHtml(titleCase(r.action))} &middot; ${escapeHtml(r.reason)}</span><span style="color:${MUTED_2};">${fmtInt(r.count)}</span></div>`).join('')
    : '';

  return `
<tr><td style="padding:26px 32px 0;">
  <h2 style="margin:0 0 4px; color:${NAVY}; font-size:16px; font-weight:700;">Trust</h2>
  <div style="color:${MUTED_2}; font-size:12px; margin-bottom:10px;">${fmtInt(total)} policy checks &middot; last ${windowDays} days</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background:${BORDER}; border-radius:4px; height:12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" height="12"><tr>
        <td style="background:${AMBER_BORDER}; width:${Math.max(approvalPct, approval > 0 ? 2 : 0)}%; height:12px; line-height:12px; font-size:1px;">&nbsp;</td>
        <td style="background:${RED}; width:${Math.max(blockPct, block > 0 ? 2 : 0)}%; height:12px; line-height:12px; font-size:1px;">&nbsp;</td>
      </tr></table>
    </td>
  </tr></table>
  <div style="color:${MUTED_2}; font-size:11px; margin:6px 0 0;">${fmtInt(approval)} needed approval &middot; ${fmtInt(block)} blocked</div>
  <p style="margin:10px 0 0; color:${BODY_TEXT}; font-size:13px; line-height:1.6;">${fmtInt(allow)} allowed outright &middot; ${fmtInt(enforcedCount)} ran under enforce mode &middot; ${fmtInt(shadowCount)} in shadow mode (logged only)</p>
  ${reasonsBlock}
</td></tr>`;
}

function renderFooterColumns(d: ReportData): string {
  const activityRows: Array<[string, string]> = [];
  if (has(d.sections, 'activity')) {
    activityRows.push(['Last ticket activity', relativeDays(d.lastTicketActivityAt, d.generatedAt)]);
    if (has(d.sections, 'cost') && d.costRuns !== null) activityRows.push(['AI events, 30 days', fmtInt(d.costRuns)]);
    if (d.errorCount30d !== null) activityRows.push(['Errors, 30 days', fmtInt(d.errorCount30d)]);
    activityRows.push(['Scheduled tasks', `${fmtInt(d.scheduledTasksOn)} on &middot; ${fmtInt(d.scheduledTasksOff)} off`]);
  }
  const costRows: Array<[string, string]> = [];
  if (has(d.sections, 'cost')) {
    costRows.push(['Total, 30 days', d.costUsd !== null ? fmtUsd(d.costUsd) : 'No tracked cost']);
    costRows.push(['Per AI event', d.costUsd !== null && d.costRuns && d.costRuns > 0 ? fmtUsd(d.costUsd / d.costRuns) : '&mdash;']);
    costRows.push(['Tokens', d.totalTokens !== null ? fmtInt(d.totalTokens) : '&mdash;']);
    costRows.push(['Model', d.topModel ? escapeHtml(d.topModel) : '&mdash;']);
  }
  if (activityRows.length === 0 && costRows.length === 0) return '';

  const renderRows = (rows: Array<[string, string]>) => rows.map(([k, v]) => `
    <tr>
      <td style="padding:4px 0; color:${MUTED_2}; font-size:12px;">${k}</td>
      <td style="padding:4px 0; color:${BODY_TEXT}; font-size:12px; text-align:right; font-weight:600;">${v}</td>
    </tr>`).join('');

  const activityCol = activityRows.length ? `
<td width="50%" valign="top" style="padding:0 8px 0 0;">
  <div style="color:${NAVY}; font-size:12px; font-weight:700; margin-bottom:6px;">Activity</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${renderRows(activityRows)}</table>
</td>` : '<td width="50%">&nbsp;</td>';
  const costCol = costRows.length ? `
<td width="50%" valign="top" style="padding:0 0 0 8px;">
  <div style="color:${NAVY}; font-size:12px; font-weight:700; margin-bottom:6px;">Cost</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${renderRows(costRows)}</table>
</td>` : '<td width="50%">&nbsp;</td>';

  return `
<tr><td style="padding:24px 32px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER}; padding-top:18px;"><tr>${activityCol}${costCol}</tr></table>
</td></tr>`;
}

function renderCtaFooter(d: ReportData): string {
  const sentLine = d.recipient
    ? `Sent to ${escapeHtml(d.recipient.displayName)} (${escapeHtml(d.recipient.email)}). Manage this subscription from ${escapeHtml(d.agentName)}'s own admin page.`
    : `Preview only — this subscription has not been created yet.`;
  return `
<tr><td style="padding:26px 32px 8px; text-align:center;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background:${BRAND_RED}; border-radius:8px;">
    <a href="${d.agentPageUrl}" style="display:inline-block; padding:12px 26px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">Open ${escapeHtml(d.agentName)}'s page</a>
  </td></tr></table>
</td></tr>
<tr><td style="padding:14px 32px 26px; border-top:1px solid ${BORDER}; margin-top:14px; color:${MUTED_2}; font-size:11px; text-align:center;">
  ${sentLine}
</td></tr>`;
}

export function renderReportHtml(d: ReportData): string {
  const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: d.timezone, month: 'short', day: 'numeric' }).format(d.generatedAt);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(d.agentName)} agent report</title></head>
<body style="margin:0; padding:0; background:${PAGE_BG};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(d.agentName)}: ${fmtInt(d.openTicketCount)} open tickets as of ${escapeHtml(dateLabel)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG}; padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border:1px solid ${BORDER}; border-radius:10px; overflow:hidden; font-family:'Segoe UI', system-ui, -apple-system, sans-serif;">
        ${renderHeader(d)}
        ${renderSummaryLine(d)}
        ${renderNeedsAttention(d)}
        ${renderStatTiles(d)}
        ${renderTicketsSection(d)}
        ${renderTrustSection(d)}
        ${renderFooterColumns(d)}
        ${renderCtaFooter(d)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderReportText(d: ReportData): string {
  const lines: string[] = [`${d.agentName} — Agent Report (${d.cadenceLabel})`, ''];
  lines.push(`${d.openTicketCount} open ticket(s).`);
  if (has(d.sections, 'trust') && d.authSummary) {
    lines.push(`${d.authSummary.allow} of ${d.authSummary.total} actions cleared without approval in the last ${d.authSummary.windowDays} days.`);
  }
  if (has(d.sections, 'tickets')) {
    lines.push('', 'Tickets:', `  Open: ${d.openTicketCount}, Completed (30d): ${d.completedTicketCount30d}`);
    lines.push(`  Waiting on a reply: ${d.needsReplyCount}, Past due: ${d.pastDueCount}`);
    lines.push(`  Verified resolutions: ${d.verifiedResolutionCount} of ${d.ownedTicketCountAllTime}`);
  }
  if (has(d.sections, 'trust') && d.authSummary) {
    const shadowCount = Math.max(0, d.authSummary.total - d.authSummary.enforcedCount);
    lines.push('', 'Trust:', `  ${d.authSummary.allow} allowed, ${d.authSummary.approval} needed approval, ${d.authSummary.block} blocked, ${d.authSummary.enforcedCount} under enforce mode, ${shadowCount} in shadow mode.`);
  }
  if (has(d.sections, 'cost')) {
    lines.push('', 'Cost:', d.costUsd !== null
      ? `  $${d.costUsd.toFixed(4)} over ${d.costRuns ?? 0} AI event(s), last 30 days.`
      : '  No tracked cost in the last 30 days.');
  }
  lines.push('', `Open ${d.agentName}'s page: ${d.agentPageUrl}`);
  lines.push(d.recipient ? `Sent to ${d.recipient.displayName} (${d.recipient.email}).` : 'Preview only — this subscription has not been created yet.');
  return lines.join('\n');
}
