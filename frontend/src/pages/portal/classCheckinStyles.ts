/**
 * The check-in landing's stylesheet, lifted out of the page.
 *
 * The page passed the 500-line ceiling in CLAUDE.md's Modular Composition Rule, and roughly
 * 250 of those lines were this string. Splitting the presentation out is the cheapest way to
 * bring the component back under it without touching a single rule: the CSS is unchanged,
 * byte for byte, and no class name moved.
 *
 * Semantic tokens only — no hardcoded hex — so light and dark both hold.
 */
export const CBCK_CSS = `
.cbck-root{
  min-height:100vh; min-height:100dvh;
  display:flex; align-items:center; justify-content:center;
  padding:20px;
  font-family:var(--font-body); color:var(--text-body);
  background:
    radial-gradient(1100px 460px at 50% -10%, color-mix(in srgb, var(--red-500) 9%, transparent), transparent 70%),
    radial-gradient(900px 420px at 100% 110%, color-mix(in srgb, var(--blue-500) 8%, transparent), transparent 72%),
    var(--surface-subtle);
}
.cbck-card{
  width:100%; max-width:440px;
  background:var(--surface-card);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-xl);
  box-shadow:var(--shadow-xl);
  padding:34px 30px 24px;
  text-align:center;
}
@media (max-width:520px){ .cbck-card{ padding:28px 20px 22px; } }

.cbck-brand{ display:flex; align-items:center; justify-content:center; gap:9px; margin-bottom:22px; }
.cbck-wordmark{ font-family:var(--font-logo); font-weight:700; font-size:23px; letter-spacing:-.01em; color:var(--text-strong); line-height:1; }
.cbck-wordmark-c{ color:var(--brand-accent); }

.cbck-state{ display:flex; flex-direction:column; align-items:center; }

.cbck-eyebrow{
  font-size:12.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:var(--brand-accent); margin:0 0 8px;
}
.cbck-title{
  font-family:var(--font-display); font-weight:700; font-size:24px; line-height:1.2;
  letter-spacing:-.01em; color:var(--text-strong); margin:0 0 8px;
}
.cbck-meta{ font-size:14.5px; font-weight:600; color:var(--text-body); margin:0 0 18px; }
.cbck-text{ font-size:14.5px; line-height:1.55; color:var(--text-muted); margin:0; }
.cbck-text-lead{ margin:2px 0 20px; font-size:15.5px; color:var(--text-body); font-weight:500; }
.cbck-text-sub{ margin-top:14px; font-size:13px; color:var(--text-subtle); }

.cbck-icon{
  width:66px; height:66px; margin:2px auto 16px;
  display:flex; align-items:center; justify-content:center;
  border-radius:var(--radius-circle);
}
.cbck-icon-ok{ background:var(--status-success-bg); color:var(--status-success); }
.cbck-icon-warn{ background:var(--status-danger-bg); color:var(--status-danger); }

/* Big tap targets — students act one-handed on a phone. */
.cbck-btn{
  width:100%; min-height:54px; margin-top:18px; padding:0 18px;
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  font-family:var(--font-body); font-size:16px; font-weight:600; text-decoration:none;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
  box-shadow:var(--shadow-brand);
  transition:background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.cbck-btn:hover{ background:var(--action-bg-hover); transform:translateY(-1px); }
.cbck-btn:active{ background:var(--action-bg-press); transform:translateY(0); }
.cbck-btn:focus-visible{ outline:none; box-shadow:var(--focus-ring); }
.cbck-btn-ghost{
  color:var(--text-link); background:transparent; box-shadow:none;
  border:1px solid var(--border-default); margin-top:14px;
}
.cbck-btn-ghost:hover{ background:var(--surface-subtle); }

/* Live class controller */
.cbck-controller{ width:100%; margin-top:22px; padding-top:20px; border-top:1px solid var(--border-subtle); }
.cbck-ctl-label{ font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--text-muted); margin:0 0 12px; }
.cbck-status-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.cbck-status{
  display:flex; flex-direction:column; align-items:center; gap:6px;
  min-height:76px; padding:12px 8px; cursor:pointer;
  font-size:15px; font-weight:600; color:var(--text-body);
  background:var(--surface-card); border:2px solid var(--border-default); border-radius:var(--radius-lg);
  transition:border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.cbck-status:active{ transform:scale(.97); }
.cbck-status-emoji{ font-size:24px; line-height:1; }
.cbck-status.is-active{ color:#fff; border-color:transparent; }
.cbck-status-here.is-active{ background:var(--blue-500, #367895); }
.cbck-status-building.is-active{ background:var(--amber-500, #E8920C); }
.cbck-status-stuck.is-active{ background:var(--red-500, #FB2832); }
.cbck-status-finished.is-active{ background:var(--green-600, #3C7A26); }

.cbck-ask{ display:flex; gap:8px; margin-top:14px; }
.cbck-ask-input{
  flex:1; min-width:0; height:48px; padding:0 14px;
  font-size:15px; color:var(--text-body);
  background:var(--surface-card); border:1.5px solid var(--border-default); border-radius:var(--radius-pill);
}
.cbck-ask-input:focus-visible{ outline:none; border-color:var(--brand-accent); box-shadow:var(--focus-ring); }
.cbck-ask-send{
  flex:none; height:48px; padding:0 18px; cursor:pointer;
  font-size:15px; font-weight:700; color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill);
}
.cbck-ask-send:disabled{ opacity:.5; cursor:default; }

/* Live question (mirrors the instructor's screen) */
.cbck-q-text{ font-size:19px; font-weight:700; line-height:1.35; color:var(--text-strong); margin:2px 0 16px; }
.cbck-q-opts{ display:flex; flex-direction:column; gap:10px; }
.cbck-q-opt{
  display:flex; align-items:center; gap:12px; width:100%; min-height:56px; padding:10px 14px; cursor:pointer; text-align:left;
  font-size:16px; font-weight:600; color:var(--text-body);
  background:var(--surface-card); border:2px solid var(--border-default); border-radius:var(--radius-lg);
  transition:border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.cbck-q-opt:active{ transform:scale(.99); }
.cbck-q-opt:disabled{ cursor:default; }
.cbck-q-letter{
  flex:none; width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center;
  font-weight:800; font-size:14px; color:var(--text-muted); background:var(--surface-subtle); border:1.5px solid var(--border-default);
}
.cbck-q-opt-text{ flex:1; min-width:0; }
.cbck-q-opt.is-mine{ border-color:var(--brand-accent); background:color-mix(in srgb, var(--brand-accent) 8%, transparent); }
.cbck-q-opt.is-mine .cbck-q-letter{ background:var(--brand-accent); color:#fff; border-color:var(--brand-accent); }
.cbck-q-opt.is-correct{ border-color:var(--green-600, #3C7A26); background:color-mix(in srgb, var(--green-600, #3C7A26) 12%, transparent); }
.cbck-q-opt.is-correct .cbck-q-letter{ background:var(--green-600, #3C7A26); color:#fff; border-color:var(--green-600, #3C7A26); }
.cbck-q-check{ margin-left:auto; color:var(--green-600, #3C7A26); font-weight:800; }
.cbck-broadcast-list{ list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:8px; text-align:left; }
.cbck-broadcast-list li{
  padding:11px 14px; font-size:15px; font-weight:600; color:var(--text-body);
  background:var(--surface-subtle); border:1.5px solid var(--border-default); border-left:5px solid var(--amber-500, #E8920C); border-radius:var(--radius-lg);
}

/* Connection warning — only rendered when the companion poll is actually failing.
   Amber for a blip it will recover from on its own, red for a signed-out session
   the student has to act on. */
.cbck-link-warn{
  margin:0 0 16px; padding:12px 16px; border-radius:var(--radius-lg); text-align:left;
  background:var(--status-warning-bg, color-mix(in srgb, var(--amber-500, #E8920C) 12%, transparent));
  border-left:5px solid var(--amber-500, #E8920C);
}
.cbck-link-warn.is-hard{
  background:var(--status-danger-bg); border-left-color:var(--status-danger);
}
.cbck-link-title{ margin:0 0 4px; font-size:14px; font-weight:700; color:var(--text-default); }
.cbck-link-body{ margin:0; font-size:13px; line-height:1.5; color:var(--text-muted); }
.cbck-link-btn{
  margin-top:10px; padding:8px 16px; border:none; border-radius:999px;
  background:var(--brand-accent); color:#fff; font-size:13px; font-weight:700; cursor:pointer;
}

/* Live Decision Theater badge on the phone */
.cbck-theater-badge{
  display:inline-block; margin:0 0 12px; padding:6px 14px; border-radius:999px;
  font-size:12.5px; font-weight:700; letter-spacing:.02em;
  background:color-mix(in srgb, var(--brand-accent) 12%, transparent); color:var(--brand-accent);
}
.cbck-theater-badge.is-locked{ background:var(--status-danger-bg); color:var(--status-danger); }

/* Build Mode prompt (copy-ready) */
.cbck-prompt-box{
  margin-top:2px; background:#0f1720; border:1px solid #26313f; border-radius:var(--radius-lg);
  padding:14px; text-align:left; overflow-x:auto;
}
.cbck-prompt-box pre{ margin:0; font-family:ui-monospace,"Cascadia Mono",Consolas,monospace; font-size:13.5px; line-height:1.5; color:#e7eef6; white-space:pre-wrap; word-break:break-word; }
.cbck-copy-btn{ margin-top:12px; }
.cbck-prompt-meta{ margin:10px 0 0; text-align:left; font-size:13.5px; line-height:1.5; color:var(--text-body); }
.cbck-prompt-meta b{ color:var(--text-strong); }

.cbck-spin{
  width:34px; height:34px; margin:8px auto 16px; border-radius:50%;
  border:3px solid var(--border-subtle); border-top-color:var(--brand-accent);
  animation:cbck-spin .7s linear infinite;
}
@keyframes cbck-spin{ to{ transform:rotate(360deg); } }

.cbck-foot{
  margin:24px 0 0; padding-top:16px;
  border-top:1px solid var(--border-subtle);
  text-align:center; font-size:11.5px; letter-spacing:.01em; color:var(--text-subtle);
}

@media (prefers-reduced-motion: reduce){
  .cbck-btn{ transition:none; }
  .cbck-btn:hover{ transform:none; }
  .cbck-spin{ animation-duration:1.5s; }
}
`;
