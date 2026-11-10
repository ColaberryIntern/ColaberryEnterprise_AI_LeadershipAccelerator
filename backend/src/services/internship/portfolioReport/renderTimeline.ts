/**
 * renderTimeline - PURE. Timeline -> email-safe HTML (tables + inline styles only).
 *
 * Color is the point: a reader should get the story from color and spacing before reading a word.
 * One palette, used identically in the legend, the 21-day strip, the day rows and the "next" block.
 */
import type { EventKind, Timeline, TimelineNext, TimelineRow } from './types';

export const KIND: Record<EventKind, { fg: string; bg: string; solid?: boolean; name: string }> = {
  late: { fg: '#ffffff', bg: '#9f1239', solid: true, name: 'Late' },
  stuck: { fg: '#b91c1c', bg: '#fee2e2', name: 'Stuck' },
  unstuck: { fg: '#3f6212', bg: '#d9f99d', name: 'Unstuck' },
  verified: { fg: '#ffffff', bg: '#15803d', solid: true, name: 'Verified story' },
  commit: { fg: '#1d4ed8', bg: '#dbeafe', name: 'Commits' },
  question: { fg: '#6d28d9', bg: '#ede9fe', name: 'Question' },
  update: { fg: '#475569', bg: '#f1f5f9', name: 'Update' },
  reply: { fg: '#0e7490', bg: '#cffafe', name: 'Your reply' },
  training: { fg: '#b45309', bg: '#fef3c7', name: 'Training' },
};
/** Strip and rail colors: strong for story moments, pale for routine training so it never dominates. */
const STRIP_COLOR: Record<EventKind, string> = {
  late: '#9f1239', stuck: '#dc2626', unstuck: '#84cc16', verified: '#15803d', commit: '#3b82f6',
  question: '#7c3aed', update: '#cbd5e1', reply: '#06b6d4', training: '#fde68a',
};
const NEXT_STYLE: Record<TimelineNext['kind'], { fg: string; bg: string; border: string }> = {
  owed: { fg: '#ffffff', bg: '#0e7490', border: '#0e7490' },
  late: { fg: '#ffffff', bg: '#9f1239', border: '#9f1239' },
  stuck: { fg: '#b91c1c', bg: '#fee2e2', border: '#b91c1c' },
  noproject: { fg: '#9a3412', bg: '#ffedd5', border: '#ea580c' },
  next: { fg: '#1a365d', bg: '#ffffff', border: '#1a365d' },
  training: { fg: '#b45309', bg: '#fef3c7', border: '#f59e0b' },
};

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s: string | undefined, n: number): string => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}...` : t; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDay = (d: string): string => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const dow = (d: string): string => DOW[new Date(`${d}T12:00:00Z`).getUTCDay()];

function chip(kind: EventKind, label: string, detail?: string, meta?: string, slow?: boolean): string {
  const k = KIND[kind];
  const metaHtml = meta ? ` <span style="font-weight:700;color:${slow ? '#b45309' : k.fg}">(${esc(meta)})</span>` : '';
  const border = slow ? 'border:2px solid #f59e0b;' : `border:1px solid ${k.solid ? k.bg : k.fg}33;`;
  return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:12px;font-size:12px;line-height:1.35;background:${k.bg};color:${k.fg};${border}"><strong>${esc(label)}</strong>${detail ? `: ${esc(clip(detail, 80))}` : ''}${metaHtml}</span>`;
}

export function legendHtml(): string {
  const order: EventKind[] = ['late', 'stuck', 'unstuck', 'verified', 'commit', 'question', 'reply', 'training'];
  return order.map((k) => chip(k, KIND[k].name)).join('')
    + ` <span style="font-size:12px;color:#b91c1c;border-left:3px dashed #dc2626;padding-left:6px;margin-left:6px">red dashed gap = 4+ days with no build work</span>`
    + ` <span style="font-size:12px;color:#b45309;border:2px solid #f59e0b;border-radius:12px;padding:1px 6px;margin-left:6px">amber ring = reply took 2+ days</span>`;
}

/**
 * 21 columns; each column stacks a small bar per kind of thing that happened that day. Today is the
 * LEFT column, matching the timeline below it, which also reads from today backwards.
 */
export function stripHtml(t: Timeline, cell = 14): string {
  const cols = [...t.strip].reverse().map((s) => {
    const isToday = s.day === t.today;
    const bars = s.kinds.length
      ? s.kinds.slice(0, 4).map((k) => `<div style="height:${Math.max(4, Math.floor(20 / Math.min(4, s.kinds.length)))}px;background:${STRIP_COLOR[k]};margin-bottom:1px;border-radius:1px"></div>`).join('')
      : '<div style="height:20px;background:#eef2f7;border-radius:1px"></div>';
    return `<td title="${esc(fmtDay(s.day))}: ${esc(s.kinds.join(', ') || 'nothing')}" style="width:${cell}px;padding:0 1px;vertical-align:bottom;${isToday ? 'outline:2px solid #1a365d;' : ''}">${bars}</td>`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>${cols}</tr>
<tr><td colspan="${t.strip.length}" style="font-size:10px;color:#94a3b8;padding-top:2px"><span style="font-weight:700;color:#1a365d">today</span><span style="float:right">${esc(fmtDay(t.start))}</span></td></tr></table>`;
}

function gapRow(days: number, stuck: boolean): string {
  if (days < 2) return '';
  const style = stuck
    ? 'color:#b91c1c;font-weight:700;border-left:3px dashed #dc2626'
    : 'color:#94a3b8;border-left:3px solid #e2e8f0';
  const text = stuck ? `${days} days, no build work` : `${days} days`;
  return `<tr><td></td><td style="padding:2px 0 2px 10px"><div style="${style};padding:3px 0 3px 10px;font-size:11px">${esc(text)}</div></td></tr>`;
}

function dayRow(label: string, sub: string, chips: string, accent: string): string {
  return `<tr>
<td style="width:70px;vertical-align:top;padding:4px 8px 4px 0;text-align:right;white-space:nowrap"><div style="font-size:12px;font-weight:700;color:#1a365d">${esc(label)}</div><div style="font-size:10px;color:#94a3b8">${esc(sub)}</div></td>
<td style="vertical-align:top;padding:4px 0 4px 10px;border-left:3px solid ${accent}">${chips}</td></tr>`;
}

function rowLabel(r: TimelineRow): { label: string; sub: string } {
  if (r.day === r.dayEnd) return { label: fmtDay(r.day), sub: dow(r.day) };
  const end = r.day.slice(5, 7) === r.dayEnd.slice(5, 7) ? String(Number(r.dayEnd.slice(8, 10))) : fmtDay(r.dayEnd);
  return { label: `${fmtDay(r.day)}-${end}`, sub: r.onlyTraining ? 'training only' : r.mode === 'talk' ? 'conversation' : 'building' };
}

/**
 * Newest first (Ali, 9 Nov: "work from today down... I will keep going down the more I need
 * history"). TODAY and what needs attention sit at the top, then the most recent row, and each gap
 * line sits between a row and the OLDER row beneath it.
 */
export function timelineHtml(t: Timeline): string {
  const parts: string[] = [];
  const nowChips = t.next.length
    ? t.next.map((n) => { const s = NEXT_STYLE[n.kind]; return `<div style="margin:3px 0;padding:5px 9px;border-radius:6px;font-size:12px;background:${s.bg};color:${s.fg};border:1px solid ${s.border}"><strong>${esc(n.label)}</strong>: ${esc(clip(n.detail, 110))}</div>`; }).join('')
    : '<div style="font-size:12px;color:#15803d;font-weight:700">Nothing late, nothing waiting.</div>';
  parts.push(`<tr>
<td style="width:70px;vertical-align:top;padding:6px 8px 4px 0;text-align:right"><div style="display:inline-block;background:#1a365d;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px">TODAY</div></td>
<td style="vertical-align:top;padding:4px 0 4px 10px;border-left:3px solid #1a365d"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700">Up next / needs attention</div>${nowChips}</td></tr>`);
  // Between TODAY and the newest row: how long since anything happened.
  parts.push(gapRow(t.sinceLastRow, t.quietNow !== null && t.quietNow >= 4 && t.sinceLastRow >= 4));
  for (const r of [...t.rows].reverse()) {
    const top = r.events[0]?.kind ?? 'update';
    const chips = r.events.map((e) => chip(e.kind, e.label, e.detail, e.meta, e.slow)).join('');
    const { label, sub } = rowLabel(r);
    // Routine spans get a quiet rail; story moments get the strong color of what happened.
    const accent = r.onlyTraining ? '#fde68a' : r.mode === 'build' ? '#93c5fd' : r.mode === 'talk' ? '#a5f3fc' : STRIP_COLOR[top];
    parts.push(dayRow(label, sub, chips, accent));
    parts.push(gapRow(r.gapBefore, r.gapStuck));
  }
  if (!t.rows.length) parts.push(`<tr><td></td><td style="padding:4px 0 4px 10px;font-size:12px;color:#94a3b8">Nothing recorded in the last ${t.windowDays} days.</td></tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${parts.join('')}</table>`;
}

/** The single most important "next" item, for the at-a-glance table. */
export function topNextHtml(t: Timeline): string {
  const n = t.next[0];
  if (!n) return '<span style="color:#15803d;font-weight:700">Nothing waiting</span>';
  const s = NEXT_STYLE[n.kind];
  return `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;background:${s.bg};color:${s.fg};border:1px solid ${s.border}"><strong>${esc(n.label)}</strong></span> <span style="font-size:11px;color:#334155">${esc(clip(n.detail, 60))}</span>${t.next.length > 1 ? ` <span style="font-size:11px;color:#94a3b8">+${t.next.length - 1}</span>` : ''}`;
}
