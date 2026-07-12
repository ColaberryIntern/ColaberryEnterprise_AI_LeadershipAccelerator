/**
 * themeKit — the platform design-token system for the AI Workforce OS. Light is
 * the DEFAULT; dark is fully supported. Every token is a CSS variable on the
 * `.wf` root; `data-theme="dark"` swaps the palette with no reload. Preference
 * persists per user in localStorage. (Retrofitting every legacy screen onto
 * these tokens is a separate migration — see PHASE_5.md.)
 */

export const THEME_KEY = 'wf-theme';
export const readTheme = (): 'light' | 'dark' => {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
};
export const writeTheme = (t: 'light' | 'dark') => { try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ } };

export const workforceCss = `
.wf{
  --bg:#F6F8FA;--panel:#FFFFFF;--panel2:#F1F4F7;--line:#E4E9ED;--line-soft:#EDF1F4;
  --ink:#161B20;--muted:#647079;--muted2:#93A0A9;
  --berry:#2E6A86;--berry-soft:#E6F0F4;--cherry:#E4231F;--cherry-soft:#FCE7E7;--leaf:#3C7A26;--leaf-soft:#E9F5E4;--amber:#B5710A;--amber-soft:#FBEFD9;
  --shadow:0 2px 8px rgba(20,25,30,.05),0 1px 2px rgba(20,25,30,.04);
  --mono:'Roboto Mono',ui-monospace,Consolas,monospace;--sans:'Roboto',system-ui,'Segoe UI',sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);min-height:100%;font-size:14px;transition:background .2s,color .2s}
.wf[data-theme="dark"]{
  --bg:#0E1317;--panel:#161C22;--panel2:#1B232A;--line:#2A343C;--line-soft:#222B32;
  --ink:#E4EAEF;--muted:#8A99A4;--muted2:#63727C;
  --berry:#5FB0D4;--berry-soft:#16303B;--cherry:#FB4A52;--cherry-soft:#331417;--leaf:#6FCF56;--leaf-soft:#16240F;--amber:#E8A63C;--amber-soft:#2C2010;
  --shadow:0 2px 10px rgba(0,0,0,.3);}
.wf *{box-sizing:border-box}
.wf-wrap{max-width:1240px;margin:0 auto;padding:22px}
.wf-top{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.wf-kick{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--berry)}
.wf-h1{font-size:24px;font-weight:700;letter-spacing:-.02em;margin:2px 0 0}
.wf-actions{margin-left:auto;display:flex;gap:8px;align-items:center}
.wf-btn{border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:9px;cursor:pointer;white-space:nowrap}
.wf-btn:hover{border-color:var(--berry);color:var(--berry)}.wf-btn.pri{background:var(--berry);color:#fff;border-color:var(--berry)}.wf-btn.pri:hover{filter:brightness(1.08);color:#fff}
.wf-btn.xs{font-size:11px;padding:5px 9px}.wf-btn:disabled{opacity:.5;cursor:not-allowed}
.wf-toggle{width:38px;height:34px;border:1px solid var(--line);background:var(--panel);border-radius:9px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center}
.wf-toggle:hover{border-color:var(--berry);color:var(--berry)}.wf-toggle svg{width:17px;height:17px}
.wf-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow)}
.wf-lab{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted2);margin-bottom:10px}
.wf-lab.section{margin:22px 0 12px;color:var(--muted)}
.wf-muted{color:var(--muted);font-size:13px}.wf-err{background:var(--cherry-soft);color:var(--cherry);padding:14px 16px;border-radius:10px;margin-top:20px}
.wf-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px}@media(max-width:920px){.wf-grid{grid-template-columns:1fr}}
.wf-morning{font-size:19px;font-weight:700;margin:0 0 6px;color:var(--ink)}
.wf-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px}@media(max-width:640px){.wf-cols{grid-template-columns:1fr}}
.wf-sub{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2);margin-bottom:6px}
.wf-list{margin:0;padding-left:16px;font-size:13px;line-height:1.5}.wf-list li{margin:4px 0}
.wf-list.risk li{color:var(--cherry)}.wf-list.win li{color:var(--leaf)}
.wf-hp{display:flex;align-items:baseline;gap:8px}.wf-hp b{font-family:var(--mono);font-size:34px;font-weight:800;color:var(--berry)}.wf-hp span{font-family:var(--mono);text-transform:uppercase;font-size:11px;letter-spacing:.08em;color:var(--muted)}
.wf-orgchart{display:flex;flex-direction:column;align-items:center;gap:0}
.wf-emp{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 14px;cursor:pointer;transition:.14s;width:100%}
.wf-emp:hover{border-color:var(--berry);box-shadow:var(--shadow);transform:translateY(-1px)}
.wf-av{width:38px;height:38px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;font-family:var(--mono)}
.wf-emp .nm{font-weight:700;font-size:13.5px}.wf-emp .rl{font-size:11.5px;color:var(--muted)}
.wf-emp .wl{margin-left:auto;font-family:var(--mono);font-size:10.5px;color:var(--muted);text-align:right}
.wf-emp .wl b{color:var(--ink);font-size:14px}.wf-emp .wl.busy b{color:var(--amber)}
.wf-dirs{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px}
.wf-mtg{border:1px solid var(--line);border-radius:9px;padding:9px 12px;margin-bottom:6px;font-size:12.5px;display:flex;gap:9px;background:var(--panel2)}
.wf-mtg .mav{width:24px;height:24px;border-radius:7px;flex:none;color:#fff;font-family:var(--mono);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}
.wf-mtg b{color:var(--ink)}
.wf-ai{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line-soft)}.wf-ai:first-of-type{border-top:none}
.wf-ai .who{font-family:var(--mono);font-size:10px;color:var(--berry);flex:none;width:96px;text-transform:uppercase;letter-spacing:.04em}
.wf-sev{font-family:var(--mono);font-size:9px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:999px;margin-right:6px}
.wf-sev.high{background:var(--cherry-soft);color:var(--cherry)}.wf-sev.medium{background:var(--amber-soft);color:var(--amber)}.wf-sev.low{background:var(--berry-soft);color:var(--berry)}
.wf-msg{padding:9px 0;border-top:1px solid var(--line-soft);font-size:12.5px}.wf-msg:first-of-type{border-top:none}
.wf-msg .rt{font-family:var(--mono);font-size:10.5px;color:var(--muted)}.wf-msg .sb{font-weight:600;margin:2px 0}
.wf-anal{display:flex;gap:22px;flex-wrap:wrap;margin-top:8px}.wf-anal .a b{font-family:var(--mono);font-size:20px;font-weight:800;display:block;color:var(--berry)}.wf-anal .a span{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2)}
/* office drawer */
.wf-scrim{position:fixed;inset:0;background:rgba(10,14,18,.5);z-index:80;display:flex;justify-content:flex-end}
.wf-drawer{width:min(560px,94vw);height:100%;background:var(--panel);border-left:1px solid var(--line);overflow-y:auto;padding:22px;animation:wfin .26s cubic-bezier(.22,1,.36,1)}
@keyframes wfin{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}
.wf-ohead{display:flex;align-items:center;gap:13px;margin-bottom:16px}
.wf-ohead .av{width:52px;height:52px;border-radius:13px;font-size:18px}
.wf-scores{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0}.wf-scores .s b{font-family:var(--mono);font-size:18px;font-weight:800;display:block;color:var(--leaf)}.wf-scores .s span{font-size:9.5px;text-transform:uppercase;color:var(--muted2)}
.wf-chip{font-family:var(--mono);font-size:10.5px;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:3px 9px;color:var(--ink);margin:0 5px 5px 0;display:inline-block}
.wf-otask{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:7px 0;border-top:1px solid var(--line-soft)}
.wf-close{margin-left:auto;width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--panel);cursor:pointer;color:var(--muted)}
`;
