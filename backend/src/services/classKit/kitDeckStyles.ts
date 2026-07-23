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

/* Live arrivals ticker — named join/leave events (see sessionPresenceService.ts) */
.kticker-head{margin-top:14px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
.kticker-list{margin-top:8px;max-height:120px;overflow:auto;display:flex;flex-direction:column;gap:6px}
.kticker-item{font-size:12.5px;line-height:1.4;padding:7px 10px;border-radius:9px;background:#fff;border:1.5px solid var(--line);color:var(--ink-2)}
.kticker-item b{color:var(--ink)}
.kticker-item .at{float:right;color:var(--subtle);font-size:11px;font-weight:600}
.kticker-item.classroom{border-left:4px solid var(--leaf)}
.kticker-item.building-enter{border-left:4px solid var(--berry)}
.kticker-item.building-leave{border-left:4px solid var(--subtle);color:var(--subtle)}
.kticker-empty{font-size:12.5px;color:var(--subtle);padding:6px 0}

/* Small persistent QR for latecomers — appears on slides after the cover,
   once the instructor has pressed Start class (before that, the cover's own
   big QR is the promoted one; showing a second QR pre-start would just clutter
   the room-settling moment without helping anyone). */
#klateqr{position:fixed;left:16px;bottom:calc(var(--pace-h) + 16px);z-index:45;
  display:none;flex-direction:column;align-items:center;gap:4px;
  background:rgba(255,255,255,.94);backdrop-filter:blur(6px);border:1px solid var(--line);border-radius:14px;
  padding:8px;box-shadow:0 10px 28px rgba(26,32,44,.16);cursor:pointer;opacity:.85;transition:opacity .2s}
#klateqr:hover{opacity:1}
#klateqr.show{display:flex}
body.idle #klateqr{opacity:.35}
.klateqr-box{width:64px;height:64px}
.klateqr-box svg{width:100%;height:100%;display:block}
.klateqr-label{font-size:10px;font-weight:700;color:var(--berry);text-transform:uppercase;letter-spacing:.4px}
body.focus #klateqr{display:none !important}

/* ---------- overlays / toggles ---------- */
/* Control cluster — sits over the STAGE (left of the rail), never overlapping it,
   and fades out when the mouse is idle so it stays out of the video. */
.ktoggles{position:fixed;top:10px;right:16px;z-index:60;display:flex;gap:6px;
  background:rgba(255,255,255,.72);backdrop-filter:blur(6px);border:1px solid var(--line);border-radius:12px;padding:5px;
  box-shadow:0 6px 20px rgba(26,32,44,.10);transition:opacity .4s ease}
body.rail-on .ktoggles{right:calc(var(--rail-w) + 14px)}
body.idle .ktoggles{opacity:0;pointer-events:none}
.ktoggle{background:transparent;border:0;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer}
.ktoggle:hover{background:var(--bg-soft);color:var(--cherry-deep)}
.ktoggle.on{background:var(--cherry);color:#fff}

/* Focus / Video mode — hide ALL chrome for a clean recording (presentation scene). */
body.focus .ktoggles,body.focus #krail,body.focus #kpace,body.focus #kcounter,body.focus #khint,body.focus #knotes{display:none !important}
body.focus .kstage{inset:0 !important}
#kfocus-exit{position:fixed;top:12px;right:16px;z-index:61;display:none;background:rgba(17,26,36,.8);color:#fff;border:0;border-radius:999px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer;opacity:.5;transition:opacity .3s}
#kfocus-exit:hover{opacity:1}
body.focus #kfocus-exit{display:block}
body.focus.idle #kfocus-exit{opacity:0}

/* Mermaid diagrams + diagram slide */
.kdiagram{margin-top:2.4vh;display:flex;flex-direction:column;align-items:center}
pre.mermaid{background:#fff;border:1.5px solid var(--line);border-radius:16px;padding:2vh 2vw;margin:0 auto;max-width:100%;overflow:auto;box-shadow:var(--shadow);
  font-family:"Cascadia Mono",Consolas,monospace;font-size:12px;color:#94a3b8;line-height:1.4}
pre.mermaid svg{max-width:100%;height:auto}
pre.mermaid[data-processed="true"]{font-size:0;padding:1.6vh 1.4vw;color:transparent}
.kdiagram-cap{margin-top:1.6vh;display:flex;gap:10px;align-items:flex-start;font-size:clamp(13px,.9vw,16px);color:#1a4a5c;font-weight:600;text-align:left;max-width:64ch;background:#eef7fa;border:1.5px solid var(--berry);border-radius:12px;padding:1.3vh 1.4vw}
.kdiagram-cap-ico{flex:none;font-size:1.15em;line-height:1}

/* teach-slide "lead with the conclusion" insight card */
.kteach-lead{margin-top:2.2vh;display:flex;gap:12px;align-items:flex-start;max-width:68ch;
  background:var(--bg-soft);border:1.5px solid var(--line);border-left:5px solid var(--berry);border-radius:14px;padding:1.6vh 1.6vw}
.kteach-ico{flex:none;font-size:clamp(18px,2vh,24px);line-height:1.3}
.kteach-lead p{font-size:clamp(15px,.6vw + .85vh,22px);line-height:1.5;color:var(--ink-2);font-weight:600}
.kevidence{margin-top:2.4vh;font-size:clamp(11px,.7vh + .3vw,14px);color:var(--subtle);border-top:1px solid var(--line);padding-top:1vh;max-width:70ch}

/* ================================================================
   PRESENTATION MODES — Teach (default, white) / Story / Build.
   Applied as body.mode-teach|mode-story|mode-build by kitDeckScript's
   show(), driven by each slide's data-mode. Teach Mode needs no rules
   here — it IS the base styling above.
   ================================================================ */

/* ---- Build Mode: dark, left-aligned, "do this now" coding surface ---- */
body.mode-build .kslide.active{background:#0b1220}
body.mode-build .kinner{margin:0;max-width:900px}
body.mode-build .ktitle{color:#f4f8fb}
body.mode-build .keyebrow{color:#7fd1e8}
body.mode-build .kbody,body.mode-build ul.kpoints li{color:#b9c7d6}
body.mode-build .kteach-lead{background:#101c2e;border-color:#233650}
body.mode-build .kteach-lead p{color:#dbe6f0}
body.mode-build .karch-item{background:#101c2e;border-color:#233650}
body.mode-build .karch-item p{color:#dbe6f0}
/* rail collapses to a thin status strip — icons only, no cards/questions/poll */
body.mode-build #krail{width:64px;padding:10px 6px}
body.mode-build .krail-head,body.mode-build .krail-stats,body.mode-build .kpoll,
body.mode-build .kfeedback,body.mode-build .kq-head,body.mode-build .kq-list,
body.mode-build .kticker-head,body.mode-build .kticker-list{display:none}
body.mode-build .kpulse-grid{grid-template-columns:1fr;gap:6px}
body.mode-build .kpulse{padding:6px 2px;text-align:center;border-left:none;border-top:3px solid transparent}
body.mode-build .kpulse.here{border-top-color:var(--berry)} body.mode-build .kpulse.building{border-top-color:var(--amber)}
body.mode-build .kpulse.stuck{border-top-color:var(--cherry)} body.mode-build .kpulse.finished{border-top-color:var(--leaf)}
body.mode-build .kpulse span{display:none}
body.mode-build .kpulse b{font-size:18px}
body.rail-on.mode-build .kstage{right:64px}
/* top toggles fade out of the way (still keyboard-reachable) */
body.mode-build .ktoggles{opacity:.15}
body.mode-build .ktoggles:hover{opacity:1}

/* Build Bay chips + rows */
.kbb-chips{display:flex;gap:10px;flex-wrap:wrap;margin:1.6vh 0 2vh}
.kbb-chip{background:#16233a;border:1.5px solid #27405f;color:#9fd8ec;border-radius:999px;padding:.7vh 1.2vw;font-weight:800;font-size:clamp(11px,.4vw + .5vh,14px);letter-spacing:.3px}
.kbb-chip b{color:#fff}
.kbb-chip-n{background:#27405f}
.kbb-chip-mode{background:#3a2a52;border-color:#5b3f86;color:#c9a8f0}
.kbb-rows{margin-top:2.2vh;display:grid;gap:1.1vh;max-width:72ch}
.kbb-row{display:flex;gap:10px;align-items:flex-start;padding:1.2vh 1.3vw;border-radius:12px;font-size:clamp(13px,.45vw + .65vh,17px)}
.kbb-row-label{flex:none;font-weight:800;letter-spacing:.4px;white-space:nowrap}
.kbb-row-result{background:#122a1d;border:1.5px solid #235c39;color:#bdeecb}
.kbb-row-result .kbb-row-label{color:#5fd88a}
.kbb-row-stop{background:#332108;border:1.5px solid #7a4e0a;color:#ffdca3}
.kbb-row-stop .kbb-row-label{color:#e8920c}
.kbb-row-rescue{background:#2a1418;border:1.5px solid #6b2530;color:#ffc2c9}
.kbb-row-rescue .kbb-row-label{color:#ff8a94}

/* ---- Story Mode: minimal chrome, single-statement/dramatic pages ---- */
body.mode-story .kslide.active{background:#0f1115}
body.mode-story .ktitle,body.mode-story .ktheater-q{color:#fff}
body.mode-story #krail{display:none !important}
body.mode-story.rail-on .kstage{right:0}
body.mode-story .ktoggles{opacity:.2}
body.mode-story .ktoggles:hover{opacity:1}

.khook{text-align:center;max-width:900px;margin:0 auto}
.khook-line{font-size:clamp(30px,3vw + 3vh,68px);font-weight:800;line-height:1.15;letter-spacing:-1px;color:#fff}
.khook-cap{margin-top:2.4vh;font-size:clamp(16px,.8vw + 1vh,25px);color:#9fb4c9}

/* Story Beat — "change of pace" teaching moment. Icon + narrative, colorful
   tone-tinted glow so each beat reads as a distinct visual moment even though
   it's built from typography, not a photo. */
.ksbeat{max-width:820px;margin:0 auto;text-align:center;position:relative;padding:2vh 1vw}
.ksbeat-icon{font-size:clamp(56px,7vw,110px);line-height:1;margin-bottom:1.4vh;filter:drop-shadow(0 8px 22px rgba(0,0,0,.35))}
.ksbeat .keyebrow{justify-content:center}
.ksbeat .ktitle{font-size:clamp(26px,1.8vw + 1.8vh,50px)}
.ksbeat-body{margin-top:2.2vh;font-size:clamp(16px,.7vw + .9vh,24px);line-height:1.55;color:#dbe6f0;max-width:66ch;margin-left:auto;margin-right:auto}
.ksbeat-punch{margin-top:2.6vh;display:inline-block;font-weight:800;font-size:clamp(15px,.6vw + .8vh,21px);
  padding:1.2vh 2vw;border-radius:999px;color:#fff}
.ksbeat-cherry .ksbeat-icon{filter:drop-shadow(0 8px 26px rgba(251,40,50,.55))}
.ksbeat-cherry .keyebrow{color:#ff8a94}
.ksbeat-cherry .ksbeat-punch{background:linear-gradient(135deg,var(--cherry),var(--cherry-dark))}
.ksbeat-berry .ksbeat-icon{filter:drop-shadow(0 8px 26px rgba(54,120,149,.55))}
.ksbeat-berry .keyebrow{color:#7fd1e8}
.ksbeat-berry .ksbeat-punch{background:linear-gradient(135deg,#367895,#1f4d63)}
.ksbeat-amber .ksbeat-icon{filter:drop-shadow(0 8px 26px rgba(232,146,12,.55))}
.ksbeat-amber .keyebrow{color:#ffcf8a}
.ksbeat-amber .ksbeat-punch{background:linear-gradient(135deg,var(--amber),#a26208)}
.ksbeat-leaf .ksbeat-icon{filter:drop-shadow(0 8px 26px rgba(60,122,38,.55))}
.ksbeat-leaf .keyebrow{color:#8ee08a}
.ksbeat-leaf .ksbeat-punch{background:linear-gradient(135deg,var(--leaf),#245018)}
.ksbeat-violet .ksbeat-icon{filter:drop-shadow(0 8px 26px rgba(122,63,214,.55))}
.ksbeat-violet .keyebrow{color:#c9a8f0}
.ksbeat-violet .ksbeat-punch{background:linear-gradient(135deg,#7a3fd6,#4a2382)}

.kba-grid{margin-top:2.6vh;display:grid;grid-template-columns:1fr 1fr;gap:1.6vw;max-width:920px}
.kba-col{border-radius:16px;padding:2vh 1.6vw}
.kba-before{background:#2a1418;border:1.5px solid #6b2530}
.kba-after{background:#122a1d;border:1.5px solid #235c39}
.kba-head{font-weight:800;letter-spacing:.5px;margin-bottom:1.4vh;font-size:clamp(13px,.5vw + .6vh,17px)}
.kba-before .kba-head{color:#ff8a94} .kba-after .kba-head{color:#5fd88a}
.kba-col ul{list-style:none;display:grid;gap:.9vh}
.kba-col li{font-size:clamp(13px,.45vw + .65vh,17px);color:#dbe6f0;opacity:.92}
@media(max-width:820px){.kba-grid{grid-template-columns:1fr}}

/* ---- Live Decision Theater — full-screen poll, part of Story Mode ---- */
.ktheater{text-align:center;max-width:900px;margin:0 auto}
.ktheater-badge{display:inline-flex;align-items:center;gap:8px;background:#3a2a52;color:#c9a8f0;border-radius:999px;padding:.9vh 1.6vw;font-weight:800;letter-spacing:.5px;font-size:clamp(12px,.5vw + .5vh,15px)}
.ktheater-badge.locked{background:#6b2530;color:#ffc2c9}
.ktheater-badge.revealed{background:#235c39;color:#bdeecb}
.ktheater-count{margin-top:1.6vh;font-size:clamp(15px,.6vw + .8vh,20px);color:#9fb4c9;font-weight:700}
.ktheater-q{margin-top:2.4vh;font-size:clamp(24px,1.6vw + 1.6vh,44px);font-weight:800;line-height:1.2}
.ktheater-tiles{margin-top:3vh;display:grid;gap:1.2vh;max-width:760px;margin-left:auto;margin-right:auto}
.ktheater-tile{padding:2vh 1.6vw;border-radius:16px;background:#16233a;border:2px solid #27405f;color:#dbe6f0;
  font-size:clamp(16px,.7vw + .9vh,24px);font-weight:700;position:relative;overflow:hidden;text-align:left;display:flex;justify-content:space-between}
.ktheater-tile .fill{position:absolute;inset:0;background:#27405f;width:0%;transition:width .6s ease;z-index:0}
.ktheater-tile .label,.ktheater-tile .pct{position:relative;z-index:1}
.ktheater-tile.correct{border-color:var(--leaf)}
.ktheater-tile.correct .fill{background:#1e4a2a}
.ktheater-controls{margin-top:3vh;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.ktheater-btn{background:#27405f;color:#fff;border:none;border-radius:999px;padding:1.2vh 2vw;font-weight:800;cursor:pointer;font-size:clamp(13px,.5vw + .6vh,17px)}
.ktheater-btn.primary{background:var(--cherry)}
.ktheater-explain{margin-top:2.6vh;background:#101c2e;border:1.5px solid #233650;border-radius:14px;padding:1.8vh 1.8vw;
  font-size:clamp(14px,.5vw + .8vh,19px);color:#dbe6f0;max-width:760px;margin-left:auto;margin-right:auto}

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
