/**
 * govPursuitEmail: the one morning email. PURE: it renders a DiscoveryBoard, the same object the board route returns, so
 * the two can't disagree. Email clients need tables and inline styles, so there is no flexbox, grid, <style> or script,
 * and the charts are table cells with widths. All feed and ZIP-derived text is escaped, and only http(s) links render.
 */
import type { BoardRow, DiscoveryBoard, HideDecision } from './govDiscoveryBoard';
import { AI_NOT_A_FIT_REASON, isSameBid, OFF_TARGET_REASON } from './govDiscoveryBoard';
import type { GovCurrentProject } from '../govPipeline';

const APP_BASE = process.env.APP_PUBLIC_BASE || 'https://enterprise.colaberry.ai';
const INK = '#1a2230';
const MUTED = '#5b6472';
const LINE = '#e3e5e8';
const BAR_WIDTH = 560;
const LIST_CAP = 40;

const TONES = {
  good: { bg: '#def3e6', ink: '#0f5c30', bar: '#1b8a4b' },
  warn: { bg: '#fdf0d0', ink: '#6f4a00', bar: '#d08a00' },
  bad: { bg: '#fbe0e0', ink: '#8c1d21', bar: '#d3343a' },
  info: { bg: '#e1ecfa', ink: '#174a8c', bar: '#2a78d6' },
  mute: { bg: '#f0efec', ink: '#52514e', bar: '#8a8983' },
};
type Tone = keyof typeof TONES;

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** The Qualify link, with the title and agency the workspace stores when the record is first opened. */
export function qualifyUrl(uuid: string, title?: string | null, agency?: string | null): string {
  const q = [`gws=${encodeURIComponent(`gws:${uuid}`)}`];
  if (title) q.push(`from=${encodeURIComponent(title)}`);
  if (agency) q.push(`agency=${encodeURIComponent(agency)}`);
  return `${APP_BASE}/admin/gov-qualification?${q.join('&')}`;
}

const chip = (text: string, tone: Tone): string =>
  `<span style="display:inline-block;background:${TONES[tone].bg};color:${TONES[tone].ink};font-size:12px;font-weight:bold;padding:2px 8px;border-radius:10px;white-space:nowrap">${esc(text)}</span>`;

export const fitTone = (fit: number | null | undefined): Tone => (typeof fit !== 'number' ? 'mute' : fit >= 75 ? 'good' : fit >= 60 ? 'warn' : 'bad');
export const daysTone = (days: number | null): Tone => (days === null ? 'mute' : days < 15 ? 'bad' : days <= 30 ? 'warn' : 'good');

/** Whole days between two YYYY-MM-DD dates; null when the close date is unknown. */
export function daysUntil(closeDate: string | null | undefined, today: string): number | null {
  if (!closeDate) return null;
  const a = Date.parse(`${String(closeDate).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((a - b) / 86400000);
}

function chips(r: BoardRow, today: string): string {
  const o = r.opportunity;
  const days = daysUntil(o.closeDate, today);
  const parts: string[] = [];
  parts.push(chip(typeof o.fitScore === 'number' ? `Fit ${o.fitScore}` : 'Fit unknown', fitTone(o.fitScore)));
  if (typeof r.vetting?.coveragePct === 'number') parts.push(chip(`${r.vetting.coveragePct}% capability match`, r.vetting.coveragePct >= 50 ? 'good' : 'warn'));
  parts.push(chip(days === null ? 'Close date unknown' : `${days} days left`, daysTone(days)));
  return parts.join(' ');
}

/** Feed and ZIP text can hold one long unbroken string, which would otherwise push the email wider than the phone. */
const WRAP = 'overflow-wrap:anywhere;word-break:break-word';

const link = (href: string, text: string, color = '#1557b0'): string =>
  `<a href="${esc(href)}" style="color:${color};font-weight:bold;text-decoration:none">${esc(text)}</a>`;
const bonfireLink = (r: BoardRow, text: string): string =>
  (typeof r.opportunity.sourceUrl === 'string' && /^https?:\/\//i.test(r.opportunity.sourceUrl) ? link(r.opportunity.sourceUrl, text) : '');

function card(icon: string, r: BoardRow, today: string, body: string, actions: string[]): string {
  const o = r.opportunity;
  return `<tr><td style="padding:12px 14px;border-top:1px solid ${LINE}">`
    + `<div style="font-size:15px;font-weight:bold;color:${INK};${WRAP}">${icon} ${esc(o.title)}</div>`
    + `<div style="font-size:13px;color:${MUTED};margin:2px 0 6px;${WRAP}">${esc(o.agency)}</div>`
    + `<div style="margin:0 0 6px">${chips(r, today)}</div>`
    + body
    + `<div style="font-size:13px;margin-top:6px">${actions.filter(Boolean).join(' &nbsp;&middot;&nbsp; ')}</div>`
    + `</td></tr>`;
}

function section(title: string, hint: string, accent: string, rows: string[], overflow = 0): string {
  if (rows.length === 0) return '';
  const more = overflow > 0 ? `<tr><td style="padding:10px 14px;border-top:1px solid ${LINE};font-size:13px;color:${MUTED}">Plus ${overflow} more on the ${link(`${APP_BASE}/admin/gov-opportunities`, 'board')}.</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-top:3px solid ${accent};border-radius:6px;margin:0 0 16px;background:#ffffff">`
    + `<tr><td style="padding:12px 14px"><div style="font-size:16px;font-weight:bold;color:${INK}">${title}</div><div style="font-size:13px;color:${MUTED}">${esc(hint)}</div></td></tr>`
    + rows.join('') + more + `</table>`;
}

function tile(icon: string, label: string, value: number, tone: Tone): string {
  return `<td width="25%" valign="top" style="padding:4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TONES[tone].bg};border-radius:6px"><tr><td style="padding:10px;text-align:center">`
    + `<div style="font-size:24px;font-weight:bold;color:${TONES[tone].ink}">${value}</div>`
    + `<div style="font-size:12px;color:${TONES[tone].ink}">${icon} ${esc(label)}</div></td></tr></table></td>`;
}

/** A horizontal stacked bar as table cells, the one chart form that survives Outlook. Each segment is also in the key. */
function stackedBar(segments: { label: string; value: number; tone: Tone }[]): string {
  const live = segments.filter((s) => s.value > 0);
  const total = live.reduce((n, s) => n + s.value, 0);
  if (total === 0) return '';
  const cells = live.map((s) => `<td width="${Math.max(1, Math.round((s.value / total) * BAR_WIDTH))}" height="14" style="background:${TONES[s.tone].bar};font-size:1px;line-height:14px">&nbsp;</td>`).join('');
  const key = live.map((s) => `<span style="white-space:nowrap"><span style="color:${TONES[s.tone].bar}">&#9632;</span> ${esc(s.label)} ${s.value}</span>`).join(' &nbsp; ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:2px 0;margin:6px 0"><tr>${cells}</tr></table>`
    + `<div style="font-size:12px;color:${MUTED};margin-bottom:12px">${key}</div>`;
}

/**
 * PURE. A rough read of build progress against days left, not a forecast: there is no planned schedule to compare with.
 * At risk: under 15 days left and under half built. Watch: up to 30 days left and under half built.
 */
export function projectHealth(p: Pick<GovCurrentProject, 'closeDate' | 'build'>, today: string): { label: string; tone: Tone } {
  const pct = p.build?.pct ?? 0;
  const days = daysUntil(p.closeDate, today);
  if (days !== null && days < 15 && pct < 50) return { label: 'At risk', tone: 'bad' };
  if (days !== null && days <= 30 && pct < 50) return { label: 'Watch', tone: 'warn' };
  if (!p.build) return { label: 'Build not started', tone: 'mute' };
  return { label: 'OK', tone: 'good' };
}

function projectCard(p: GovCurrentProject, today: string): string {
  const days = daysUntil(p.closeDate, today);
  const health = projectHealth(p, today);
  const pct = Math.max(0, Math.min(100, p.build?.pct ?? 0));
  const bar = p.build
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px"><tr>`
      + (pct > 0 ? `<td width="${pct}%" height="8" style="background:${TONES[health.tone].bar};font-size:1px;line-height:8px">&nbsp;</td>` : '')
      + (pct < 100 ? `<td height="8" style="background:${LINE};font-size:1px;line-height:8px">&nbsp;</td>` : '')
      + `</tr></table><div style="font-size:13px;color:${MUTED}">${p.build.verified} of ${p.build.total} build stories verified (${pct}%)</div>`
    : `<div style="font-size:13px;color:${MUTED}">The build has not started.</div>`;
  return `<tr><td style="padding:12px 14px;border-top:1px solid ${LINE}">`
    + `<div style="font-size:15px;font-weight:bold;color:${INK};${WRAP}">🏗️ ${esc(p.title)}</div>`
    + (p.agency ? `<div style="font-size:13px;color:${MUTED};margin:2px 0 6px;${WRAP}">${esc(p.agency)}</div>` : '')
    + `<div style="margin:0 0 6px">${chip(health.label, health.tone)} ${chip(days === null ? 'Close date unknown' : `${days} days left`, daysTone(days))}</div>`
    + bar
    + `<div style="font-size:13px;color:${INK};margin-top:4px;${WRAP}">👤 ${esc(p.interns.join(', ') || 'No intern named')} &nbsp;&middot;&nbsp; ${p.establishedCount} requirements established</div>`
    + `<div style="font-size:13px;margin-top:6px">${link(`${APP_BASE}/admin/internship/gov-contract/${encodeURIComponent(p.deliveryProjectId)}`, 'Open project')}</div>`
    + `</td></tr>`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** PURE. The note at the top. Counts only and no titles, so no bid is named twice in the email. No em dashes. */
export function summaryNote(board: DiscoveryBoard, hidden: readonly HideDecision[], today: string): string[] {
  const c = board.counts;
  const out: string[] = ['Ali, here is where your gov pursuit stands this morning.'];
  const projects = board.currentProjects;
  if (projects.length > 0) {
    const risky = projects.filter((p) => projectHealth(p, today).label === 'At risk').length;
    out.push(`${plural(projects.length, 'current project is', 'current projects are')} with interns${risky > 0 ? `, and ${plural(risky, 'is', 'are')} at risk` : ''}.`);
  }
  const soonest = board.rows.filter((r) => r.stage === 'vetted').map((r) => daysUntil(r.opportunity.closeDate, today)).filter((d): d is number => d !== null).sort((a, b) => a - b)[0];
  if (c.vetted > 0) out.push(`${plural(c.vetted, 'bid is', 'bids are')} AI vetted and ready for you to read${soonest !== undefined ? `, the soonest closing in ${soonest} days` : ''}.`);
  if (c.needs_read > 0) out.push(`${plural(c.needs_read, 'bid needs', 'bids need')} your read because the AI could not call it or someone has started it.`);
  if (c.approved > 0) out.push(`${plural(c.approved, 'approved bid is', 'approved bids are')} waiting for an intern.`);
  if (c.needs_zip > 0) out.push(`${plural(c.needs_zip, 'bid passed', 'bids passed')} the first check and ${c.needs_zip === 1 ? 'needs its' : 'need their'} ZIP uploaded.`);
  if (c.analyzing > 0) out.push(`${plural(c.analyzing, 'ZIP is', 'ZIPs are')} in the AI queue.`);
  if (hidden.length > 0) out.push(`${plural(hidden.length, 'bid was', 'bids were')} hidden this morning.`);
  if (out.length === 1) out.push('Nothing needs you today.');
  return out;
}

const HIDE_WORDS: Record<string, string> = {
  [AI_NOT_A_FIT_REASON]: 'AI says not a fit',
  [OFF_TARGET_REASON]: 'Off-target title',
};
const hideWord = (reason: string): string => HIDE_WORDS[reason] ?? 'Fit under 60';

export function govPursuitSubject(board: DiscoveryBoard): string {
  const parts: string[] = [];
  const n = (count: number, word: string): void => { if (count > 0) parts.push(`${count} ${word}`); };
  n(board.counts.vetted, 'vetted ⭐');
  n(board.counts.needs_read, 'to read');
  n(board.counts.approved, 'to assign');
  n(board.counts.needs_zip, board.counts.needs_zip === 1 ? 'ZIP to upload' : 'ZIPs to upload');
  if (parts.length === 0) return `🏛️ Gov pursuit: ${board.incomplete ? 'some data could not be read, check the board' : 'nothing needs you today'}`;
  return `🏛️ Gov pursuit: ${parts.join(', ')}`;
}

const byDeadline = (a: BoardRow, b: BoardRow): number => String(a.opportunity.closeDate ?? '9999').localeCompare(String(b.opportunity.closeDate ?? '9999'));

export function renderGovPursuitEmail(board: DiscoveryBoard, hidden: readonly HideDecision[], today: string): string {
  const of = (stage: BoardRow['stage']) => board.rows.filter((r) => r.stage === stage).sort(byDeadline);
  const c = board.counts;
  const open = (r: BoardRow) => link(qualifyUrl(r.opportunity.uuid, r.opportunity.title, r.opportunity.agency), 'Open and read');
  // The AI's own words follow house style. The quote and the title stay verbatim, because they are the source's words.
  const why = (r: BoardRow) => (r.vetting?.reason ? `<div style="font-size:14px;color:${INK};${WRAP}">${esc(r.vetting.reason.replace(/\s*—\s*/g, ', '))}</div>` : '');
  const quote = (r: BoardRow) => (r.vetting?.quote ? `<div style="font-size:13px;color:${MUTED};border-left:3px solid ${LINE};padding-left:8px;margin-top:4px;${WRAP}">&ldquo;${esc(r.vetting.quote)}&rdquo;</div>` : '');

  const vetted = of('vetted').map((r) => card('⭐', r, today, why(r) + quote(r), [open(r), bonfireLink(r, 'View on Bonfire')]));
  const read = of('needs_read').map((r) => card('👀', r, today, why(r) + quote(r), [open(r), bonfireLink(r, 'View on Bonfire')]));
  const approved = of('approved').map((r) => card('✅', r, today, '', [link(qualifyUrl(r.opportunity.uuid, r.opportunity.title, r.opportunity.agency), 'Build and assign an intern')]));
  const uploads = of('needs_zip');
  const uploadCards = uploads.slice(0, LIST_CAP).map((r) => card('📦', r, today, '', [
    bonfireLink(r, '1. Download ZIP on Bonfire'),
    link(qualifyUrl(r.opportunity.uuid, r.opportunity.title, r.opportunity.agency), '2. Upload on Gov Opps'),
  ]));
  const projects = board.currentProjects.map((p) => projectCard(p, today));
  // A hidden bid that is also listed above or repeats another hide is reported once.
  const listed = [...board.rows.map((r) => r.opportunity), ...board.currentProjects];
  const hiddenOnce = hidden.filter((h, i) => !listed.some((l) => isSameBid(l, h.opportunity)) && !hidden.slice(0, i).some((e) => e.opportunity.uuid === h.opportunity.uuid || isSameBid(e.opportunity, h.opportunity)));
  const note = summaryNote(board, hiddenOnce, today);
  const hiddenRows = hiddenOnce.slice(0, LIST_CAP).map((h) => `<tr><td style="padding:8px 14px;border-top:1px solid ${LINE};font-size:13px;color:${INK};${WRAP}">${esc(h.opportunity.title)} ${chip(hideWord(h.reason), h.reason === AI_NOT_A_FIT_REASON ? 'bad' : 'mute')}</td></tr>`);

  const nothing = projects.length + vetted.length + read.length + approved.length + uploadCards.length === 0;
  return `<div style="background:#f3f3f1;padding:16px;font-family:Arial,Helvetica,sans-serif;color:${INK}">`
    + `<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto">`
    + `<tr><td style="background:#15181f;border-top:4px solid #d81f29;border-radius:6px 6px 0 0;padding:16px 18px;color:#f5f5f2"><div style="font-size:20px;font-weight:bold">🏛️ Your gov pursuit morning</div><div style="font-size:13px;color:#c9c8c0">Same list as your Gov Opportunities board</div></td></tr>`
    + `<tr><td style="background:#ffffff;border:1px solid ${LINE};border-top:0;padding:14px 18px;font-size:14px;line-height:21px;color:${INK}"><div style="font-weight:bold;margin-bottom:4px">${esc(note[0])}</div>${esc(note.slice(1).join(' '))}</td></tr>`
    + `<tr><td style="padding:12px 0 0">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`
    + tile('⭐', 'Vetted', c.vetted, 'good') + tile('👀', 'To read', c.needs_read, 'warn') + tile('📦', 'ZIPs to upload', c.needs_zip, 'info') + tile('🤖', 'AI analyzing', c.analyzing, 'mute')
    + `</tr></table>`
    + stackedBar([
      { label: 'Vetted', value: c.vetted, tone: 'good' }, { label: 'To read', value: c.needs_read, tone: 'warn' },
      { label: 'To assign', value: c.approved, tone: 'good' }, { label: 'Analyzing', value: c.analyzing, tone: 'mute' },
      { label: 'ZIPs to upload', value: c.needs_zip, tone: 'info' },
    ])
    + `</td></tr><tr><td>`
    + (board.incomplete ? `<div style="background:${TONES.warn.bg};color:${TONES.warn.ink};border-radius:6px;padding:12px;margin-bottom:16px;font-size:14px">⚠️ Some saved data could not be read this morning, so this list may be incomplete. Check the board before relying on it.</div>` : '')
    + (nothing && !board.incomplete ? `<div style="background:#ffffff;border:1px solid ${LINE};border-radius:6px;padding:16px;margin-bottom:16px;font-size:15px">✅ Nothing needs you today.${c.analyzing > 0 ? ` ${plural(c.analyzing, 'ZIP is', 'ZIPs are')} in the AI queue.` : ''}</div>` : '')
    + section('🏗️ Current projects', 'With interns now, the same list as Interns > Gov Contracts. Status compares build progress with days left.', TONES.info.bar, projects)
    // The stars come before the upload list on purpose: a day can have 40 ZIPs to upload, and the stars must not sit under them.
    + section('⭐ Vetted: read these first', 'The AI checked the ZIP and recommends pursuing. Read it, then build the project and assign an intern.', TONES.good.bar, vetted)
    + section('👀 Needs your read', 'The AI could not call it, or a person has already started this one.', TONES.warn.bar, read)
    + section('✅ Approved: waiting for an intern', 'Approved by a second admin. Assigning an intern moves it to Interns > Gov Contracts.', TONES.good.bar, approved)
    + section('📦 Upload the ZIP', 'These passed the first check. Download each ZIP from Bonfire and upload it. The AI runs the rest on its own.', TONES.info.bar, uploadCards, Math.max(0, uploads.length - LIST_CAP))
    + section('🙈 Hidden this morning', 'Off your board now. Restore any of them from the Hidden list on the board.', TONES.mute.bar, hiddenRows, Math.max(0, hiddenOnce.length - LIST_CAP))
    + `<div style="font-size:12px;color:${MUTED};padding:4px 2px 0">AI verdicts and fit scores are advisory. Verify every deadline on the Bonfire cover page and addenda. ${board.dismissedCount} hidden in all. ${link(`${APP_BASE}/admin/gov-opportunities`, 'Open the board')}</div>`
    + `</td></tr></table></div>`;
}
