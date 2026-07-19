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
.rt[data-theme="dark"] .rt-cwho{color:var(--muted)}
.rt[data-theme="dark"] .rt-bar{background:#0F1214}
.rt[data-theme="dark"] .rt-list.warn li{color:#E8920C}
.rt[data-theme="dark"] .rt-readerframe{background:#151515}
`;
