/**
 * renderDashboard - PURE. The interactive report page attached to every report email.
 *
 * Ali, 10 Nov 2026: "Bring back the timeline and visuals we had ... Bring back my formatting ...
 * make it all one big timeline for all the students and then when I filter it filters the timeline,
 * the notes etc ... show them together so I can manage from an overall perspective too", plus a
 * guided tour of the report's 10 most impactful things, and prompts that scroll instead of filling
 * the page.
 *
 * So the page IS the report: every intern card, the glance table, the legend and the timelines are
 * rendered by the same functions as the email (render.ts / renderTimeline.ts / renderArtifacts.ts),
 * so the formatting is identical. On top of that, server-side: one combined timeline for every
 * intern, the tour list, and data-e attributes on everything that belongs to one intern. The client
 * (dashboardApp.ts) only toggles visibility, runs the tour, and adds copy buttons.
 *
 * Escaping: all markup comes from the email renderers (every value through esc()) or from esc()
 * here; the tour data is embedded with safeJson, so no text can close the script tag.
 */
import { brandHeader } from '../brand';
import { STATUS, esc, glanceRow, internCard, kpi } from '../render';
import { STRIP_COLOR, chip, fmtDay, legendHtml, topNextHtml } from '../renderTimeline';
import type { PortfolioReport } from '../types';
import type { Sidecar } from '../sidecar/types';
import { dashboardApp } from './dashboardApp';

const NAVY = '#1a365d';
const RED = '#C20E1E';
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
/** JSON safe inside a <script> element: "<" never appears raw, so "</script>" cannot occur. */
export const safeJson = (v: unknown): string => JSON.stringify(v).split('<').join('\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (d: string): string => DOW[new Date(`${d}T12:00:00Z`).getUTCDay()];
const box = (title: string, inner: string, id = '', extra = ''): string => `<section class="box"${id ? ` id="${id}"` : ''}${extra}><h2>${esc(title)}</h2>${inner}</section>`;

/** Everyone on one timeline: TODAY (each intern's most urgent item), then each day, newest first. */
function combinedTimeline(report: PortfolioReport): string {
  const cards = report.groups.flatMap((g) => g.interns);
  const namePill = (c: (typeof cards)[number]): string => { const st = STATUS[c.status.key]; return `<button type="button" class="who" data-person="${esc(c.enrollmentId)}" style="color:${st.fg};background:${st.bg}">${esc(c.firstName)}</button>`; };
  const today = cards.map((c) => `<div class="ct-line" data-e="${esc(c.enrollmentId)}">${namePill(c)} ${topNextHtml(c.timeline)}</div>`).join('');
  const byDay = new Map<string, string[]>();
  for (const c of cards) {
    for (const r of c.timeline.rows) {
      const span = r.day !== r.dayEnd ? `<span class="span">${esc(fmtDay(r.day))}-${esc(fmtDay(r.dayEnd))}</span> ` : '';
      const chips = r.events.map((e) => chip(e.kind, e.label, e.detail, e.meta, e.slow, e.href)).join('');
      const accent = STRIP_COLOR[r.events[0]?.kind ?? 'update'];
      const line = `<div class="ct-line" data-e="${esc(c.enrollmentId)}" data-ev="${esc(`${c.enrollmentId}|${r.dayEnd}`)}" style="border-left-color:${accent}">${namePill(c)} ${span}${chips}</div>`;
      const list = byDay.get(r.dayEnd) ?? [];
      list.push(line);
      byDay.set(r.dayEnd, list);
    }
  }
  const days = [...byDay.keys()].sort().reverse().map((d) => `<div class="ct-day"><div class="ct-date"><b>${esc(fmtDay(d))}</b><span>${esc(dow(d))}</span></div><div class="ct-lines">${(byDay.get(d) ?? []).join('')}</div></div>`).join('');
  return `<div class="ct-day ct-today"><div class="ct-date"><span class="today">TODAY</span></div><div class="ct-lines"><div class="lbl">Up next / needs attention</div>${today}</div></div>${days || '<div class="muted">Nothing recorded in the window.</div>'}`;
}

function tourList(s: Sidecar): string {
  if (!s.highlights.length) return '<div class="muted">Nothing stood out in this report.</div>';
  return `<ol class="tour-list">${s.highlights.map((h) => `<li data-e="${esc(h.enrollment_id)}"><button type="button" class="tour-jump" data-step="${h.rank - 1}"><span class="tn">${h.rank}</span><span><b>${esc(h.title)}</b><span class="why">${esc(h.why)}</span></span></button></li>`).join('')}</ol>`;
}

const CSS = `
:root{--navy:${NAVY};--red:${RED};--muted:#64748b;--line:#e2e8f0;--bg:#f1f5f9}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Roboto,Segoe UI,Arial,sans-serif;color:#1e293b}
header{background:var(--navy);border-bottom:4px solid var(--red)}header > table{max-width:1240px;margin:0 auto}
.tour-btn{background:var(--red);color:#fff;border:none;border-radius:6px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer}
.layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:16px;max-width:1240px;margin:0 auto;padding:16px}
#side{position:sticky;top:12px;align-self:start;max-height:calc(100vh - 24px);overflow:auto;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px}
.search{width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;font-size:13px}
.person{display:flex;gap:8px;align-items:center;width:100%;text-align:left;border:1px solid transparent;background:none;border-radius:6px;padding:6px 8px;cursor:pointer;font:inherit;font-size:13px;color:inherit}
.person:hover{background:#f8fafc}.person.on{background:#eff6ff;border-color:#93c5fd}.person .dot{width:10px;height:10px;border-radius:50%;flex:none}
.person small{display:block;color:var(--muted);font-size:11px}
button:focus-visible{outline:2px solid #2563eb;outline-offset:1px}
.box{background:#fff;border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:0 0 14px}
.box h2{font-size:14px;font-weight:700;color:var(--navy);margin:0 0 8px}.muted{color:var(--muted);font-size:12px}
.filter{display:none;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:8px 12px;margin:0 0 14px;font-size:13px}.filter.on{display:block}
.filter button{margin-left:8px;border:1px solid #93c5fd;background:#fff;border-radius:5px;padding:2px 9px;cursor:pointer;font-size:12px}
.group-title{font-size:17px;font-weight:700;color:var(--navy);border-bottom:2px solid var(--red);padding-bottom:4px;margin:18px 0 10px}
.tour-list{list-style:none;margin:0;padding:0;columns:2;column-gap:18px}.tour-list li{break-inside:avoid;margin:0 0 6px}
.tour-jump{display:flex;gap:8px;text-align:left;width:100%;border:1px solid var(--line);border-left:4px solid var(--red);background:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;font:inherit;font-size:13px}
.tour-jump:hover{background:#fff7f7}.tn{background:var(--red);color:#fff;border-radius:50%;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.why{display:block;color:#475569;font-size:12px}
.ct-day{display:grid;grid-template-columns:70px minmax(0,1fr);gap:10px;padding:6px 0;border-top:1px solid #f1f5f9}
.ct-date{text-align:right;font-size:12px;color:var(--navy)}.ct-date span{display:block;font-size:10px;color:#94a3b8}
.ct-date .today{display:inline-block;background:var(--navy);color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px}
.ct-lines .lbl{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:3px}
.ct-line{border-left:3px solid #cbd5e1;padding:2px 0 2px 8px;margin:2px 0}.ct-today .ct-line{border-left-color:var(--navy)}
.who{border:none;border-radius:10px;font-size:11px;font-weight:700;padding:2px 8px;margin-right:4px;cursor:pointer}
.span{font-size:11px;color:var(--muted)}
.glance tr[data-e]{cursor:pointer}.glance tr[data-e]:hover{background:#f8fafc}
/* Prompts: a few lines, scroll for the rest (Ali: "only show a little bit ... and let the user scroll"). */
[id^="asks-"] pre{max-height:8.2em;overflow:auto}
.cp{float:right;margin:0 0 4px 8px;border:1px solid #c7d2fe;background:#fff;color:#4338ca;border-radius:5px;padding:1px 8px;font-size:11px;font-weight:700;cursor:pointer}
.tour-hl{outline:4px solid #f59e0b !important;outline-offset:4px;border-radius:6px;box-shadow:0 0 0 9999px rgba(15,23,42,.35);position:relative;z-index:5;background-clip:padding-box}
#tour{display:none;position:fixed;right:20px;bottom:20px;width:380px;max-width:calc(100vw - 40px);background:#fff;border:1px solid var(--line);border-top:4px solid var(--red);border-radius:8px;box-shadow:0 12px 32px rgba(15,23,42,.3);padding:14px 16px;z-index:10}
#tour.on{display:block}#tour .step{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-weight:700}
#tour .t{font-size:15px;font-weight:700;color:var(--navy);margin:4px 0}#tour .w{font-size:13px;color:#334155}#tour .who2{font-size:12px;color:var(--muted);margin-top:4px}
#tour .nav{display:flex;gap:8px;margin-top:12px}#tour .nav button{flex:1;border:1px solid var(--line);background:#fff;border-radius:6px;padding:7px;cursor:pointer;font-weight:700}
#tour .nav .next{background:var(--navy);color:#fff;border-color:var(--navy)}
[hidden]{display:none !important}
@media (max-width:860px){.layout{grid-template-columns:1fr}#side{position:static;max-height:none}.tour-list{columns:1}}
`;

export function renderDashboard(report: PortfolioReport, s: Sidecar): string {
  const t = report.totals;
  const k = (report.counts || {}) as Record<string, number | undefined>;
  const cards = report.groups.flatMap((g) => g.interns);
  const tiles = `<table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${kpi('Interns', t.interns, NAVY)}${kpi('On track', t.onTrack, '#16a34a')}${kpi('Need attention', t.attention, '#ea580c')}${kpi('Stalled', t.stalled, RED)}${kpi('Weeks 1-3 cleared', k.weeks_1_3_clear ?? '-', '#16a34a')}${kpi('No project', k.no_project ?? '-', '#ea580c')}${kpi('Replies you owe', t.repliesOwed, '#0e7490')}</tr></table>`;
  const moves = cards.flatMap((c) => c.aliMoves.map((m) => `<li data-e="${esc(c.enrollmentId)}">${esc(m)}</li>`)).join('');
  const glance = `<table class="glance" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse"><tr style="color:#64748b;text-transform:uppercase;font-size:10px;letter-spacing:1px"><td style="padding:4px 8px">Intern</td><td style="padding:4px 8px">Status</td><td style="padding:4px 8px">Timeline</td><td style="padding:4px 8px">Most urgent</td></tr>${cards.map((c) => glanceRow(c, true)).join('')}</table>`;
  const groups = report.groups.map((g) => `<div class="group" data-group="${esc(g.key)}"><div class="group-title">${esc(g.title)} (<span class="gn">${g.interns.length}</span>)</div>${g.interns.map((c) => `<div class="intern" id="card-${esc(c.enrollmentId)}" data-e="${esc(c.enrollmentId)}">${internCard(c, { anchors: true })}</div>`).join('')}</div>`).join('');
  const people = cards.map((c) => { const st = STATUS[c.status.key]; return `<button type="button" class="person" data-person="${esc(c.enrollmentId)}" data-name="${esc(c.name.toLowerCase())}"><span class="dot" style="background:${st.fg}"></span><span>${esc(c.name)}<small>${esc(c.status.label)} &middot; day ${esc(c.day ?? '?')}</small></span></button>`; }).join('');
  const tourData = { highlights: s.highlights };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Internship Report ${esc(s.report_date)}</title><style>${CSS}</style></head><body>
<header>${brandHeader('Internship Report', `${s.report_date} · ${t.interns} interns · last ${s.window_days} days · click any person to filter everything`,
    `<button type="button" class="tour-btn" id="tour-start"${s.highlights.length ? '' : ' disabled'}>&#9654; Take the guided tour (${s.highlights.length})</button>`)}</header>
<div class="layout">
<aside id="side" aria-label="Interns"><input class="search" type="search" placeholder="Find a person" aria-label="Find a person">
<button type="button" class="person on" data-person=""><span>All interns (${cards.length})<small>the whole cohort</small></span></button>${people}</aside>
<main id="main">
<div class="filter" id="filter">Showing only <b id="filter-name"></b><button type="button" id="filter-clear">Show everyone</button></div>
<div data-overall>${tiles}</div>
${box(`This report's ${s.highlights.length} most impactful things`, `<div class="muted" style="margin-bottom:8px">Take the tour, or jump straight to one.</div>${tourList(s)}`, 'highlights')}
${box('How to read the timelines', legendHtml())}
<section class="box" style="border-top:3px solid ${RED}"><h2>Your move</h2>${moves ? `<ul style="margin:4px 0 0 18px;padding:0;font-size:13px;line-height:1.5">${moves}</ul>` : '<div class="muted">Nothing.</div>'}</section>
${box(`Everyone, last ${s.window_days} days`, glance)}
${box('Everyone on one timeline', combinedTimeline(report), 'combined')}
${groups}
<div class="muted" style="padding:10px 4px 24px">Same data and formatting as the report email; the JSON beside it has every field. Generated by backend/src/scripts/internshipPortfolioReport.ts.</div>
</main></div>
<div id="tour" role="dialog" aria-live="polite" aria-label="Guided tour"><div class="step" id="tour-step"></div><div class="t" id="tour-title"></div><div class="w" id="tour-why"></div><div class="who2" id="tour-who"></div>
<div class="nav"><button type="button" id="tour-prev">Back</button><button type="button" class="next" id="tour-next">Next</button><button type="button" id="tour-end">End</button></div></div>
<script type="application/json" id="report-data">${safeJson(tourData)}</script>
<script>(${dashboardApp.toString()})(JSON.parse(document.getElementById('report-data').textContent), document, window);</script>
</body></html>`;
}
