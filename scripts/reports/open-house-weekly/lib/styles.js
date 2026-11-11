/** C123: report CSS. baseline-ui palette: navy #1a365d, blue #2b6cb0, calm greys; status green/amber/red. */
'use strict';
module.exports = `
:root{--navy:#1a365d;--blue:#2b6cb0;--ink:#2d3748;--mute:#718096;--line:#e2e8f0;--bg:#f4f6fa;--card:#fff;
--good:#2f855a;--goodbg:#c6f6d5;--ok:#b7791f;--okbg:#fefcbf;--bad:#c53030;--badbg:#fed7d7;--low:#a0aec0;--lowbg:#edf2f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Segoe UI",Inter,system-ui,-apple-system,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px 48px}
header.hero{background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:#fff;padding:28px 0 22px;margin-bottom:22px}
header.hero h1{margin:0;font-size:28px;letter-spacing:-.3px}header.hero .sub{opacity:.9;margin-top:4px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.chip{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px 12px;font-size:12.5px}
.legendbar{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--mute);margin:0 0 14px}.legendbar i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:18px;break-inside:avoid}
h2{margin:0 0 4px;font-size:18px;color:var(--navy)}.lede{margin:0 0 14px;color:var(--mute)}
.muted{color:var(--mute)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.panel h3{margin:0 0 8px;font-size:14px;color:var(--ink)}
.chart{width:100%;height:auto;display:block}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:18px}
.kpi{background:var(--card);border:1px solid var(--line);border-top:5px solid var(--blue);border-radius:12px;padding:12px 14px}
.kpi.s-good{border-top-color:var(--good)}.kpi.s-ok{border-top-color:var(--ok)}.kpi.s-bad{border-top-color:var(--bad)}.kpi.s-low{border-top-color:var(--low)}
.ki{font-size:20px}.kl{font-size:12px;color:var(--mute);font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.kv{font-size:30px;font-weight:700;color:var(--navy);line-height:1.15}.ks{font-size:12px;color:var(--mute)}
.d{display:inline-block;margin-top:6px;font-size:11.5px;font-weight:700;border-radius:6px;padding:1px 7px}
.d.up{background:var(--goodbg);color:var(--good)}.d.down{background:var(--badbg);color:var(--bad)}.d.flat,.d.na{background:var(--lowbg);color:var(--mute)}
.finds{display:grid;grid-template-columns:1fr 1fr;gap:10px}.find{display:flex;gap:10px;padding:10px 12px;border-radius:10px;border-left:5px solid var(--blue);background:#f7fafc}
.find.bad{border-color:var(--bad);background:#fff5f5}.find.warn{border-color:var(--ok);background:#fffff0}.find.good{border-color:var(--good);background:#f0fff4}.find .fx{font-size:20px}
.tbl{width:100%;border-collapse:collapse;font-size:13px}.tbl th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px;color:var(--mute);border-bottom:2px solid var(--line);padding:6px 8px}
.tbl td{border-bottom:1px solid var(--line);padding:7px 8px}.tbl .num{text-align:right;font-variant-numeric:tabular-nums}.tbl.sm td{padding:5px 8px}
.cf{display:inline-block;min-width:58px;text-align:center;border-radius:6px;padding:2px 6px;font-weight:700}
.cf-good{background:var(--goodbg);color:var(--good)}.cf-ok{background:var(--okbg);color:var(--ok)}.cf-bad{background:var(--badbg);color:var(--bad)}.cf-low,.cf-none{background:var(--lowbg);color:var(--mute)}
.pill{display:inline-block;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:700;white-space:nowrap}
.p-good{background:var(--goodbg);color:var(--good)}.p-ok{background:var(--okbg);color:var(--ok)}.p-bad{background:var(--badbg);color:var(--bad)}.p-low{background:var(--lowbg);color:var(--mute)}
.forks{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.fork{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fbfcfe}
.fh{display:flex;align-items:center;gap:8px;margin-bottom:8px}.fi{font-size:20px}.fq{font-weight:600;flex:1;font-size:13px}
.split{display:flex;height:26px;border-radius:7px;overflow:hidden;margin-bottom:8px;background:var(--lowbg)}
.seg{display:flex;align-items:center;justify-content:center;color:#fff;font-size:11.5px;font-weight:700;min-width:3px}
.seg.g{background:var(--good)}.seg.b{background:var(--bad)}.seg.n{background:#63b3ed}.seg.e{color:var(--mute);font-weight:500}
.fork ul{list-style:none;margin:0;padding:0;font-size:12.5px}.fork li{display:flex;align-items:center;gap:6px;padding:2px 0}.fork li b{margin-left:auto}.fork li em{width:48px;text-align:right;color:var(--mute);font-style:normal}
.fork li i{width:9px;height:9px;border-radius:2px;display:inline-block}.fork li i.g{background:var(--good)}.fork li i.b{background:var(--bad)}.fork li i.n{background:#63b3ed}
.ft{font-size:11.5px;color:var(--mute);margin-top:6px}
.pgrid{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:12px}.pg{width:18px;height:22px}
.plegend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px}.lg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}.lg em{color:var(--mute);font-style:normal}
.mermaid{background:#fff;text-align:center;margin:0}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.shots figure{margin:0}.shots img{width:100%;max-height:560px;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:12px;box-shadow:0 2px 10px rgba(26,54,93,.08)}
.shots figcaption{font-size:12.5px;color:var(--mute);margin-top:6px}
.blind{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bs{border:1px dashed #cbd5e0;border-radius:10px;padding:10px 12px}.bs b{color:var(--navy)}
.stat{font-size:26px;font-weight:700;color:var(--navy)}.statl{font-size:12px;color:var(--mute)}
footer{color:var(--mute);font-size:12px;text-align:center;margin-top:10px}
code{background:#edf2f7;border-radius:4px;padding:1px 5px;font-size:12px}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2,.grid3,.finds,.forks,.blind{grid-template-columns:1fr}}
@media print{body{background:#fff}section{break-inside:avoid}}
`;
