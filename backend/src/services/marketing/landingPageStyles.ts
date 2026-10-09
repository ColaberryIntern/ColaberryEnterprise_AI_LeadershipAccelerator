/**
 * The landing page stylesheet, inlined into every rendered page.
 *
 * Split out of landingPageRenderer.ts on 2026-10-09: that file had reached 542 lines, over
 * CLAUDE.md's 500-line hard ceiling, and the rule is that the next change splits before adding.
 * Moved verbatim - the renderer suite is what proves the split changed no behaviour.
 */

export const STYLES = `
*,*::before,*::after{box-sizing:border-box}
/* Single-theme on purpose: this is a brand surface, and the accent, the inverse band and the
   closing band are all chosen against a light ground. Declared rather than left unset so a
   dark-mode browser does not restyle form controls and scrollbars against the design. */
:root{color-scheme:light}
/* Text overflow. A pasted URL, a German compound, a 40-character product name: any unbroken
   run longer than its column used to push the page sideways, because nothing here said it
   could break. "anywhere" rather than "break-word" so it also applies inside grid and flex
   children, which is where every card, check row and panel row lives. */
body{overflow-wrap:anywhere}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif}
img{max-width:100%;height:auto;display:block}
a{color:inherit}

/* ---- bands ------------------------------------------------------------ */
.band{padding-block:clamp(3rem,7vw,5.5rem)}
.band--subtle{background:var(--bg-elevated)}
.band--inverse{background:#1A1A1A;color:#FFFFFF}
.band--accent{background:var(--accent);color:var(--accent-contrast)}
.band--hero{padding-block:clamp(3rem,8vw,6rem)}
.band--joined{padding-top:0}
.inner{max-width:68rem;margin:0 auto;padding-inline:1.25rem}

/* ---- header / footer --------------------------------------------------- */
.site-head{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:rgba(255,255,255,.93);backdrop-filter:saturate(1.6) blur(8px);border-bottom:1px solid var(--line)}
.site-head .inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-block:.7rem}
.brand{display:flex;align-items:center;gap:.55rem;text-decoration:none;font-weight:700;letter-spacing:-.01em;color:var(--fg)}
.brand img{height:30px;width:auto}
.site-foot{background:#1A1A1A;color:#FFFFFF;padding-block:2.5rem}
.site-foot .inner{display:flex;flex-wrap:wrap;gap:1rem 2rem;align-items:center;justify-content:space-between}
.foot-mark{font-weight:700;font-size:1.1rem;letter-spacing:-.01em}
.foot-note{color:#B4B4B4;font-size:.85rem;margin:0}

/* ---- type -------------------------------------------------------------- */
h1{font-size:clamp(2.1rem,5.4vw,3.5rem);line-height:1.07;letter-spacing:-.025em;margin:0 0 1.1rem;text-wrap:balance;font-weight:800}
h2{font-size:clamp(1.6rem,3.4vw,2.35rem);line-height:1.14;letter-spacing:-.02em;margin:0 0 1rem;text-wrap:balance;font-weight:800}
p{margin:0 0 1rem}
/* Small text in the brand colour is darkened toward black for contrast. Colaberry cherry
   #FB2832 measures 3.86:1 on white - fine for a 3.5rem headline (AA large needs 3:1), under the
   4.5:1 AA floor for a .74rem label. Declared twice: a browser without color-mix keeps the plain
   accent, so this degrades to the brand colour rather than to nothing. Surfaces (the buttons, the
   closing band) keep the undarkened brand red - that is a brand decision, not a CSS one. */
.eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);margin:0 0 .85rem}
.band--inverse .eyebrow,.band--accent .eyebrow{color:currentColor;opacity:.78}
.hl{color:var(--accent)}
.band--accent .hl,.band--inverse .hl{color:inherit}
.lede{font-size:clamp(1.05rem,1.6vw,1.2rem);color:var(--fg-muted);max-width:40rem}
.band--inverse .lede,.band--accent .lede{color:currentColor;opacity:.9}
.prose{max-width:42rem;color:var(--fg-muted)}
.band--inverse .prose,.band--accent .prose{color:currentColor;opacity:.9}
.intro{max-width:42rem;color:var(--fg-muted);margin:0 0 2rem}
.band--inverse .intro,.band--accent .intro{color:currentColor;opacity:.9}
.kicker{font-weight:700;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);max-width:42rem;margin:.25rem 0 0}
.band--inverse .kicker,.band--accent .kicker{color:currentColor}

/* ---- split: heading column beside content column ------------------------ */
.split{display:grid;gap:1.25rem}
@media (min-width:62rem){.split{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:1rem 4rem;align-items:start}}
.split-head h2{margin-bottom:0}
.split-body .prose,.split-body .intro{max-width:none}
.split-head .intro{margin:.9rem 0 0}

/* ---- hero -------------------------------------------------------------- */
.hero-grid{display:grid;gap:2.5rem}
.hero-split{grid-template-columns:1fr}
@media (min-width:62rem){.hero-split{grid-template-columns:1.05fr .95fr;align-items:center}}
/* ---- hero panel: what this contains ------------------------------------ */
.panel{background:var(--bg);border:1px solid var(--line);border-radius:.9rem;padding:1.4rem 1.5rem;box-shadow:0 10px 30px rgba(0,0,0,.07)}
.band--subtle .panel{background:#FFFFFF}
.band--inverse .panel{background:#2B2B2B;border-color:#3A3A3A}
.panel-title{font-size:.74rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--fg-muted);margin:0 0 .9rem}
.band--inverse .panel-title{color:#D8D8D8}
.panel-list{list-style:none;margin:0;padding:0;display:grid;gap:.1rem}
/* Rows wrap rather than collide: the label takes the space it needs and the note drops
   beneath it on a narrow panel instead of being squeezed to one character per line. */
.panel-list li{display:flex;flex-wrap:wrap;gap:.25rem .75rem;align-items:baseline;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid var(--line)}
.band--inverse .panel-list li{border-color:#3A3A3A}
.panel-list li:last-child{border-bottom:0}
.panel-label{font-weight:600;min-width:0}
.panel-note{font-size:.8rem;color:var(--fg-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.band--inverse .panel-note{color:#D8D8D8}
.panel-foot{margin:.9rem 0 0;font-size:.82rem;color:var(--fg-muted)}
.band--inverse .panel-foot{color:#D8D8D8}

.pills{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;padding:0;margin:1.4rem 0 0}
.pills li{background:var(--accent-soft);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:.35rem .85rem;font-size:.85rem;font-weight:600}

/* ---- buttons ----------------------------------------------------------- */
.cta-row{margin-top:1.8rem;display:flex;flex-wrap:wrap;gap:.75rem}
.cta{display:inline-flex;align-items:center;gap:.5rem;background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.6rem;border-radius:.5rem;text-decoration:none;font-weight:700;line-height:1.2;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.cta:hover{filter:brightness(1.07)}
.cta-arrow{transition:transform .15s ease}
.cta:hover .cta-arrow{transform:translateX(3px)}
.cta-secondary{background:transparent;color:var(--accent);border:1.5px solid var(--accent);box-shadow:none}
.band--accent .cta{background:#FFFFFF;color:var(--accent)}
.cta-sm{padding:.55rem 1.1rem;font-size:.9rem}
/* Every link, not only the buttons. A link inside prose was reachable by keyboard and gave no
   sign of where focus was. */
a:focus-visible,.cta:focus-visible,details summary:focus-visible,.brand:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.band--accent .cta:focus-visible{outline-color:#FFFFFF}

/* ---- bullets: cards / checks / steps ------------------------------------ */
.cards,.checks,.steps{list-style:none;padding:0;margin:0}
.cards{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.cards li{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.15rem 1.25rem;border-top:3px solid var(--accent)}
.band--subtle .cards li{background:#FFFFFF}
.band--inverse .cards li{background:#2B2B2B;border-color:#3A3A3A}
.checks{display:grid;gap:.85rem;max-width:46rem}
.checks li{display:flex;gap:.7rem;align-items:flex-start}
.tick{width:1.3rem;height:1.3rem;flex:0 0 auto;margin-top:.14rem;color:#5BA63C}
.steps{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.steps li{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.15rem 1.25rem}
.band--subtle .steps li{background:#FFFFFF}
.band--inverse .steps li{background:#2B2B2B;border-color:#3A3A3A}
.step-n{display:block;font-size:.78rem;font-weight:800;letter-spacing:.08em;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);margin-bottom:.4rem;font-variant-numeric:tabular-nums}
.b-label{display:block;font-weight:700}
.b-detail{display:block;color:var(--fg-muted);margin-top:.25rem;font-size:.95rem}
.band--inverse .b-detail,.band--accent .b-detail{color:#D8D8D8}

/* ---- stats / quote / details / faq -------------------------------------- */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1.25rem}
.stat{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.3rem}
.band--subtle .stat{background:#FFFFFF}
.stat-value{display:block;font-size:2.2rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.05;color:var(--accent)}
.stat-label{display:block;margin-top:.3rem;font-weight:600}
.stat-source{display:block;margin-top:.55rem;font-size:.78rem;color:var(--fg-muted)}
blockquote{margin:0 0 1.25rem;padding:1.4rem 1.5rem;background:var(--bg);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:0 .6rem .6rem 0;max-width:46rem}
.band--subtle blockquote{background:#FFFFFF}
blockquote p{font-size:1.08rem}
blockquote footer{color:var(--fg-muted);font-size:.9rem;font-weight:600}
blockquote .role{display:block;font-weight:400}
dl{margin:0;max-width:46rem}
.row{display:flex;flex-wrap:wrap;gap:.4rem 1.5rem;padding:.9rem 0;border-bottom:1px solid var(--line)}
dt{font-weight:700;min-width:10rem;margin:0}
dd{margin:0;color:var(--fg-muted);flex:1 1 14rem}
details{border-bottom:1px solid var(--line);padding:1rem 0;max-width:46rem}
summary{cursor:pointer;font-weight:700}
details p{margin:.75rem 0 0;color:var(--fg-muted)}

/* ---- closer ------------------------------------------------------------- */
.closer{max-width:44rem;margin:0 auto;text-align:center}
.closer .lede{margin-inline:auto}
.closer .cta-row{justify-content:center}

@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();
