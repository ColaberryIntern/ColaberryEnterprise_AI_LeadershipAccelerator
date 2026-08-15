/**
 * runtimeKit — the Learning Runtime stylesheet (scoped under `.rt`). A premium,
 * minimal student workspace (Notion/Linear/Cursor feel): a calm reading center,
 * a live mentor rail, and an evidence bar. Kept separate so the workspace file
 * stays focused on behavior.
 */

export const runtimeCss = `
.rt{--ink:#16191C;--paper:#FFFFFF;--mist:#F7F8FA;--sunken:#EFF2F5;--line:#E6EAEE;--line-soft:#EEF1F4;
  --berry:#367895;--berry-deep:#2E6A86;--berry-soft:#E6F0F3;--cherry:#FB2832;--cherry-deep:#C20E1E;--cherry-soft:#FDE7E8;
  --leaf:#5BA63C;--leaf-deep:#3C7A26;--leaf-soft:#E9F5E4;--amber:#E8920C;--amber-soft:#FBEFD9;--muted:#6A7680;--muted2:#95A0A8;
  --mono:'Roboto Mono',ui-monospace,Consolas,monospace;--sans:'Roboto',system-ui,'Segoe UI',sans-serif;
  position:fixed;inset:0;display:flex;flex-direction:column;background:var(--mist);color:var(--ink);font-family:var(--sans);font-size:14.5px;line-height:1.55;z-index:40}
.rt *{box-sizing:border-box}
.rt .mono{font-family:var(--mono)}
.rt-top{display:flex;align-items:center;gap:13px;padding:12px 20px;background:var(--paper);border-bottom:1px solid var(--line);flex:none}
.rt-comments{margin-top:18px;border-top:1px solid var(--line);padding-top:14px}
.rt-cpost{display:flex;gap:8px;margin-bottom:12px}
.rt-cpost .rt-in{flex:1}
.rt-comment{padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:var(--paper)}
.rt-cwho{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#6A6A6A;margin-bottom:4px}
.rt-comment p{margin:0;font-size:13.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.rt-back{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--paper);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted);flex:none}
.rt-back:hover{border-color:var(--berry);color:var(--berry)}.rt-back svg{width:18px;height:18px}
.rt-kick{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--berry)}
.rt-title{font-size:16px;font-weight:700;letter-spacing:-.01em;line-height:1.2}
.rt-pill{font-family:var(--mono);font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;background:var(--sunken);color:var(--muted)}
.rt-pill.done{background:var(--leaf-soft);color:var(--leaf-deep)}
.rt-body{flex:1;display:flex;min-height:0}
.rt-mid{flex:1;overflow-y:auto;padding:26px;max-width:820px;margin:0 auto;width:100%}
@media(max-width:900px){.rt-body{flex-direction:column}.rt-mentor{width:100%!important;border-left:none!important;border-top:1px solid var(--line)}}
.rt-mentor{width:340px;flex:none;background:var(--paper);border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.rt-mentor-h{display:flex;align-items:center;gap:8px;padding:14px 16px;font-weight:700;font-size:14px;border-bottom:1px solid var(--line-soft)}
.rt-dot{width:8px;height:8px;border-radius:50%;background:var(--leaf);box-shadow:0 0 0 3px var(--leaf-soft)}
.rt-thread{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px}
.rt-msg{font-size:13.5px;line-height:1.5;padding:9px 12px;border-radius:12px;max-width:92%}
.rt-msg.assistant{background:var(--berry-soft);color:#1c3d49;align-self:flex-start;border-bottom-left-radius:4px}
.rt-msg.user{background:var(--ink);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.rt-modes{display:flex;gap:6px;padding:0 14px 8px}
.rt-chip{font-family:var(--mono);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:5px 11px;border:1px solid var(--line);background:var(--paper);border-radius:999px;cursor:pointer;color:var(--muted)}
.rt-chip:hover{border-color:var(--berry);color:var(--berry)}.rt-chip:disabled{opacity:.5;cursor:not-allowed}
.rt-nudge{margin:0 14px 10px;padding:11px 13px;border:1px solid var(--berry);background:var(--berry-soft);border-radius:12px;display:flex;flex-direction:column;gap:9px}
.rt-nudge-msg{font-size:13.5px;line-height:1.5;color:#1c3d49}
.rt-nudge-actions{display:flex;gap:7px;flex-wrap:wrap}
.rt-nudge-actions .rt-btn{font-size:12.5px;padding:7px 12px}
.rt-ask{display:flex;gap:7px;padding:12px 14px;border-top:1px solid var(--line-soft)}
.rt-in{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:13.5px;font-family:inherit;background:var(--paper);color:var(--ink)}
.rt-in.mono{font-family:var(--mono);font-size:13px}
.rt-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13.5px;font-weight:600;padding:9px 14px;border-radius:9px;cursor:pointer;white-space:nowrap}
.rt-btn:hover{border-color:var(--berry);color:var(--berry)}.rt-btn:disabled{opacity:.5;cursor:not-allowed}
.rt-btn.pri{background:var(--berry);color:#fff;border-color:var(--berry)}.rt-btn.pri:hover{background:var(--berry-deep);color:#fff}
.rt-btn.cta{background:var(--cherry);color:#fff;border-color:var(--cherry)}.rt-btn.cta:hover{background:var(--cherry-deep);color:#fff}
.rt-row{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}
.rt-lab{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted2);margin:14px 0 6px}
.rt-muted{color:var(--muted);font-size:13px}
.rt-card{background:var(--paper);border:1px solid var(--line);border-radius:13px;padding:16px 18px;margin-top:14px}
.rt-card p{margin:0}
.rt-list{margin:4px 0 0;padding-left:18px;font-size:13.5px}.rt-list li{margin:5px 0}
.rt-list.ok li{color:var(--leaf-deep)}.rt-list.warn li{color:var(--amber-soft);color:#8a5a08}
.rt-scores{display:flex;gap:22px;margin-bottom:8px}
.rt-scores b{font-size:26px;font-weight:800;font-family:var(--mono);display:block;line-height:1}.rt-scores span{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.rt-scores>div:first-child b{color:var(--berry)}.rt-scores>div:last-child b{color:var(--cherry)}
.rt-artifact{background:var(--leaf-soft);border:1px solid rgba(91,166,60,.3);border-radius:13px;padding:16px 18px;margin-top:16px}
.rt-artifact b{font-size:15px}
.rt-complete{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}

/* ── build workspace: story hierarchy ──────────────────────────────────────
   A story is read in one order — what this is, what done means, how to build
   it — so the blocks carry different WEIGHT. Three identically-styled cards
   flatten that order and leave the student scanning for the entry point,
   which is worst at half screen where only one card is visible at a time. */
.rt-topright{margin-left:auto;display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end}
/* A flex item will not shrink below its min-content width by default, so a long
   story title would push the header actions off the edge rather than wrapping. */
.rt-top>div{min-width:0}
/* Links that LOOK like buttons: the class was written for <button>, which has no
   underline of its own. Command Center is an anchor because it navigates. */
a.rt-btn{text-decoration:none}
/* The lead is prose, not chrome: the first thing on the page should read like
   a sentence someone wrote you, not like another panel. */
.rt-lead{padding:4px 2px 0}
.rt-lead p{margin:0;font-size:16.5px;line-height:1.5;font-weight:500;letter-spacing:-.005em}
.rt-req{display:inline-block;margin-top:11px;font-family:var(--mono);font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--berry);background:var(--berry-soft);border-radius:999px;padding:4px 10px}
.rt-step{margin-top:22px}
.rt-step-h{display:flex;align-items:center;gap:9px;margin:0 0 9px}
.rt-step-n{flex:none;width:19px;height:19px;border-radius:50%;background:var(--sunken);color:var(--muted);font-family:var(--mono);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}
.rt-step-t{font-size:13.5px;font-weight:700;letter-spacing:-.005em}
.rt-step-c{margin-left:auto;font-family:var(--mono);font-size:10.5px;color:var(--muted2)}
.rt-step .rt-card{margin-top:0}
.rt-step .rt-card+.rt-card{margin-top:10px}
/* Acceptance is a pre-flight the student WALKS, so it ticks. Bullets invite
   re-reading; checkboxes invite finishing. Ticks are working memory only —
   "Mark done" is still the one thing that reports progress. */
.rt-acc{list-style:none;margin:0;padding:0}
.rt-acc li{margin:0;border-top:1px solid var(--line-soft)}
.rt-acc li:first-child{border-top:0}
.rt-acc label{display:flex;gap:10px;align-items:flex-start;padding:9px 2px;cursor:pointer;font-size:13.5px;line-height:1.5}
.rt-acc input{margin:3px 0 0;flex:none;width:15px;height:15px;accent-color:var(--leaf);cursor:pointer}
.rt-acc input:checked+span{color:var(--muted);text-decoration:line-through}

/* ── CONFIRMED vs SELF-TICKED ────────────────────────────────────────────────
   Two states that must never be mistaken for each other. A criterion the
   PLATFORM confirmed out of the repo is evidence; one the student ticked here is
   a note to self. They are separated on three channels at once — colour, weight,
   and a written label — because colour alone dies in a screenshot, in greyscale,
   and for a colour-blind reader, and the whole feature rests on this distinction
   being unmissable. */
.rt-acc li{position:relative;padding-right:2px}
.rt-acc-ok label{cursor:default}
.rt-acc-ok input{accent-color:var(--leaf)}
.rt-acc-ok input:disabled{opacity:1;cursor:default}
.rt-acc-ok>label>span{color:var(--muted)}
/* The self-tick is deliberately QUIETER than an untouched row is, not louder.
   It is an intention, and it must never read as an achievement. */
.rt-acc-self input{accent-color:var(--muted2)}
.rt-acc-self>label>span{color:var(--muted);text-decoration:none;opacity:.92}
.rt-acc-tag{display:inline-block;margin:0 0 8px 25px;font-family:var(--mono);font-size:9.5px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px}
.rt-acc-tag.ok{background:var(--leaf-soft);color:var(--leaf-deep)}
.rt-acc-tag.self{background:var(--sunken);color:var(--muted);border:1px dashed var(--line)}
.rt-acc-foot{margin:12px 0 0;padding-top:11px;border-top:1px solid var(--line-soft);
  font-size:12.5px;line-height:1.55;color:var(--muted)}
.rt-acc-foot code{font-family:var(--mono);font-size:11.5px;background:var(--sunken);padding:1px 5px;border-radius:4px}

/* The tick landing. Plays ONLY for a criterion that crossed into confirmed
   while the page was open — never on load, never on a re-render. */
@keyframes rt-land{0%{background:var(--leaf-soft);transform:translateX(0)}
  22%{background:var(--leaf-soft);transform:translateX(2px)}100%{background:transparent;transform:translateX(0)}}
.rt-acc-land{animation:rt-land 1.4s ease-out;border-radius:8px}
.rt-acc-land .rt-acc-tag.ok{animation:rt-pop .34s cubic-bezier(.2,1.5,.4,1)}
@keyframes rt-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}

/* ── WAITING ON GITHUB ───────────────────────────────────────────────────────
   The reason the completion button is locked, in the student's own plan's
   words. Amber, not red: nothing has gone wrong, the work is simply not
   finished yet, and a red panel would read as an error the student caused. */
.rt-waiting{border:1px solid var(--amber);background:var(--amber-soft);border-radius:12px;
  padding:13px 15px;margin-bottom:12px}
.rt-waiting-h{font-weight:700;font-size:13.5px;margin-bottom:6px}
.rt-waiting-l{margin:0;padding-left:19px;font-size:13px;line-height:1.6}
.rt-waiting-l li{margin:2px 0}
.rt-waiting-p{margin:0;font-size:13px;line-height:1.6}
.rt-waiting code{font-family:var(--mono);font-size:11.5px;background:rgba(0,0,0,.05);padding:1px 5px;border-radius:4px}

/* ── THE MOMENT ──────────────────────────────────────────────────────────────
   Rendered only on a verification the page actually witnessed. */
.rt-verified{display:flex;align-items:center;gap:13px;margin-top:16px;padding:14px 16px;
  border:1px solid var(--leaf);background:var(--leaf-soft);border-radius:13px;animation:rt-rise .42s ease-out}
@keyframes rt-rise{0%{opacity:0;transform:translateY(7px)}100%{opacity:1;transform:translateY(0)}}
.rt-verified-mark{flex:none;width:29px;height:29px;border-radius:50%;background:var(--leaf);color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;
  animation:rt-pop .44s cubic-bezier(.2,1.5,.4,1)}
.rt-verified-t{font-weight:700;font-size:14px;color:var(--leaf-deep)}
.rt-verified-s{font-size:12.5px;color:var(--muted);line-height:1.5}
.rt-verified-s code{font-family:var(--mono);font-size:11.5px}
.rt-verified-xp{margin-left:auto;flex:none;font-family:var(--mono);font-size:13px;font-weight:700;
  color:var(--leaf-deep);background:var(--paper);border:1px solid var(--leaf);border-radius:999px;
  padding:5px 12px;animation:rt-pop .4s cubic-bezier(.2,1.5,.4,1) .16s both}

/* Reduced motion: the same information, in the same order, without the
   movement. The app-wide override in responsive.css already flattens duration;
   this states the intent locally so a future edit to this file cannot
   accidentally reintroduce motion that ignores the preference. */
@media(prefers-reduced-motion:reduce){
  .rt-acc-land,.rt-acc-land .rt-acc-tag.ok,.rt-verified,.rt-verified-mark,.rt-verified-xp{animation:none}
  .rt-acc-land{background:transparent}
}
/* The prompt is a TOOL you carry to the editor, not the page you read. It is
   collapsed so the story, the requirement and the acceptance are what a
   student meets first; Copy stays visible so collapsing costs nothing. */
.rt-prompt-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rt-prompt-acts{margin-left:auto;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.rt-prompt-peek{margin:10px 0 0;font-family:var(--mono);font-size:12.5px;line-height:1.5;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rt-prompt-full{margin:10px 0 0;max-height:340px;overflow:auto;white-space:pre-wrap}
/* Self Study reader in the workstation: the iframe FILLS the center as the single scroll
   (no nested/adjacent scrollbars); the complete gate sits in a slim fixed foot, and the
   cohort comments move to the right rail (under the mentor). */
.rt-mid--reader{overflow:hidden;display:flex;flex-direction:column;padding:0;max-width:none}
.rt-readerwrap{flex:1;display:flex;flex-direction:column;min-height:0}
.rt-readerframe{flex:1;width:100%;border:0;min-height:0;background:#F7F4EE;display:block}
.rt-readerfoot{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:12px 18px;border-top:1px solid var(--line);background:var(--paper)}
.rt-comments--rail{flex:none;max-height:35vh;overflow-y:auto;margin:0;border-top:1px solid var(--line);padding:12px 14px}
.rt-bar{display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:11px 20px;background:var(--ink);color:#D4DEE2;flex:none}
.rt-stat{display:flex;flex-direction:column;gap:1px}
.rt-stat .l{font-family:var(--mono);font-size:8.5px;letter-spacing:.09em;text-transform:uppercase;color:#7d8b92}
.rt-stat .v{font-family:var(--mono);font-size:16px;font-weight:700;color:#fff}.rt-stat .v.sm{font-size:12.5px}.rt-stat .v small{font-size:10px;color:#8b97a0;font-weight:400}
.rt-gap{margin-left:auto;font-size:12px;color:#AEBDC4}.rt-gap b{color:#F5C25B}

/* ── dark theme — carries over the portal's setting (data-theme is stamped on
   the .rt root + <html> from localStorage 'te-theme'). Most colors flow through
   the tokens below; the few that reuse --ink as a DARK surface (user bubble,
   evidence bar) get explicit overrides so they don't flip to light. ── */
.rt[data-theme="dark"]{
  --ink:#F4F4F4; --paper:#1E1E1E; --mist:#151515; --sunken:#272727; --line:#3A3A3A; --line-soft:#2C2C2C;
  --berry-soft:#22343B; --cherry-soft:#3A1B1E; --leaf-soft:#22331C; --amber-soft:#3A2E12;
  --muted:#9C9C9C; --muted2:#7E8891;
}
.rt[data-theme="dark"] .rt-msg.user{background:var(--berry);color:#fff}
.rt[data-theme="dark"] .rt-msg.assistant{color:#CFE0E6}
.rt[data-theme="dark"] .rt-nudge-msg{color:#CFE0E6}
.rt[data-theme="dark"] .rt-cwho{color:var(--muted)}
.rt[data-theme="dark"] .rt-bar{background:#0F1214}
.rt[data-theme="dark"] .rt-list.warn li{color:#E8920C}
.rt[data-theme="dark"] .rt-readerframe{background:#151515}
/* --berry is a mid-tone picked against white; on the dark chip background it
   falls below AA, so the requirement pill gets a lifted ink of its own. */
.rt[data-theme="dark"] .rt-req{color:#8FC3D6}

/* ── half screen (≈700px, VS Code in the other half) ───────────────────────
   This is the posture the workspace is actually USED in: a student reads the
   story here and types in the editor beside it. It is not a phone — it is a
   desktop page at half width, and the failure mode is density, not layout.
   The 900px rule above already stacks the mentor rail; this block buys back
   the vertical space that stacking costs and stops the reading column from
   feeling like a squeezed desktop page. Overrides only — every base rule
   above still applies at full width. */
@media(max-width:760px){
  .rt{font-size:14px}
  .rt-top{padding:9px 12px;gap:9px;flex-wrap:wrap}
  .rt-title{font-size:15px}
  .rt-kick{font-size:10px}
  .rt-mid{padding:16px 14px}
  .rt-card{padding:13px 14px;border-radius:11px}
  .rt-lead{padding:2px 0 0}
  .rt-lead p{font-size:15.5px}
  .rt-step{margin-top:17px}
  .rt-acc label{padding:8px 0}
  /* A short prompt preview beats a tall one when the whole column is 700px. */
  .rt-prompt-full{max-height:240px}
  /* Stacked, the rail has no column to fill, so give it a usable band that
     still leaves the story as the majority of the screen. */
  .rt-mentor{min-height:250px;max-height:48vh}
  .rt-thread{padding:11px}
  .rt-bar{gap:14px;padding:9px 12px}
  .rt-stat .v{font-size:14px}
  .rt-stat .v.sm{font-size:11.5px}
}
`;
