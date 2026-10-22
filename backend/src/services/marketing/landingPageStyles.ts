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
/* Roboto is the brand typeface - colaberry/tokens/fonts.css reads "Brand spec: Roboto
   (display + body)" - and the woff2 is already in this repo under Apache-2.0, so this is a
   copy to a public path rather than a new dependency. font-display swap keeps the page
   the font arrives; the old stack stays as the fallback and is still what renders if the
   request fails. */
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 var(--font-body)}
img{max-width:100%;height:auto;display:block}
a{color:inherit}

/* ---- bands ------------------------------------------------------------ */
.band{padding-block:clamp(3rem,7vw,5.5rem)}
.band--subtle{background:var(--bg-elevated)}
.band--inverse{background:var(--contrast-bg,#1A1A1A);color:var(--contrast-fg,#FFFFFF)}
.band--accent{background:var(--accent-deep);color:var(--accent-contrast)}
.band--cool{background:var(--bg-cool)}
.band--cool h2{color:var(--accent-3)}

/* A COMPONENT THAT PAINTS ITS OWN LIGHT SURFACE MUST ALSO SET ITS OWN FOREGROUND.
 *
 * Inheriting the colour reads fine on a light band and goes INVISIBLE on band--inverse,
 * which sets color:#FFFFFF for the band. That shipped: the live page rendered a contrast
 * card inside the dark band with four blank chips - white text on a near-white chip - and
 * every unit test passed, because the fixture only ever placed contrast on a light section.
 * The older components (panel, cards, steps, tiles) each have their own band--inverse
 * override; the ones added in renderer v2 had none.
 *
 * Setting colour beside background is the rule that makes a component safe in ANY band,
 * rather than one more override to remember for each new one. landingPageStyles.test.ts
 * enforces it. */
.contrast-card,.chips li,.callout,.gridlist,.sidecard,.stat,blockquote{color:var(--fg)}
.band--hero{padding-block:clamp(3rem,8vw,6rem)}
.band--joined{padding-top:0}
.inner{max-width:68rem;margin:0 auto;padding-inline:1.25rem}

/* ---- header / footer --------------------------------------------------- */
.site-head{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:var(--head-bg,rgba(255,255,255,.93));backdrop-filter:saturate(1.6) blur(8px);border-bottom:1px solid var(--line)}
.site-head .inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-block:.7rem}
.brand{display:flex;align-items:center;gap:.55rem;text-decoration:none;font-weight:700;letter-spacing:-.01em;color:var(--fg)}
.brand img{height:30px;width:auto}
.site-foot{background:var(--contrast-bg,#1A1A1A);color:var(--contrast-fg,#FFFFFF);padding-block:2.5rem}
.site-foot .inner{display:flex;flex-wrap:wrap;gap:1rem 2rem;align-items:center;justify-content:space-between}
.foot-logo{height:26px;width:auto}
.foot-mark{font-weight:700;font-size:1.1rem;letter-spacing:-.01em}
.foot-note{color:var(--contrast-muted,#B4B4B4);font-size:.85rem;margin:0}

/* ---- type -------------------------------------------------------------- */
h1{font-size:clamp(2.1rem,5.4vw,3.5rem);line-height:1.07;letter-spacing:-.025em;margin:0 0 1.1rem;text-wrap:balance;font-weight:800;font-family:var(--font-heading)}
h2{font-size:clamp(1.6rem,3.4vw,2.35rem);line-height:1.14;letter-spacing:-.02em;margin:0 0 1rem;text-wrap:balance;font-weight:800;font-family:var(--font-heading)}
p{margin:0 0 1rem}
/* Small text in the brand colour is darkened toward black for contrast. Colaberry cherry
   #FB2832 measures 3.86:1 on white - fine for a 3.5rem headline (AA large needs 3:1), under the
   4.5:1 AA floor for a .74rem label. Declared twice: a browser without color-mix keeps the plain
   accent, so this degrades to the brand colour rather than to nothing. Surfaces (the buttons, the
   closing band) keep the undarkened brand red - that is a brand decision, not a CSS one. */
.eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);margin:0 0 .85rem}
/* Blue on light, green on dark: the other two logo colours, so a page is not one hue. */
.eyebrow{color:var(--accent-3)}
.band--inverse .eyebrow{color:var(--accent-2-on-dark,var(--accent-2));opacity:1}
.band--accent .eyebrow{color:currentColor;opacity:.8}
/* The hero eyebrow is a pill with a dot rather than bare small caps. */
.s-hero .eyebrow{display:inline-flex;align-items:center;gap:.45rem;background:var(--accent-soft);
  border:1px solid var(--line);border-radius:999px;padding:.3rem .8rem;margin-bottom:1rem}
.s-hero .eyebrow::before{content:"";width:.45rem;height:.45rem;border-radius:50%;background:var(--accent-2)}
.hl{color:var(--accent)}
/* The accent SURVIVES on the dark band. Cherry on #1A1A1A measures above the 3:1 AA-large
   floor, and these are display sizes only - h1 and h2 - never body text. On the brand-coloured
   band it still inherits, because accent-on-accent is invisible. */
.band--inverse h1 .hl,.band--inverse h2 .hl{color:var(--accent-on-dark,var(--accent))}
.band--accent .hl{color:inherit}
.em{font-style:normal;font-weight:700;color:var(--accent-3)}
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
.band--subtle .panel{background:var(--surface-raised,#FFFFFF)}
.band--inverse .panel{background:var(--contrast-raised,#2B2B2B);border-color:var(--contrast-line,#3A3A3A)}
.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.9rem}
.panel-eyebrow{font-size:.68rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;
  color:var(--accent-3);margin:0 0 .25rem}
.panel-title{font-size:1.05rem;font-weight:700;margin:0}
.panel-badge{flex:0 0 auto;font-size:.72rem;font-weight:700;padding:.2rem .6rem;border-radius:999px;
  background:var(--ok-wash,#F1F9EA);color:var(--ok-ink,#468A2E)}
.pmark{flex:0 0 auto;display:inline-grid;place-items:center;width:1.3rem;height:1.3rem;border-radius:50%;
  border:1.5px solid var(--line);font-size:.7rem;font-weight:700;color:var(--fg-muted)}
.pmark--start{background:var(--accent-2);border-color:var(--accent-2);color:var(--accent-contrast)}
.panel-foot{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-top:1rem;padding-top:.85rem;
  border-top:1px solid var(--line)}
.panel-foot-l{font-size:.78rem;font-weight:700;color:var(--fg-muted)}
.panel-count{font-size:.78rem;font-variant-numeric:tabular-nums;color:var(--fg-muted);margin-left:auto}
.panel-bar{display:flex;gap:3px;width:100%}
.seg{flex:1;height:4px;border-radius:2px;background:var(--line)}
.seg--on{background:var(--accent-2)}
.panel-note-l{margin:.6rem 0 0;font-size:.8rem;color:var(--fg-muted)}
.band--inverse .panel-title{color:var(--contrast-muted,#D8D8D8)}
.panel-list{list-style:none;margin:0;padding:0;display:grid;gap:.1rem}
/* Rows wrap rather than collide: the label takes the space it needs and the note drops
   beneath it on a narrow panel instead of being squeezed to one character per line. */
.panel-list li{display:flex;flex-wrap:wrap;gap:.5rem .75rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--line)}
.panel-list .panel-note{margin-left:auto}
.band--inverse .panel-list li{border-color:var(--contrast-line,#3A3A3A)}
.panel-list li:last-child{border-bottom:0}
.panel-label{font-weight:500;min-width:0;flex:1}
.panel-note{font-size:.8rem;color:var(--fg-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.band--inverse .panel-note{color:var(--contrast-muted,#D8D8D8)}
.panel-foot{margin:.9rem 0 0;font-size:.82rem;color:var(--fg-muted)}
.band--inverse .panel-foot{color:var(--contrast-muted,#D8D8D8)}

.pills{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;padding:0;margin:1.4rem 0 0}
.pills li{background:var(--accent-soft);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:.35rem .85rem;font-size:.85rem;font-weight:600}

/* ---- buttons ----------------------------------------------------------- */
.cta-row{margin-top:1.8rem;display:flex;flex-wrap:wrap;gap:.75rem}
.cta{display:inline-flex;align-items:center;gap:.5rem;background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.6rem;border-radius:.5rem;text-decoration:none;font-weight:700;line-height:1.2;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.cta:hover{filter:brightness(1.07)}
.cta,.cta-sm{border-radius:999px}
.cta-note{margin:.7rem 0 0;font-size:.85rem;color:var(--fg-muted)}
.band--accent .cta-note{color:currentColor;opacity:.85}
.hero-kicker{font-weight:700;color:var(--accent-3);margin:.9rem 0 0;max-width:40rem}
.closer-sub{font-weight:700;font-size:1.05rem;margin:0 0 .5rem}
.items-label{font-weight:700;font-size:.92rem;margin:0 0 .8rem}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cta-arrow{transition:transform .15s ease}
.cta:hover .cta-arrow{transform:translateX(3px)}
.cta-secondary{background:transparent;color:var(--accent);border:1.5px solid var(--accent);box-shadow:none}
.band--accent .cta{background:var(--accent-contrast);color:var(--accent)}
.cta-sm{padding:.55rem 1.1rem;font-size:.9rem}
/* Every link, not only the buttons. A link inside prose was reachable by keyboard and gave no
   sign of where focus was. */
a:focus-visible,.cta:focus-visible,details summary:focus-visible,.brand:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.band--accent .cta:focus-visible{outline-color:var(--accent-contrast)}

/* ---- bullets: cards / checks / steps ------------------------------------ */
.cards,.checks,.steps{list-style:none;padding:0;margin:0}
.cards{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
/* No red top border: the reference cards are plain white with a hairline and a soft shadow,
   and the colour arrives on the icon tile instead. */
.cards li{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;
  padding:1.15rem 1.25rem;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.tile{display:inline-grid;place-items:center;width:2.1rem;height:2.1rem;border-radius:.55rem;margin-bottom:.7rem}
.tile-i{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.tile--a{background:var(--accent-soft);color:color-mix(in srgb,var(--accent) 80%,#000)}
.tile--b{background:var(--tile-wash-b,#EAF2F6);color:var(--accent-3)}
.tile--c{background:var(--tile-wash-c,#F1F9EA);color:var(--tile-ink-c,#468A2E)}
.band--inverse .tile--a,.band--inverse .tile--b,.band--inverse .tile--c{background:var(--contrast-raised,#333);color:var(--contrast-fg,#fff)}
.band--subtle .cards li{background:var(--surface-raised,#FFFFFF)}
.band--inverse .cards li{background:var(--contrast-raised,#2B2B2B);border-color:var(--contrast-line,#3A3A3A)}
.checks{display:grid;gap:.85rem;max-width:46rem}
.checks{gap:1.1rem}
.checks li{display:flex;gap:.7rem;align-items:flex-start}
/* A qualifying list is read, not scanned: bold on every row removes the emphasis it is for. */
.checks .b-label{font-weight:400}
.tick{color:var(--accent-2)}
.tick{width:1.3rem;height:1.3rem;flex:0 0 auto;margin-top:.14rem;color:#5BA63C}
.steps{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.steps li{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.15rem 1.25rem}
/* One bordered block with hairlines between cells - not eight shadowed cards, which would
   read as eight products rather than one sequence. */
.gridlist{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line);
  border-radius:.6rem;overflow:hidden;background:var(--bg)}
.gridlist li{padding:1rem 1.1rem;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.gridlist li:nth-child(4n){border-right:0}
.gridlist li:nth-last-child(-n+4){border-bottom:0}
@media (max-width:62rem){.gridlist{grid-template-columns:repeat(2,minmax(0,1fr))}
  .gridlist li:nth-child(4n){border-right:1px solid var(--line)}
  .gridlist li:nth-child(2n){border-right:0}
  .gridlist li:nth-last-child(-n+4){border-bottom:1px solid var(--line)}
  .gridlist li:nth-last-child(-n+2){border-bottom:0}}
@media (max-width:40rem){.gridlist{grid-template-columns:minmax(0,1fr)}
  .gridlist li{border-right:0;border-bottom:1px solid var(--line)}
  .gridlist li:last-child{border-bottom:0}}
.grid-n{display:block;font-size:.72rem;font-weight:800;color:var(--accent);
  font-variant-numeric:tabular-nums;margin-bottom:.35rem}
/* Step rules cycle the three logo colours. */
.steps li{position:relative;padding-top:1.4rem}
.steps li::before{content:"";position:absolute;top:1.15rem;left:1.25rem;width:1.5rem;height:3px;border-radius:2px;background:var(--accent)}
.steps li:nth-child(3n+2)::before{background:var(--accent-2)}
.steps li:nth-child(3n)::before{background:var(--accent-3)}
.steps li:nth-child(3n+2) .step-n{color:var(--accent-2)}
.steps li:nth-child(3n) .step-n{color:var(--accent-3)}
.band--inverse .steps li{background:var(--contrast-raised,#2A2A2A);border-color:var(--contrast-line,#3A3A3A)}
.band--subtle .steps li{background:var(--surface-raised,#FFFFFF)}
.band--inverse .steps li{background:var(--contrast-raised,#2B2B2B);border-color:var(--contrast-line,#3A3A3A)}
.step-n{display:block;font-size:.78rem;font-weight:800;letter-spacing:.08em;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);margin-bottom:.4rem;font-variant-numeric:tabular-nums}
.b-label{display:block;font-weight:700}
.b-detail{display:block;color:var(--fg-muted);margin-top:.25rem;font-size:.95rem}
.band--inverse .b-detail,.band--accent .b-detail{color:var(--contrast-muted,#D8D8D8)}

/* ---- stats / quote / details / faq -------------------------------------- */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1.25rem}
.stat{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.3rem}
.band--subtle .stat{background:var(--surface-raised,#FFFFFF)}
.stat-value{display:block;font-size:2.2rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.05;color:var(--accent)}
.stat-label{display:block;margin-top:.3rem;font-weight:600}
.stat-source{display:block;margin-top:.55rem;font-size:.78rem;color:var(--fg-muted)}
blockquote{margin:0 0 1.25rem;padding:1.4rem 1.5rem;background:var(--bg);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:0 .6rem .6rem 0;max-width:46rem}
.band--subtle blockquote{background:var(--surface-raised,#FFFFFF)}
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

/* ---- contrast: today, then what becomes possible ----------------------- */
.contrast{display:grid;gap:.75rem;justify-items:stretch}
.contrast-card{background:var(--bg-elevated);border:1px solid var(--line);border-radius:.75rem;padding:1.1rem 1.2rem}
.contrast-title{font-size:.9rem;font-weight:600;margin:0 0 .8rem}
.chips{list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;padding:0;margin:0}
@media (max-width:30rem){.chips{grid-template-columns:minmax(0,1fr)}}
.chips li{background:var(--bg);border:1px solid var(--line);border-radius:.45rem;padding:.5rem .7rem;font-size:.85rem}
.contrast-cap{margin:.8rem 0 0;font-size:.82rem;color:var(--fg-muted)}
.contrast-arrow{text-align:center;color:var(--fg-muted);font-size:1.1rem;line-height:1}
.contrast-result{background:var(--contrast-bg,#1A1A1A);color:var(--contrast-fg,#fff);border-radius:.75rem;padding:1.1rem 1.2rem}
.contrast-result .eyebrow{color:var(--accent-2);margin-bottom:.4rem}
.contrast-line{margin:0;font-weight:700;font-size:1.02rem}

/* ---- callout: the one-line takeaway under a list ----------------------- */
.callout{display:flex;flex-wrap:wrap;gap:.4rem 1.5rem;align-items:baseline;margin-top:1.25rem;
  background:var(--bg);border:1px solid var(--line);border-radius:.6rem;padding:.9rem 1.1rem}
.band--subtle .callout{background:var(--surface-raised,#FFFFFF)}
.band--subtle .callout--success{background:var(--ok-wash,#F1F9EA)}
.callout-lead{color:var(--fg-muted);font-size:.9rem}
.callout-text{font-weight:700;margin-left:auto}
@media (max-width:48rem){.callout-text{margin-left:0}}
.callout--success{background:var(--ok-wash,#F1F9EA);border-color:var(--ok-line,#DEF0CC)}
.callout--success .callout-lead{color:var(--ok-ink,#356A24);font-weight:700}
.callout--success .callout-text{font-weight:400;color:var(--ok-ink,#356A24)}
.c-accent{color:color-mix(in srgb,var(--accent) 80%,#000)}
.c-accent-2{color:#468A2E}
.c-accent-3{color:var(--accent-3)}

/* ---- side card beside prose -------------------------------------------- */
.sidecard{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.2rem 1.3rem;
  box-shadow:0 1px 2px rgba(0,0,0,.04)}
.sidecard-title{font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--fg-muted);margin:0 0 .85rem}
.sidecard-list{list-style:none;margin:0;padding:0;display:grid;gap:.7rem}
.sidecard-list li{display:flex;gap:.6rem;align-items:baseline;font-size:.92rem}
.dot{flex:0 0 auto;width:.45rem;height:.45rem;border-radius:1px;background:var(--accent)}
.dot--b{background:var(--accent-2)}
.dot--c{background:var(--accent-3)}

/* ---- closer ------------------------------------------------------------- */
.closer{max-width:44rem;margin:0 auto;text-align:center}
.closer .lede{margin-inline:auto}
.closer .cta-row{justify-content:center}

@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();
