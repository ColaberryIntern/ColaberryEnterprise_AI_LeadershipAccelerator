/**
 * kitDeckStyles.ts — the self-contained CSS for the Class Kit teaching deck.
 * Kept in its own module (exported as a string) so kitHtml.ts stays a thin
 * composer and each file stays readable.
 *
 * Design language mirrors the Open House deck (brand cherry, clean, executive),
 * with three additions the Open House deck does not have:
 *   • a fixed bottom "pace bar" (the live run-of-show tracker),
 *   • a fixed right "pulse rail" (live class participation),
 *   • a "compact" mode so the deck looks composed in a narrow window docked
 *     beside Claude Code (content lives in a centered max-width column and uses
 *     vw+vh-mixed clamp() sizing so it never sprawls horizontally).
 */
export const DECK_CSS = `
:root{
  --cherry:#FB2832; --cherry-deep:#E5121D; --cherry-dark:#C20E1E;
  --leaf:#3C7A26; --leaf-soft:#eaf6e3; --berry:#367895; --amber:#E8920C; --amber-soft:#fdf0dd;
  --ink:#1a202c; --ink-2:#2d3748; --muted:#64748b; --subtle:#94a3b8; --line:#e8e2de;
  --bg:#ffffff; --bg-soft:#faf7f5; --shadow:0 18px 50px rgba(26,32,44,.14);
  --pace-h:66px; --rail-w:266px;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);overflow:hidden}
.mono{font-family:"Cascadia Mono","Roboto Mono",Consolas,monospace}
button{font-family:inherit}

#kprogress{position:fixed;top:0;left:0;height:4px;background:var(--cherry);width:0;z-index:60;transition:width .3s ease}
#kcounter{position:fixed;bottom:calc(var(--pace-h) + 10px);right:16px;z-index:40;font-size:12px;color:var(--subtle);font-weight:700;letter-spacing:1px}
#khint{position:fixed;bottom:calc(var(--pace-h) + 10px);left:16px;z-index:40;font-size:11px;color:#b8b0aa}

/* ---------- slides ---------- */
.kstage{position:absolute;inset:0;bottom:var(--pace-h);right:0;overflow:hidden}
body.rail-on .kstage{right:var(--rail-w)}
.kslide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;
  padding:5vh 4vw;overflow:auto}
.kslide.active{display:flex;animation:kfade .3s ease}
@keyframes kfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.kinner{width:100%;max-width:1080px;margin:0 auto}
body.compact .kinner{max-width:760px}

.keyebrow{color:var(--cherry-deep);font-weight:800;letter-spacing:2.5px;text-transform:uppercase;
  font-size:clamp(11px,.7vw + .5vh,15px);margin-bottom:1.6vh}
.ktitle{font-size:clamp(26px,1.7vw + 1.7vh,54px);line-height:1.1;letter-spacing:-.5px;color:var(--ink);font-weight:800}
.ksub{color:var(--muted);font-size:clamp(15px,.6vw + .8vh,22px);line-height:1.5;margin-top:1.6vh;max-width:60ch}
.kbody{color:var(--ink-2);font-size:clamp(15px,.6vw + .85vh,23px);line-height:1.5;margin-top:2.2vh;max-width:60ch}

ul.kpoints{margin-top:2.4vh;list-style:none;max-width:64ch}
ul.kpoints li{position:relative;padding-left:28px;margin:1.3vh 0;font-size:clamp(14px,.55vw + .8vh,20px);line-height:1.42;color:var(--ink-2)}
ul.kpoints li::before{content:"";position:absolute;left:0;top:.55em;width:12px;height:12px;border-radius:4px;background:var(--cherry);opacity:.9}
ul.kpoints li b{color:var(--ink)}

/* cover */
.kslide.cover{justify-content:center}
.kcover-grid{display:grid;grid-template-columns:1fr auto;gap:3vw;align-items:center}
body.compact .kcover-grid, body.rail-on .kcover-grid{grid-template-columns:1fr}
.kcover-qr{background:#fff;border:1px solid var(--line);border-radius:18px;padding:14px;box-shadow:var(--shadow);width:min(30vh,240px);height:min(30vh,240px)}
.kcover-qr svg{width:100%;height:100%;display:block}
.kcover-qr-label{margin-top:10px;text-align:center;font-size:12px;font-weight:700;color:var(--berry)}
.kmeta-row{display:flex;gap:1.2vw;flex-wrap:wrap;margin-top:3vh}
.kchip{border:1.5px solid var(--line);border-left:5px solid var(--cherry);border-radius:12px;padding:1.4vh 1.2vw;background:var(--bg-soft)}
.kchip b{display:block;font-size:clamp(16px,.7vw + .9vh,26px);letter-spacing:-.3px}
.kchip span{display:block;color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:1.2px;margin-top:3px}

/* rules */
.krules li::before{background:var(--berry)}

/* architecture / buildmap card grid */
.karch{margin-top:2.6vh;display:grid;gap:1.4vh}
.karch-item{display:flex;gap:14px;align-items:flex-start;padding:1.4vh 1.4vw;border:1.5px solid var(--line);border-radius:14px;background:var(--bg-soft)}
.karch-item .kn{flex:none;width:30px;height:30px;border-radius:8px;background:var(--berry);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:15px}
.karch-item p{font-size:clamp(14px,.5vw + .75vh,19px);line-height:1.4;color:var(--ink-2)}

/* prompt (terminal) */
.kprompt{margin-top:2.6vh;border-radius:14px;overflow:hidden;border:1px solid #26313f;box-shadow:var(--shadow);max-width:70ch}
.kprompt-bar{background:#1b2430;color:#9fb4c9;font-size:12px;padding:9px 14px;display:flex;align-items:center;justify-content:space-between;font-weight:700;letter-spacing:.5px}
.kprompt-bar .dots{display:flex;gap:6px}
.kprompt-bar .dots i{width:11px;height:11px;border-radius:50%;display:block;background:#3a4656}
.kcopy{background:var(--cherry);color:#fff;border:none;border-radius:7px;padding:6px 14px;font-weight:700;font-size:12.5px;cursor:pointer;letter-spacing:.4px}
.kcopy:hover{background:var(--cherry-deep)}
.kprompt pre{background:#0f1720;color:#e7eef6;padding:18px;font-family:"Cascadia Mono",Consolas,monospace;font-size:clamp(13px,.45vw + .55vh,17px);line-height:1.55;white-space:pre-wrap;word-break:break-word}

/* checkpoint */
.kcp{display:flex;gap:20px;align-items:center;margin-top:2.6vh}
.kcp-badge{flex:none;width:clamp(64px,7vh,96px);height:clamp(64px,7vh,96px);border-radius:20px;background:linear-gradient(150deg,var(--cherry),var(--cherry-dark));color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:var(--shadow)}
.kcp-badge span{font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:.85}
.kcp-badge b{font-size:clamp(26px,3.4vh,40px);line-height:1}

/* interaction */
.kopts{margin-top:2.8vh;display:grid;gap:1.2vh;max-width:64ch}
.kopt{display:flex;gap:14px;align-items:center;padding:1.5vh 1.4vw;border:2px solid var(--line);border-radius:14px;background:#fff;font-size:clamp(14px,.5vw + .8vh,20px);color:var(--ink-2);transition:border-color .2s,background .2s}
.kopt .kletter{flex:none;width:32px;height:32px;border-radius:9px;background:var(--bg-soft);border:1.5px solid var(--line);font-weight:800;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.kopt.correct{border-color:var(--leaf);background:var(--leaf-soft)}
.kopt.correct .kletter{background:var(--leaf);color:#fff;border-color:var(--leaf)}
.kreveal-line{margin-top:2.2vh;padding:1.6vh 1.6vw;background:var(--amber-soft);border:1.5px solid var(--amber);border-radius:12px;color:#7c4a04;font-size:clamp(14px,.5vw + .7vh,19px);font-weight:600;display:none}
.kreveal-line.show{display:block;animation:kfade .3s ease}
.kreveal-btn{margin-top:2.4vh;background:transparent;border:2px solid var(--cherry);color:var(--cherry-deep);font-weight:800;padding:1vh 1.8vw;border-radius:999px;cursor:pointer;font-size:clamp(13px,.5vw + .5vh,17px);letter-spacing:.5px}
.kreveal-btn:hover{background:var(--cherry);color:#fff}

/* break / cta */
.kslide.break .kinner, .kslide.cta .kinner{text-align:center}
.kslide.break .ktitle{color:var(--berry)}

/* assignment "Prove It" brief — visual, emoji, chart-like */
.kbrf-formula{margin-top:1.4vh;font-weight:800;color:var(--cherry-deep);font-size:clamp(14px,.5vw + .7vh,20px);letter-spacing:.2px}
.kbrf-chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:2.2vh}
.kbrf-chip{background:var(--bg-soft);border:1.5px solid var(--line);border-radius:999px;padding:.9vh 1.4vw;font-weight:700;font-size:clamp(13px,.45vw + .5vh,17px);color:var(--ink-2)}
.kbrf-chip.kbrf-diff{border-color:var(--berry);color:var(--berry)}
.kbrf-chip.kbrf-pts{border-color:var(--amber);color:#a26208;background:var(--amber-soft)}
.kbrf-steps{margin-top:2.6vh;display:grid;gap:1.2vh;max-width:64ch}
.kbrf-step{display:flex;gap:14px;align-items:center;padding:1.3vh 1.4vw;background:#fff;border:1.5px solid var(--line);border-left:5px solid var(--leaf);border-radius:12px;font-size:clamp(14px,.5vw + .7vh,19px);color:var(--ink-2);font-weight:600}
.kbrf-emoji{font-size:clamp(20px,2.4vh,28px);line-height:1;flex:none}
.kbrf-proof{margin-top:2.4vh;background:var(--leaf-soft);border:1.5px solid var(--leaf);border-radius:12px;padding:1.6vh 1.6vw;font-size:clamp(14px,.5vw + .7vh,19px);color:#2f6a1f;max-width:66ch}
.kbrf-proof b{color:#245018}
.kbrf-tags{margin-top:2vh;display:flex;gap:8px;flex-wrap:wrap}
.kbrf-tag{background:var(--bg-soft);border:1px solid var(--line);border-radius:8px;padding:.6vh 1vw;font-size:clamp(11px,.4vw + .4vh,14px);font-weight:600;color:var(--muted)}

/* broadcast */
.kbroadcast{margin-top:2.4vh;display:grid;gap:1vh;max-width:60ch}
.kbroadcast li{list-style:none;padding:1.2vh 1.4vw;background:var(--bg-soft);border:1.5px solid var(--line);border-left:5px solid var(--amber);border-radius:12px;font-size:clamp(14px,.5vw + .7vh,19px);color:var(--ink-2);font-weight:600}

/* ---------- pace bar (the live run-of-show tracker) ---------- */
#kpace{position:fixed;left:0;right:0;bottom:0;height:var(--pace-h);z-index:55;background:#111a24;color:#dbe6f0;
  display:flex;align-items:center;gap:16px;padding:0 16px;border-top:3px solid var(--cherry)}
#kpace .kstart{background:var(--cherry);color:#fff;border:none;border-radius:9px;padding:10px 18px;font-weight:800;cursor:pointer;font-size:14px;white-space:nowrap;letter-spacing:.4px}
#kpace .kstart.running{background:#22303f;color:#9fb4c9}
.kpace-clock{font-family:"Cascadia Mono",Consolas,monospace;font-size:20px;font-weight:700;white-space:nowrap}
.kpace-seg{font-size:13px;color:#9fb4c9;min-width:0}
.kpace-seg b{color:#fff;font-size:14px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpace-status{margin-left:auto;font-weight:800;font-size:14px;padding:8px 16px;border-radius:999px;white-space:nowrap;letter-spacing:.4px}
.kpace-status.ontime{background:rgba(60,122,38,.25);color:#a7e08a}
.kpace-status.behind{background:rgba(229,18,29,.28);color:#ffb0b0}
.kpace-status.ahead{background:rgba(54,120,149,.3);color:#9fd8ec}
.kpace-status.idle{background:#22303f;color:#9fb4c9}
.kpace-timeline{flex:none;width:min(28vw,340px);height:12px;border-radius:6px;background:#22303f;position:relative;overflow:hidden;display:flex}
.kpace-timeline .seg{height:100%;border-right:1px solid #111a24}
.kpace-timeline .now{position:absolute;top:-3px;bottom:-3px;width:3px;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.7)}
@media (max-width:900px){ .kpace-timeline{display:none} .kpace-seg{display:none} }

/* ---------- pulse rail (live participation) ---------- */
#krail{position:fixed;top:0;right:0;bottom:var(--pace-h);width:var(--rail-w);z-index:50;background:var(--bg-soft);
  border-left:1px solid var(--line);display:none;flex-direction:column;padding:14px 14px 10px}
body.rail-on #krail{display:flex}
.krail-head{font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;justify-content:space-between}
.krail-live{font-size:10px;font-weight:800;color:#fff;background:var(--leaf);border-radius:999px;padding:2px 8px;letter-spacing:1px}
.krail-live.off{background:var(--subtle)}
.krail-stats{margin-top:10px;font-size:12.5px;color:var(--muted);font-weight:600}
.krail-stats b{color:var(--ink);font-size:15px}
.kpulse-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
/* live poll results on the deck */
.kpoll{margin-top:12px;border:1.5px solid var(--berry);border-radius:12px;background:#fff;padding:11px 12px}
.kpoll-head{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--berry);margin-bottom:8px}
.kpoll-row{margin:7px 0}
.kpoll-row .lab{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-2);margin-bottom:3px}
.kpoll-row .lab .n{font-weight:800;color:var(--ink)}
.kpoll-bar{height:9px;border-radius:5px;background:var(--bg-soft);overflow:hidden}
.kpoll-bar i{display:block;height:100%;background:var(--berry);border-radius:5px;transition:width .4s ease}
.kpoll-row.correct .kpoll-bar i{background:var(--leaf)}
.kpoll-row.correct .lab{color:var(--leaf)}
.kpulse{border:1.5px solid var(--line);border-radius:12px;background:#fff;padding:10px 12px}
.kpulse b{display:block;font-size:26px;line-height:1;color:var(--ink)}
.kpulse span{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-top:4px}
.kpulse.here{border-left:5px solid var(--berry)} .kpulse.building{border-left:5px solid var(--amber)}
.kpulse.stuck{border-left:5px solid var(--cherry)} .kpulse.finished{border-left:5px solid var(--leaf)}
.kfeedback{margin-top:12px;border-radius:12px;padding:11px 12px;font-size:13px;font-weight:700;line-height:1.35;background:#fff;border:1.5px solid var(--line);color:var(--ink-2)}
.kfeedback.warn{background:var(--amber-soft);border-color:var(--amber);color:#7c4a04}
.kfeedback.stop{background:#fdecec;border-color:var(--cherry);color:var(--cherry-dark)}
.kfeedback.go{background:var(--leaf-soft);border-color:var(--leaf);color:#2f6a1f}
.kq-head{margin-top:14px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
.kq-list{margin-top:8px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:8px}
.kq{background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.35;color:var(--ink-2)}
.kq .who{display:block;font-size:11px;color:var(--subtle);font-weight:700;margin-top:5px}
.kq-empty{font-size:12.5px;color:var(--subtle);padding:10px 0}

/* ---------- overlays / toggles ---------- */
.ktoggles{position:fixed;top:12px;right:16px;z-index:60;display:flex;gap:8px}
.ktoggle{background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;color:var(--ink-2);cursor:pointer;box-shadow:0 4px 12px rgba(26,32,44,.08)}
.ktoggle:hover{border-color:var(--cherry);color:var(--cherry-deep)}
.ktoggle.on{background:var(--cherry);color:#fff;border-color:var(--cherry)}

#kqr-overlay{position:fixed;inset:0;z-index:80;background:rgba(15,20,25,.92);display:none;flex-direction:column;align-items:center;justify-content:center;color:#fff;gap:20px}
#kqr-overlay.show{display:flex}
#kqr-overlay .box{background:#fff;border-radius:22px;padding:20px;box-shadow:var(--shadow);width:min(58vh,460px);height:min(58vh,460px)}
#kqr-overlay .box svg{width:100%;height:100%}
#kqr-overlay .u{font-size:clamp(16px,2.2vh,26px);font-weight:700}
#kqr-overlay .u b{color:#ff8a8a}
#kqr-overlay .hint{color:#9fb4c9;font-size:14px}

#knotes{position:fixed;left:0;right:0;bottom:var(--pace-h);z-index:52;background:rgba(17,26,36,.97);color:#e7eef6;
  padding:16px 20px;font-size:14.5px;line-height:1.5;display:none;border-top:2px solid var(--cherry);max-height:38vh;overflow:auto}
#knotes.show{display:block}
#knotes .lbl{color:var(--cherry);font-weight:800;text-transform:uppercase;letter-spacing:1px;font-size:11.5px}
#knotes .pub{color:#9fd8ec}
#knotes .nxt{color:#a7e08a}

#ktoast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--pace-h) + 18px);z-index:70;
  background:var(--ink);color:#fff;padding:10px 20px;border-radius:999px;font-weight:700;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none}
#ktoast.show{opacity:1}

@media print{
  body{overflow:visible}
  #kpace,#krail,#kprogress,#kcounter,#khint,.ktoggles,#kqr-overlay,#knotes,#ktoast{display:none !important}
  .kstage{position:static;inset:auto}
  .kslide{display:flex !important;position:relative;page-break-after:always;height:100vh;inset:auto}
  @page{size:letter landscape;margin:0}
}
`;
