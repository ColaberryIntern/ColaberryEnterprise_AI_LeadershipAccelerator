/**
 * renderArtifacts - PURE. The Command Center button, the artifacts block (published, each one
 * opening in a new tab; overdue; due this week) and the "Ask them for" cards (why, the Claude Code
 * prompt to paste, and the matching nudge). Email-safe: tables, inline styles, every value escaped.
 */
import { kindLabel } from './artifacts';
import type { InternCard } from './types';

const NAVY = '#1a365d';
const MUTED = '#64748b';
const MAX_PUBLISHED = 10;

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeHref = (u: string): string | null => (/^https:\/\//.test(u) ? esc(u) : null);
const label = (t: string, color = MUTED): string => `<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${color};font-weight:700;margin:12px 0 4px">${esc(t)}</div>`;
const pill = (text: string, fg: string, bg: string, border = bg): string =>
  `<span style="display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:12px;font-size:12px;background:${bg};color:${fg};border:1px solid ${border}">${text}</span>`;

/** The button in the card header: their published Command Center, or a clear "not published". */
export function commandCenterHtml(c: InternCard): string {
  const url = c.project?.commandCenterUrl ? safeHref(c.project.commandCenterUrl) : null;
  if (url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;padding:5px 12px;border-radius:6px;background:${NAVY};color:#ffffff;font-size:12px;font-weight:700;text-decoration:none">Open Command Center &#8599;</a>`;
  }
  return c.project ? `<div style="margin-top:6px;font-size:11px;color:#9a3412;font-weight:700">No Command Center published</div>` : '';
}

export function artifactsHtml(c: InternCard): string {
  const a = c.artifacts;
  const pub = a.published.slice(0, MAX_PUBLISHED).map((p) => {
    const href = safeHref(p.url);
    const text = `<strong>${esc(kindLabel(p.kind))}</strong>: ${esc(p.title.length > 60 ? `${p.title.slice(0, 59)}...` : p.title)}`;
    return href
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:12px;font-size:12px;background:#4338ca;color:#ffffff;text-decoration:none">${text} &#8599;</a>`
      : pill(text, '#ffffff', '#4338ca');
  }).join('');
  const more = a.published.length > MAX_PUBLISHED ? ` <span style="font-size:11px;color:${MUTED}">+${a.published.length - MAX_PUBLISHED} more in their portfolio</span>` : '';
  const overdue = a.overdue.map((o) => pill(`<strong>Overdue, week ${o.week}</strong>: ${esc(kindLabel(o.kind))}, ${esc(o.title)}`, '#ffffff', '#9f1239')).join('');
  // One line, not one chip per card: in week 1 there are seven, and they are not late yet.
  const due = a.dueNow.length
    ? pill(`<strong>Due this week (week ${a.dueNow[0].week})</strong>: ${esc([...new Set(a.dueNow.map((o) => kindLabel(o.kind)))].join(', '))}`, '#b45309', '#fef3c7', '#f59e0b')
    : '';
  return `${label(`Artifacts (${a.published.length} published${a.overdue.length ? `, ${a.overdue.length} overdue` : ''})`)}
<div>${pub || `<span style="font-size:12px;color:${MUTED}">Nothing published yet.</span>`}${more}</div>
${overdue ? `<div style="margin-top:4px">${overdue}</div>` : ''}
${due ? `<div style="margin-top:4px">${due}</div>` : ''}`;
}

/** One card per ask: what it is and why, the prompt to paste, and the nudge that asks for it. */
export function asksHtml(c: InternCard): string {
  const asks = c.artifacts.asks;
  if (!asks.length) return '';
  const cards = asks.map((k, i) => `
<div style="border:1px solid #c7d2fe;border-left:4px solid #4338ca;border-radius:6px;padding:10px 12px;margin:8px 0;background:#fafaff">
  <div style="font-size:13px;font-weight:700;color:#312e81">${i + 1}. ${esc(k.name)}</div>
  <div style="font-size:12px;color:#334155;margin-top:2px">${esc(k.why)}</div>
  <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:700;margin:8px 0 2px">Prompt to give them</div>
  <pre style="margin:0;white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.45;background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px">${esc(k.prompt)}</pre>
  <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:700;margin:8px 0 2px">Matching nudge</div>
  <div style="font-size:13px;line-height:1.5;background:#ffffff;border-left:3px solid #4338ca;padding:6px 10px">${esc(k.nudge)}</div>
</div>`).join('');
  return `${label('Ask them for', '#4338ca')}${cards}`;
}

/** Plain-text version, for the text part of the email. */
export function artifactsText(c: InternCard): string[] {
  const a = c.artifacts;
  const out = [`  Artifacts: ${a.published.length} published${a.overdue.length ? `, ${a.overdue.length} overdue` : ''}${c.project?.commandCenterUrl ? `. Command Center: ${c.project.commandCenterUrl}` : ''}`];
  for (const p of a.published.slice(0, 5)) out.push(`    ${kindLabel(p.kind)}: ${p.title} ${p.url}`);
  for (const o of a.overdue.slice(0, 5)) out.push(`    OVERDUE week ${o.week} ${kindLabel(o.kind)}: ${o.title}`);
  for (const k of a.asks) out.push(`  ASK: ${k.name}. ${k.why}`, `    Nudge: ${k.nudge}`, ...k.prompt.split('\n').map((l) => `    > ${l}`));
  return out;
}
