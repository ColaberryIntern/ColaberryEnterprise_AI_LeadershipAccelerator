/**
 * opsKit — the AI Operations Center stylesheet (scoped `.oc`). A dark, minimal
 * Mission-Control aesthetic: calm panels, semantic status color, dense but
 * uncrowded. Not a dashboard — an operational control surface.
 */
export const opsCss = `
.oc{--bg:#0E1317;--panel:#161C22;--panel2:#1B232A;--line:#2A343C;--ink:#E4EAEF;--muted:#8A99A4;--muted2:#63727C;
  --teal:#4F9BC4;--teal2:#2E6A86;--berry:#5FB0D4;--cherry:#FB4A52;--cherry2:#C20E1E;--leaf:#6FCF56;--leaf2:#3C7A26;--amber:#E8A63C;
  --mono:'Roboto Mono',ui-monospace,Consolas,monospace;--sans:'Roboto',system-ui,'Segoe UI',sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);min-height:100%;font-size:14px}
.oc *{box-sizing:border-box}
.oc-wrap{max-width:1240px;margin:0 auto;padding:22px}
.oc-top{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.oc-kick{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal)}
.oc-h1{font-size:24px;font-weight:700;letter-spacing:-.02em;margin:2px 0 0}
.oc-searchbar{margin-left:auto;display:flex;gap:7px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:5px 5px 5px 12px;min-width:min(420px,60vw)}
.oc-searchbar input{flex:1;background:transparent;border:none;color:var(--ink);font-size:13px;outline:none}
.oc-searchbar input::placeholder{color:var(--muted2)}
.oc-btn{border:1px solid var(--line);background:var(--panel2);color:var(--ink);font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:8px;cursor:pointer;white-space:nowrap}
.oc-btn:hover{border-color:var(--teal);color:var(--teal)}.oc-btn.ghost{background:transparent}.oc-btn:disabled{opacity:.5;cursor:not-allowed}
.oc-btn.xs{font-size:11px;padding:5px 9px}.oc-btn.xs.ok{border-color:var(--leaf2);color:var(--leaf)}.oc-btn.xs.bad{border-color:var(--cherry2);color:var(--cherry)}
.oc-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;position:relative}
.oc-lab{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted2);margin-bottom:10px}
.oc-lab.section{margin:22px 0 12px;color:var(--muted)}
.oc-muted{color:var(--muted);font-size:13px}
.oc-err{background:rgba(251,74,82,.12);color:var(--cherry);padding:14px 16px;border-radius:10px;margin-top:20px}
.oc-grid{display:grid;grid-template-columns:1.7fr 1fr;gap:16px}
.oc-grid2{display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin-top:16px}
@media(max-width:920px){.oc-grid,.oc-grid2{grid-template-columns:1fr}}
.oc-morning{font-size:20px;font-weight:700;letter-spacing:-.01em;margin:0 0 6px;color:#fff}
.oc-yest{color:var(--muted);margin:0 0 16px;font-size:13.5px}
.oc-cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
@media(max-width:640px){.oc-cols3{grid-template-columns:1fr}}
.oc-sub{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2);margin-bottom:6px}
.oc-list{margin:0;padding-left:16px;font-size:13px;line-height:1.5}.oc-list li{margin:4px 0}
.oc-list.pri li{color:var(--ink)}.oc-list.risk li{color:#F1A9AD}.oc-list.win li{color:#A9E39A}
.oc-health{text-align:center}
.oc-bignum{font-family:var(--mono);font-size:52px;font-weight:800;line-height:1;margin-top:4px}.oc-bignum small{font-size:18px;color:var(--muted2)}
.oc-bignum.ok{color:var(--leaf)}.oc-bignum.warn{color:var(--amber)}.oc-bignum.bad{color:var(--cherry)}
.oc-band{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin:4px 0 14px}
.oc-band.ok{color:var(--leaf)}.oc-band.warn{color:var(--amber)}.oc-band.bad{color:var(--cherry)}
.oc-subs{text-align:left;display:flex;flex-direction:column;gap:7px}
.oc-subrow{display:grid;grid-template-columns:88px 1fr 26px;align-items:center;gap:9px;font-size:12px}
.oc-subl{color:var(--muted)}.oc-subv{font-family:var(--mono);text-align:right;color:var(--ink)}
.oc-track{height:6px;border-radius:999px;background:var(--panel2);overflow:hidden}.oc-track i{display:block;height:100%;border-radius:999px}
.oc-track i.ok{background:var(--leaf)}.oc-track i.warn{background:var(--amber)}.oc-track i.bad{background:var(--cherry)}
.oc-alerts{display:flex;flex-direction:column;gap:8px;margin-top:16px}
.oc-alert{display:flex;align-items:center;gap:11px;background:rgba(251,74,82,.1);border:1px solid rgba(251,74,82,.3);border-radius:11px;padding:11px 15px;font-size:13.5px}
.oc-alert b{color:#fff}.oc-alert span{color:#E7B6B9}
.oc-dotpulse{width:8px;height:8px;border-radius:50%;background:var(--cherry);flex:none;box-shadow:0 0 0 0 rgba(251,74,82,.5);animation:ocp 2s infinite}
@keyframes ocp{0%{box-shadow:0 0 0 0 rgba(251,74,82,.5)}70%{box-shadow:0 0 0 7px rgba(251,74,82,0)}100%{box-shadow:0 0 0 0 rgba(251,74,82,0)}}
.oc-directors{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.oc-dir{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.oc-dirh{font-size:13.5px;font-weight:700;color:#fff}
.oc-dirhead{font-family:var(--mono);font-size:11px;color:var(--muted);margin:3px 0 10px}
.oc-metrics{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px}
.oc-metrics b{font-family:var(--mono);font-size:16px;font-weight:700;display:block;line-height:1;color:var(--berry)}.oc-metrics span{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2)}
.oc-dirrec{font-size:12px;color:var(--ink);border-top:1px solid var(--line);padding-top:9px;line-height:1.4}
.oc-work{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--line)}.oc-work:first-of-type{border-top:none}
.oc-workt{font-size:13.5px;font-weight:600;color:#fff}.oc-workwhy{font-size:12px;color:var(--muted);margin-top:3px;line-height:1.45}
.oc-impact{font-family:var(--mono);font-size:10.5px;color:var(--teal);margin-top:4px}
.oc-workacts{display:flex;gap:5px;flex:none;flex-direction:column}
.oc-sev{font-family:var(--mono);font-size:9px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:999px}
.oc-sev.high{background:rgba(251,74,82,.16);color:var(--cherry)}.oc-sev.medium{background:rgba(232,166,60,.16);color:var(--amber)}.oc-sev.low{background:rgba(79,155,196,.16);color:var(--berry)}
.oc-twinrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
.oc-twinrow select{background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:7px;padding:6px 9px;font-family:var(--mono);font-size:12px}
.oc-twinres{margin-top:12px}.oc-verdict{font-size:13px;color:var(--ink);background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:10px 12px;line-height:1.5}
.oc-twinmetrics{display:flex;gap:18px;margin-top:10px}
.oc-twinmetrics b{font-family:var(--mono);font-size:18px;font-weight:700;display:block;line-height:1;color:var(--leaf)}.oc-twinmetrics b.bad{color:var(--cherry)}
.oc-twinmetrics span{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2)}
.oc-search{margin-top:16px;position:relative}.oc-chips{display:flex;gap:6px;flex-wrap:wrap}
.oc-chip{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:4px 10px;color:var(--ink)}
.oc-x{position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px}
`;
