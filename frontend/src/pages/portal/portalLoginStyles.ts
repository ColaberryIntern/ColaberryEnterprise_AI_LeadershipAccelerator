/**
 * Styles for the Participant Portal sign-in, ported from Aleem's reference HTML.
 *
 * HIS VALUES, NOT A READING OF HIS SCREENSHOT. He built the mockup on this repo's own
 * design system, so every colour, radius, shadow and type size below is the same
 * `var(--*)` token his markup used. There is no hardcoded hex here, which is the rule
 * the previous version of this page set and the reason his file dropped in cleanly.
 *
 * Kept as a scoped string beside the page, the way the old page did it, rather than a
 * new stylesheet: the portal has no CSS-module convention and one more global file is a
 * worse trade than one more module here. It lives in its own file only because the page
 * plus these rules would clear the 500-line ceiling.
 *
 * The `cbpl-` prefix is inherited from the page this replaces, so any muscle memory in
 * devtools still works.
 */
export const PORTAL_LOGIN_CSS = `
.cbpl-root{
  position:relative; min-height:100vh; min-height:100dvh;
  display:flex; flex-direction:column;
  font-family:var(--font-body); color:var(--text-body);
  background:var(--surface-page);
}
/* The wash behind the hero. Decorative only, and it sits under everything that can be
   clicked - an earlier full-bleed overlay here swallowed taps on the submit button at
   phone width. */
.cbpl-wash{
  position:absolute; inset:0; z-index:1; pointer-events:none;
  background:radial-gradient(55% 42% at 50% 0%, color-mix(in srgb, var(--red-500) 8%, transparent), transparent 70%);
}

/* The line art. Decorative, masked so it fades out before the card rather than running
   under it, and hidden on small screens where there is no room for it to read as
   anything but noise beside the content. */
.cbpl-constellation{
  position:absolute; top:0; left:0; width:100%; height:620px;
  z-index:0; pointer-events:none;
  -webkit-mask-image:linear-gradient(to bottom, #000 0%, #000 45%, transparent 92%);
  mask-image:linear-gradient(to bottom, #000 0%, #000 45%, transparent 92%);
}
@media (max-width:860px){ .cbpl-constellation{ display:none; } }

.cbpl-header{
  position:relative; z-index:2;
  box-sizing:border-box; width:100%; max-width:1440px; margin:0 auto;
  padding:18px 28px;
  display:flex; align-items:center; justify-content:space-between; gap:16px;
}
.cbpl-brand{ display:inline-flex; align-items:center; gap:14px; text-decoration:none; }
.cbpl-mark{ display:block; height:28px; width:auto; }
.cbpl-rule{ width:1px; height:26px; background:var(--border-default); }
.cbpl-brandtext{
  font-family:var(--font-mono); font-size:12px; font-weight:var(--fw-bold);
  line-height:1.2; letter-spacing:.02em; color:var(--text-muted);
}
.cbpl-back{
  display:inline-flex; align-items:center; gap:8px; min-height:44px;
  font-size:14px; font-weight:var(--fw-medium); color:var(--text-muted);
  white-space:nowrap; text-decoration:none;
}
.cbpl-back:hover{ color:var(--text-strong); }
@media (max-width:560px){
  .cbpl-header{ padding:14px 16px; }
  .cbpl-brandtext{ display:none; }
  .cbpl-rule{ display:none; }
}

.cbpl-main{
  position:relative; z-index:2; flex:1;
  box-sizing:border-box; width:100%;
  padding:clamp(16px, 3vw, 36px) 24px clamp(40px, 6vw, 72px);
  display:flex; flex-direction:column; align-items:center; text-align:center;
}
@media (max-width:560px){ .cbpl-main{ padding-left:16px; padding-right:16px; } }

.cbpl-pill{
  display:inline-flex; align-items:center; gap:10px;
  font-family:var(--font-mono); font-size:12px; font-weight:var(--fw-bold);
  letter-spacing:.07em; text-transform:uppercase; color:var(--text-muted);
  margin-bottom:18px; padding:7px 14px 7px 10px;
  border-radius:var(--radius-pill); border:1px solid var(--border-default);
  background:var(--surface-card); box-shadow:var(--shadow-sm);
}
.cbpl-dot{
  position:relative; display:inline-block; width:8px; height:8px;
  border-radius:50%; background:var(--green-500); flex:none;
}
.cbpl-dot::after{
  content:''; position:absolute; inset:-4px; border-radius:50%;
  border:2px solid var(--green-500); opacity:.5;
  animation:cbplPulse 1.8s ease-out infinite;
}
@keyframes cbplPulse{
  0%{ transform:scale(.8); opacity:.6; }
  70%{ transform:scale(1.5); opacity:0; }
  100%{ transform:scale(1.5); opacity:0; }
}
@media (prefers-reduced-motion:reduce){
  .cbpl-dot::after{ animation:none; opacity:.4; }
}

.cbpl-h1{
  margin:0 0 12px; font-family:var(--font-display); font-weight:var(--fw-black);
  font-size:clamp(28px, 3.2vw, 42px); line-height:1.06; letter-spacing:-.03em;
  color:var(--text-strong);
}
/* Two lines that each hold together. The nowrap is his, and it is why the break lands
   between the sentences rather than inside one at an awkward width. */
.cbpl-h1 span{ display:block; white-space:nowrap; }
.cbpl-h1 .cbpl-h1-accent{ color:var(--red-500); }
.cbpl-lede{
  margin:0 0 26px; max-width:44ch; font-size:var(--fs-body-sm);
  line-height:1.6; color:var(--text-muted); text-wrap:pretty;
}
.cbpl-lede strong{ color:var(--text-strong); font-weight:var(--fw-bold); }

.cbpl-card{
  width:100%; max-width:480px; text-align:left; position:relative;
  background:var(--surface-card); border:1px solid var(--border-subtle);
  border-radius:var(--radius-2xl);
  box-shadow:0 30px 70px -28px rgba(0,0,0,.4), var(--shadow-md);
  overflow:hidden;
}
.cbpl-card-top{
  position:absolute; top:0; left:0; right:0; height:4px; z-index:2;
  background:linear-gradient(90deg, var(--red-600), var(--red-400));
}
.cbpl-card-head{
  display:flex; align-items:center; gap:12px; padding:16px 20px;
  border-bottom:1px solid var(--border-subtle); background:var(--surface-subtle);
}
.cbpl-card-icon{
  display:grid; place-items:center; flex:none; width:38px; height:38px;
  border-radius:10px; background:var(--surface-brand-subtle); color:var(--red-600);
}
.cbpl-card-titles{ display:flex; flex-direction:column; gap:1px; flex:1; min-width:0; }
.cbpl-card-title{
  font-weight:var(--fw-bold); font-size:var(--fs-body-sm); line-height:1.25;
  color:var(--text-strong);
}
.cbpl-card-sub{ font-size:12px; line-height:1.3; color:var(--text-muted); }
.cbpl-step{
  display:inline-flex; align-items:center; font-family:var(--font-mono);
  font-size:12px; font-weight:var(--fw-bold); letter-spacing:.04em;
  text-transform:uppercase; color:var(--red-700);
  background:var(--surface-brand-subtle); padding:5px 11px;
  border-radius:var(--radius-pill); white-space:nowrap;
}
.cbpl-card-body{ padding:24px; }

.cbpl-form{ display:flex; flex-direction:column; gap:18px; }
.cbpl-field{ display:flex; flex-direction:column; gap:6px; }
.cbpl-label{ font-size:13px; font-weight:var(--fw-bold); color:var(--text-strong); }
.cbpl-input{
  width:100%; box-sizing:border-box; padding:13px 14px;
  font-size:15px; font-family:inherit; color:var(--text-strong);
  background:var(--surface-card);
  border:1px solid var(--border-default); border-radius:var(--radius-md);
  transition:border-color .15s ease, box-shadow .15s ease;
}
.cbpl-input::placeholder{ color:var(--text-subtle); }
.cbpl-input:focus-visible{
  outline:none; border-color:var(--red-500);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--red-500) 24%, transparent);
}
.cbpl-input[aria-invalid="true"]{ border-color:var(--red-600); }
.cbpl-help{ font-size:12.5px; line-height:1.45; color:var(--text-muted); }

.cbpl-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  width:100%; min-height:56px; padding:0 20px;
  font-family:inherit; font-size:15px; font-weight:var(--fw-bold);
  color:var(--text-on-accent); background:var(--red-600);
  border:1px solid transparent; border-radius:var(--radius-md);
  cursor:pointer; transition:background .15s ease, transform .06s ease;
}
.cbpl-btn:hover:not(:disabled){ background:var(--red-700); }
.cbpl-btn:active:not(:disabled){ transform:translateY(1px); }
.cbpl-btn:disabled{ opacity:.55; cursor:not-allowed; }
.cbpl-btn:focus-visible{
  outline:none; box-shadow:0 0 0 3px color-mix(in srgb, var(--red-500) 32%, transparent);
}
.cbpl-btn-outline{
  min-height:48px; font-size:14px;
  color:var(--text-strong); background:var(--surface-card);
  border:1px solid var(--border-default);
}
.cbpl-btn-outline:hover:not(:disabled){ background:var(--surface-subtle); }
.cbpl-btn-ghost{
  width:auto; min-height:40px; padding:0 10px;
  font-size:13.5px; font-weight:var(--fw-medium);
  color:var(--text-muted); background:none; border:none;
}
.cbpl-btn-ghost:hover:not(:disabled){ color:var(--text-strong); background:var(--surface-subtle); }

.cbpl-spin{
  width:16px; height:16px; flex:none; border-radius:50%;
  border:2px solid color-mix(in srgb, var(--text-on-accent) 45%, transparent);
  border-top-color:var(--text-on-accent);
  animation:cbplSpin .7s linear infinite;
}
@keyframes cbplSpin{ to{ transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce){ .cbpl-spin{ animation-duration:2.4s; } }

.cbpl-error{
  display:flex; align-items:flex-start; gap:9px;
  padding:11px 13px; border-radius:var(--radius-md);
  background:var(--surface-brand-subtle); color:var(--red-700);
  font-size:13.5px; line-height:1.45;
}

.cbpl-sent{ display:flex; flex-direction:column; gap:18px; }
.cbpl-sent-head{
  display:flex; flex-direction:column; align-items:center; text-align:center;
  gap:8px; padding:4px 0 2px;
}
.cbpl-sent-icon{
  display:grid; place-items:center; width:56px; height:56px; border-radius:50%;
  background:var(--green-500); color:var(--text-on-accent);
  box-shadow:var(--shadow-md); margin-bottom:6px;
}
.cbpl-sent-title{
  margin:0; width:100%; font-family:var(--font-display); font-weight:var(--fw-bold);
  font-size:22px; letter-spacing:-.01em; line-height:1.2; color:var(--text-strong);
}
.cbpl-sent-text{
  margin:0; font-size:var(--fs-body-sm); line-height:1.5; color:var(--text-muted);
  text-wrap:pretty; overflow-wrap:anywhere;
}
.cbpl-sent-text strong{ color:var(--text-strong); font-weight:var(--fw-bold); }
.cbpl-sent-sub{ font-size:13px; }
.cbpl-mailgrid{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
.cbpl-sent-actions{ display:flex; flex-wrap:wrap; gap:4px 10px; justify-content:center; }

.cbpl-assure{
  display:flex; flex-wrap:wrap; align-items:center; justify-content:center;
  gap:6px 18px; padding:12px 20px;
  border-top:1px solid var(--border-subtle); background:var(--surface-subtle);
  font-size:12px; font-weight:var(--fw-medium); color:var(--text-muted);
}
.cbpl-assure span{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.cbpl-assure svg{ color:var(--green-600); flex:none; }

.cbpl-steps{
  list-style:none; margin:28px 0 0; padding:0; width:100%; max-width:760px;
  display:flex; flex-wrap:wrap; gap:16px 28px; justify-content:center; text-align:left;
}
.cbpl-steps li{ flex:1 1 200px; display:flex; gap:12px; align-items:flex-start; }
.cbpl-stepnum{
  display:grid; place-items:center; flex:none; width:32px; height:32px;
  border-radius:50%; font-family:var(--font-mono); font-weight:var(--fw-bold);
  font-size:13px; color:var(--text-subtle);
  border:1.5px solid var(--border-default); background:var(--surface-card);
}
.cbpl-stepnum-on{
  color:var(--red-700); border-color:var(--red-500); background:var(--surface-brand-subtle);
}
.cbpl-stepnum-done{
  color:var(--text-on-accent); border-color:var(--green-500); background:var(--green-500);
}
.cbpl-steptext{ display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.cbpl-steptext b{ font-size:var(--fs-body-sm); font-weight:var(--fw-bold); color:var(--text-strong); }
.cbpl-steptext span{ font-size:13px; line-height:1.45; color:var(--text-muted); overflow-wrap:anywhere; }

.cbpl-support{ margin:26px 0 0; font-size:var(--fs-body-sm); color:var(--text-muted); }
.cbpl-support a{ font-weight:var(--fw-medium); color:var(--red-600); }

.cbpl-footer{
  position:relative; z-index:2;
  border-top:1px solid var(--border-subtle);
  background:color-mix(in srgb, var(--surface-page) 82%, transparent);
}
.cbpl-footer-in{
  max-width:1440px; margin:0 auto; box-sizing:border-box; padding:18px 28px;
  display:flex; justify-content:space-between; align-items:center;
  gap:8px 24px; flex-wrap:wrap; font-size:13px; color:var(--text-muted);
}
.cbpl-footer-links{ display:flex; gap:22px; }
.cbpl-footer-links a{ color:var(--text-muted); }
@media (max-width:560px){ .cbpl-footer-in{ padding:16px; } }
`;
