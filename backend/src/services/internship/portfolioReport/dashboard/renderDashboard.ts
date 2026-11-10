/**
 * renderDashboard - PURE. The JSON sidecar -> one self-contained interactive HTML page: click a
 * person (or a triage tier) to filter, the 10 most insightful communications, and every suggested
 * prompt in full with copy buttons. Attached to the report email beside the JSON, so it exists for
 * every report, and it renders ONLY from the sidecar, so it cannot disagree with the JSON.
 *
 * No external files, fonts or scripts. The data sits in a <script type="application/json"> block
 * with "<" escaped, so no subject line or email body can close the tag and run as code; the client
 * (dashboardApp.ts) reads it with JSON.parse and writes everything with textContent.
 */
import type { Sidecar } from '../sidecar/types';
import { dashboardApp } from './dashboardApp';

const CSS = `
:root{--navy:#1a365d;--red:#C20E1E;--muted:#64748b;--line:#e2e8f0;--bg:#f1f5f9;--ok:#15803d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Roboto,Segoe UI,Arial,sans-serif;color:#1e293b;font-size:14px;line-height:1.5}
header{background:var(--navy);color:#fff;padding:16px 22px}header .k{font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.8}header h1{margin:2px 0;font-size:22px}
.layout{display:grid;grid-template-columns:260px 1fr;gap:16px;max-width:1320px;margin:0 auto;padding:16px}
#side{position:sticky;top:12px;align-self:start;max-height:calc(100vh - 24px);overflow:auto}
.side{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:4px}
.search{width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;font-size:13px}
.person{display:grid;grid-template-columns:12px 1fr;column-gap:8px;text-align:left;border:1px solid transparent;background:none;border-radius:6px;padding:6px 8px;cursor:pointer;font:inherit;color:inherit}
.person:hover{background:#f8fafc}.person.on{background:#eff6ff;border-color:#93c5fd}.person:focus-visible,.bar-row:focus-visible,button:focus-visible{outline:2px solid #2563eb;outline-offset:1px}
.person .dot{width:10px;height:10px;border-radius:50%;margin-top:5px;grid-row:span 2}.pname{font-weight:700;grid-column:2}.pmeta{font-size:11px;color:var(--muted);grid-column:2}
.person:first-of-type{grid-template-columns:1fr}
main{min-width:0}.box{background:#fff;border:1px solid var(--line);border-radius:8px;padding:16px 18px;margin:0 0 14px}
h2{margin:0 0 6px;font-size:17px;color:var(--navy)}h3{margin:14px 0 6px;font-size:13px;color:var(--navy);text-transform:uppercase;letter-spacing:.5px}
.muted{color:var(--muted)}.small{font-size:12px}
.filter{background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:8px 12px;margin-bottom:14px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:14px}
.tile{background:#fff;border:1px solid var(--line);border-top:3px solid var(--navy);border-radius:6px;padding:10px 12px}.tv{font-size:22px;font-weight:700;color:var(--navy)}.tl{font-size:11px;color:var(--muted)}
.bar-row{display:flex;align-items:center;gap:10px;width:100%;margin:4px 0;padding:3px 4px;border:1px solid transparent;border-radius:6px;background:none;cursor:pointer;font:inherit}
.bar-row:hover:not([disabled]){background:#f8fafc}.bar-row.on{border-color:#93c5fd;background:#eff6ff}.bar-row[disabled]{cursor:default;opacity:.55}
.bar-label{width:130px;font-size:12px;text-align:left}.bar-track{flex:1;background:#eef2f7;border-radius:4px;height:14px}.bar{display:block;height:14px;border-radius:4px}.bar-n{width:24px;font-weight:700;text-align:right}
.pill{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;margin:1px 4px 1px 0}
.comms{list-style:none;padding:0;margin:8px 0 0}.comm{border:1px solid var(--line);border-left:4px solid #6d28d9;border-radius:6px;padding:10px 12px;margin:8px 0}
.comm-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.score{background:#6d28d9;color:#fff;border-radius:10px;padding:1px 8px;font-weight:700;font-size:12px}
.dir{font-weight:700;font-size:13px}.dir.out{color:#0e7490}.subj{font-weight:700;margin:4px 0 2px}.excerpt{font-size:13px;color:#334155;white-space:pre-wrap}
.sig{display:inline-block;font-size:11px;background:#f1f5f9;border-radius:10px;padding:1px 8px;margin:4px 4px 0 0;color:#475569}
.link{background:none;border:none;color:#1d4ed8;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
.card{border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:10px 0}.card-head{display:flex;justify-content:space-between;gap:10px}
.cname{font-size:17px;font-weight:700;color:var(--navy)}.cname .link{color:var(--navy)}.reason{font-size:12px;margin-top:4px}
.narr{background:#f8fafc;border-left:4px solid var(--navy);border-radius:4px;padding:8px 12px;margin:8px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px}.kpi{border:1px solid var(--line);border-radius:6px;padding:6px 8px}
.kv{font-weight:700;color:var(--navy)}.kv.warn{color:#b91c1c}.kl{font-size:11px;color:var(--muted)}
.ask{border:1px solid #c7d2fe;border-left:4px solid #4338ca;border-radius:6px;padding:10px 12px;margin:8px 0;background:#fafaff}
.ask-head{display:flex;gap:8px;align-items:center}.ask-n{background:#4338ca;color:#fff;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.lbl{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:8px 0 3px;display:flex;align-items:center;gap:8px}
.nudge{background:#fff;border-left:3px solid #4338ca;padding:6px 10px;font-size:13px}
.prompt,.json{white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.45;background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px;margin:0;overflow:auto}
.json{max-height:640px;margin-top:10px}
.copy{border:1px solid #c7d2fe;background:#fff;color:#4338ca;border-radius:5px;padding:2px 9px;font-size:11px;font-weight:700;cursor:pointer;text-transform:none;letter-spacing:0}
.urgent{margin:0;padding-left:18px;font-size:13px}.oq{font-size:13px;margin:4px 0}
.art{display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:12px;font-size:12px;background:#eef2ff;color:#312e81;border:1px solid #c7d2fe;text-decoration:none}
.art.wrong{background:#fffbeb;border:1px dashed #b45309;color:#78350f}.art.scratch{opacity:.55;text-decoration:line-through}
details summary{cursor:pointer;font-size:12px;color:#1d4ed8}
@media (max-width:820px){.layout{grid-template-columns:1fr}#side{position:static;max-height:none}}
`;

/** JSON safe inside a <script> element: "<" never appears raw, so "</script>" cannot occur. */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
export const safeJson = (v: unknown): string => JSON.stringify(v).split('<').join('\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');

export function renderDashboard(s: Sidecar): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Internship Report ${s.report_date}</title><style>${CSS}</style></head><body>
<header><div class="k">Colaberry AI Internship</div><h1>Internship Report, ${s.report_date}</h1>
<div class="small">${s.interns.length} interns &middot; last ${s.window_days} days &middot; click a person or a tier to filter</div></header>
<div class="layout"><aside id="side"></aside><main id="main"><noscript>This page needs JavaScript to filter. The same data is in the attached JSON.</noscript></main></div>
<script type="application/json" id="report-data">${safeJson(s)}</script>
<script>(${dashboardApp.toString()})(JSON.parse(document.getElementById('report-data').textContent), document, window);</script>
</body></html>`;
}
