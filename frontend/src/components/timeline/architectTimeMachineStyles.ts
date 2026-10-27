/** The Architect Time Machine stylesheet (--am-* vars), injected by ArchitectTimeMachine.tsx. */
export const AM_CSS = `
.am{--am-berry:#367895;--am-berry-deep:#2E6A86;--am-cherry:#FB2832;--am-cherry-deep:#c81e26;--am-leaf:#5BA63C;--am-amber:#E8920C;
  --am-ink:#e7eef1;--am-sub:#9fbcc7;--am-stage1:#0e1a20;--am-stage2:#12303c;
  --am-page:#fff;--am-strong:#1A1A1A;--am-body:#2B2B2B;--am-muted:#6B6B6B;--am-line:#E4E4E3;--am-sunken:#F1F1F0;
  --am-sans:'Roboto','Segoe UI',system-ui,sans-serif;--am-mono:'Roboto Mono',ui-monospace,monospace;--am-ease:cubic-bezier(.22,1,.36,1);
  font-family:var(--am-sans);color:var(--am-body)}
@media (prefers-color-scheme:dark){.am{--am-page:#15242c;--am-strong:#f3f6f7;--am-body:#d7e0e3;--am-muted:#93a3a9;--am-line:#26424e;--am-sunken:#0f1d24}}
:root[data-theme="dark"] .am,.tl-de[data-theme="dark"] .am,.rt[data-theme="dark"] .am{--am-page:#15242c;--am-strong:#f3f6f7;--am-body:#d7e0e3;--am-muted:#93a3a9;--am-line:#26424e;--am-sunken:#0f1d24}
:root[data-theme="light"] .am,.tl-de[data-theme="light"] .am,.rt[data-theme="light"] .am{--am-page:#fff;--am-strong:#1A1A1A;--am-body:#2B2B2B;--am-muted:#6B6B6B;--am-line:#E4E4E3;--am-sunken:#F1F1F0}
.am *{box-sizing:border-box}
.am-empty{padding:40px 20px;text-align:center;color:var(--am-muted);font-size:14px}
/* DRAWER */
.am-drawer{display:flex;flex-direction:column;height:100%}
.am-hero{position:relative;height:150px;border-radius:14px;overflow:hidden;margin:0 0 2px}.am-hero svg{width:100%;height:100%;display:block}
.am-d-cap{padding:12px 4px 4px}.am-series{font:700 11px var(--am-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--am-berry)}
.am-d-title{font-size:19px;font-weight:800;color:var(--am-strong);line-height:1.2;margin-top:3px}
.am-d-body{padding:8px 4px;flex:1;overflow-y:auto}
.am-principle{background:var(--am-sunken);border:1px solid var(--am-line);border-left:3px solid var(--am-berry);border-radius:10px;padding:11px 13px;font-size:13.5px}.am-principle b{color:var(--am-strong)}
.am-brief{background:var(--am-page);border:1px solid var(--am-line);border-left:3px solid var(--am-amber);border-radius:10px;padding:11px 13px;font-size:13.5px;margin-top:9px;font-style:italic;color:var(--am-body)}.am-brief b{color:var(--am-strong);font-style:normal}
.am-sec{font:700 11px var(--am-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--am-berry);margin:16px 0 8px}
.am-flow{margin:0;padding-left:20px}.am-flow li{font-size:13px;margin:5px 0;color:var(--am-body)}
.am-note{font-size:12px;color:var(--am-muted);margin:10px 0 0;line-height:1.5}
.am-cta{margin:12px 4px 4px;border:0;border-radius:999px;background:var(--am-cherry);color:#fff;font:700 15px var(--am-sans);padding:13px;cursor:pointer;width:calc(100% - 8px)}
.am-cta:hover{background:var(--am-cherry-deep)}.am-cta:focus-visible{outline:3px solid var(--am-berry);outline-offset:2px}
.am-done-pill{margin:12px 4px;text-align:center;color:var(--am-leaf);font-weight:700;font-size:14px}
.am-commit{margin:12px 0;font-size:14px;font-style:italic;color:var(--am-body);border-left:3px solid var(--am-leaf);padding-left:11px}.am-commit span{display:block;font-style:normal;color:var(--am-muted);font-size:11.5px;margin-top:3px}
/* WORKSPACE */
.am-ws{display:flex;flex-direction:column;min-height:100%}
.am-nav{display:flex;gap:6px;overflow-x:auto;padding:10px 6px;flex-wrap:wrap}
.am-step{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--am-line);background:var(--am-page);color:var(--am-body);border-radius:999px;padding:6px 11px;font:600 12px var(--am-sans);cursor:pointer;white-space:nowrap}
.am-step:disabled{opacity:.5;cursor:not-allowed}.am-step.on{background:var(--am-sunken);border-color:var(--am-berry);color:var(--am-strong)}
.am-step:focus-visible{outline:3px solid var(--am-berry);outline-offset:1px}
.am-ic{width:20px;height:20px;border-radius:99px;background:var(--am-sunken);color:var(--am-muted);font:700 10.5px var(--am-mono);display:grid;place-items:center}
.am-step.on .am-ic{background:var(--am-cherry);color:#fff}.am-step.done .am-ic{background:var(--am-leaf);color:#fff}
@media (max-width:560px){.am-step-l{display:none}}
.am-stage{flex:1;border-radius:16px;position:relative;overflow:hidden;color:var(--am-ink);display:flex;flex-direction:column;min-height:520px;
  background:radial-gradient(900px 480px at 22% 0%,#1c4658,transparent 60%),linear-gradient(160deg,var(--am-stage1),var(--am-stage2) 62%,#0a1a22)}
.am-ws[data-reveal="true"] .am-stage{background:radial-gradient(800px 460px at 60% -5%,#5a2f10,transparent 60%),linear-gradient(160deg,#1a0f0a,#3a1d10 70%,#12060a)}
.am-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.am-tunnel{position:absolute;left:-6%;top:50%;width:460px;height:460px;transform:translateY(-50%);border-radius:50%;
  background:repeating-radial-gradient(circle at center,transparent 0 26px,rgba(95,176,204,.10) 26px 28px);opacity:.6}
.am-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(95,176,204,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(95,176,204,.07) 1px,transparent 1px);background-size:42px 42px;animation:am-drift 30s linear infinite}
@keyframes am-drift{from{background-position:0 0}to{background-position:42px 42px}}
.am-drift{animation:am-pulse 6s var(--am-ease) infinite alternate}@keyframes am-pulse{from{opacity:.85}to{opacity:1}}
.am-stage-body{position:relative;z-index:2;padding:22px 26px;overflow-y:auto;flex:1}
.am-foot{position:relative;z-index:3;border-top:1px solid #ffffff1a;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;background:#0000001f}
.am-foot-l{font:600 12px var(--am-mono);color:var(--am-sub)}.am-foot-btns{display:flex;gap:10px}
.am-dial{display:inline-flex;font:700 10.5px var(--am-mono);letter-spacing:.08em;margin-bottom:14px}
.am-dial span{padding:5px 11px;border:1px solid #ffffff2e;color:var(--am-sub)}.am-dial span:first-child{border-radius:99px 0 0 99px}.am-dial span:last-child{border-radius:0 99px 99px 0}
.am-dial span.on{background:#8fc7db;color:#0e1a20;border-color:#8fc7db}.am-ws[data-reveal="true"] .am-dial span.on{background:var(--am-amber);color:#1a0f0a;border-color:var(--am-amber)}
.am-kicker{font:700 11px var(--am-mono);letter-spacing:.14em;text-transform:uppercase;color:#8fc7db;margin:0}
.am-ws[data-reveal="true"] .am-kicker{color:#ffce8a}
.am-h{font-size:24px;font-weight:800;color:#fff;margin:6px 0 6px;line-height:1.2;max-width:24ch}
.am-lead{font-size:15px;color:#cfe0e6;max-width:62ch}.am-lead b{color:#fff}
.am-hint{font-size:12px;color:#9fbcc7;margin-top:10px}
.am-memo{background:#0000002e;border:1px solid #ffffff26;border-radius:14px;padding:16px 18px;max-width:60ch;margin:16px 0}
.am-from{font:600 11px var(--am-mono);color:#8fc7db;letter-spacing:.06em;text-transform:uppercase}.am-memo p{font-size:16px;color:#eef6f9;margin:8px 0 0;line-height:1.5}
.am-opts{display:flex;flex-direction:column;gap:9px;max-width:62ch;margin:14px 0}
.am-opt{display:flex;gap:12px;align-items:flex-start;text-align:left;border:1px solid #ffffff2b;background:#ffffff0f;color:#eaf3f6;border-radius:12px;padding:12px 14px;font:500 14px var(--am-sans);cursor:pointer;transition:.15s var(--am-ease)}
.am-opt:hover{background:#ffffff1c;border-color:#8fc7db}.am-opt:focus-visible{outline:3px solid #8fc7db;outline-offset:2px}
.am-opt.on{background:#8fc7db26;border-color:#8fc7db;box-shadow:inset 0 0 0 1px #8fc7db}.am-opt.custom{border-style:dashed}.am-opt.invalid{border-color:#ff7a80;box-shadow:0 0 0 1px #ff7a80}
/* Single-select affordance. These groups are role="radiogroup" and only ever accept
   ONE answer, so the control must READ as a radio: a circle with a filled dot, never
   a square with a tick. A square+check promises multi-select the group cannot honour
   (Ram, 2026-08-10) — and it appeared on every question, since one component renders
   them all. If a genuine multi-select question is ever authored (mode: 'multiple'),
   give it a square + check then, not before. */
.am-box{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid #8fc7db;margin-top:1px;display:grid;place-items:center;background:transparent}
.am-box>i{width:9px;height:9px;border-radius:50%;background:#8fc7db;transform:scale(0);transition:transform .13s var(--am-ease)}
.am-opt.on .am-box>i{transform:scale(1)}
@media(prefers-reduced-motion:reduce){.am-box>i{transition:none}}
.am-free{width:100%;max-width:62ch;background:#0b1519;border:1px solid #ffffff2e;border-radius:10px;color:#eef6f9;font:14px var(--am-sans);padding:11px 13px;min-height:70px;resize:vertical;margin-top:6px}
.am-free:focus-visible{outline:3px solid #8fc7db;outline-offset:1px}
.am-flab{display:block;font:600 12px var(--am-mono);letter-spacing:.03em;color:#9fbcc7;margin:14px 0 4px;text-transform:uppercase}
.am-reqbanner{display:flex;align-items:center;gap:10px;background:#3a1416;border:1px solid #7a2a2e;color:#ffb9bd;border-radius:10px;padding:10px 13px;font-size:13px;margin:12px 0;max-width:62ch}.am-i{font-weight:800}
.am-layers{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:70ch;margin:14px 0}
.am-layer{background:#ffffff10;border:1px solid #ffffff24;border-radius:12px;padding:12px 14px}.am-layer h5{margin:0 0 8px;font:700 11px var(--am-mono);letter-spacing:.08em;text-transform:uppercase;color:#8fc7db}
.am-tags{display:flex;flex-wrap:wrap;gap:6px}.am-tag{font-size:11.5px;background:#0e1a2099;border:1px solid #ffffff26;border-radius:99px;padding:3px 9px;color:#d6e6ec}
.am-reveal{margin:12px 0;max-width:62ch;border-left:3px solid var(--am-cherry);background:#ffffff0d;border-radius:0 10px 10px 0;padding:12px 15px;font-size:15px;color:#fff;font-weight:600}
.am-reveal.amber{border-left-color:var(--am-amber)}.am-reveal.cherry{border-left-color:var(--am-cherry)}
.am-interviewer{display:flex;gap:12px;align-items:flex-start;max-width:64ch;margin:14px 0 4px}
.am-orb{flex:none;width:42px;height:42px;border-radius:99px;background:radial-gradient(circle at 35% 30%,#bfe4f2,#367895 70%);box-shadow:0 0 22px #367895aa}
.am-bubble{background:#ffffff12;border:1px solid #ffffff24;border-radius:4px 14px 14px 14px;padding:12px 15px;font-size:15px;color:#eef6f9}
.am-who{display:block;font:600 10.5px var(--am-mono);color:#8fc7db;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
.am-q{padding:8px 0;border-bottom:1px solid #ffffff14}.am-q.q-invalid .am-bubble{border-color:#ff7a80}
.am-chartcard{background:#ffffff0d;border:1px solid #ffffff20;border-radius:14px;padding:16px;margin:12px 0;max-width:64ch}
.am-chartcard h5{margin:0 0 3px;font-size:14px;color:#fff}.am-cap{font-size:12px;color:#9fbcc7;margin-bottom:8px}
.am-receipt{background:#ffffff0d;border:1px dashed #8fc7db;border-radius:14px;padding:16px 18px;max-width:64ch;margin:12px 0}
.am-receipt.compact{background:var(--am-sunken);border-color:var(--am-berry)}
.am-rg{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px;margin:2px 0 10px}.am-rg div{font-size:11.5px;color:#9fbcc7}.am-rg b{display:block;font:700 18px var(--am-mono);color:#fff}
.am-receipt.compact .am-rg div{color:var(--am-muted)}.am-receipt.compact .am-rg b{color:var(--am-strong)}
.am-rhours{font-size:13px;color:#cfe0e6;margin:6px 0}.am-receipt.compact .am-rhours{color:var(--am-body)}.am-rhours b{color:#fff}.am-receipt.compact .am-rhours b{color:var(--am-strong)}.am-ratio{color:#8fc7db;font-family:var(--am-mono)}
.am-qual{font-size:11.5px;line-height:1.55;color:#cfe0e6;background:#0e1a2099;border:1px solid #ffffff20;border-radius:9px;padding:10px 12px;margin-top:8px}.am-qual strong{color:#ffce8a}
.am-receipt.compact .am-qual{color:var(--am-muted);background:var(--am-page)}.am-receipt.compact .am-qual strong{color:var(--am-amber)}
.am-gates{columns:2;column-gap:24px;max-width:66ch;margin:12px 0}.am-gate{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#dce9ee;break-inside:avoid;margin-bottom:7px}
.am-c{flex:none;width:18px;height:18px;border-radius:99px;background:var(--am-leaf);color:#fff;font-size:11px;display:grid;place-items:center}
.am-baseline{background:#ffffff0d;border:1px solid #ffffff20;border-radius:12px;padding:13px 15px;margin:12px 0;max-width:64ch}.am-baseline b{color:#fff;font-size:13.5px}.am-baseline p{margin:5px 0 0;font-size:14px;color:#cfe0e6}
.am-dash{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.am-metric{background:#0e1a2099;border:1px solid #ffffff20;border-radius:10px;padding:11px 12px;text-align:center}
.am-metric b{display:block;font:700 20px var(--am-mono);color:#8fc7db}.am-metric.down b{color:#ff8a90}.am-metric.up b{color:#8fd28a}.am-metric span{display:block;font-size:11px;color:#9fbcc7;margin-top:3px;line-height:1.3}
@media (max-width:560px){.am-dash{grid-template-columns:1fr 1fr}}
.am-scorecard{background:#ffffff0d;border:1px dashed #8fc7db;border-radius:14px;padding:16px 18px;max-width:64ch;margin:12px 0}
.am-scorehead{display:flex;align-items:baseline;gap:14px}.am-scoretotal b{font:800 40px var(--am-mono);color:#fff}.am-scoretotal span{font:600 14px var(--am-mono);color:#9fbcc7}
.am-scorestage{font:800 16px var(--am-sans);color:#8fc7db;padding:4px 12px;border:1px solid #8fc7db55;border-radius:999px}
.am-dims{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.am-dim{border-top:1px solid #ffffff14;padding-top:9px}.am-dim:first-child{border-top:0;padding-top:0}
.am-dimhead{display:flex;justify-content:space-between;font-size:13px;color:#eef6f9;font-weight:600}.am-dimval{font-family:var(--am-mono);color:#8fc7db}.am-dimval em{color:#9fbcc7;font-style:normal;font-size:11px}
.am-dimbar{height:7px;border-radius:99px;background:#0e1a2099;overflow:hidden;margin:5px 0}.am-dimbar i{display:block;height:100%;background:linear-gradient(90deg,var(--am-berry),#8fc7db);border-radius:99px}
.am-dimnote{font-size:11.5px;color:#9fbcc7;line-height:1.5}.am-dimnote b{color:#cfe0e6;font-weight:700}
.am-ledger{max-width:64ch;margin:12px 0}.am-sec.light{color:#8fc7db}
.am-lrow{display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid #ffffff14;color:#cfe0e6}.am-lrow b{font-family:var(--am-mono);color:#fff}
.am-btn{border:0;border-radius:999px;font:700 14px var(--am-sans);padding:11px 20px;cursor:pointer}
.am-btn.pri{background:#8fc7db;color:#0e1a20}.am-btn.pri:hover{background:#a8d6e6}.am-btn.pri:disabled{opacity:.55;cursor:not-allowed}
.am-btn.ghost{background:transparent;color:#cfe0e6;border:1px solid #ffffff33}.am-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
@media (max-width:560px){.am-layers,.am-gates{grid-template-columns:1fr;columns:1}.am-stage-body{padding:16px 15px}.am-h{font-size:21px}}
@media (prefers-reduced-motion:reduce){.am-grid,.am-drift{animation:none}}
`;
