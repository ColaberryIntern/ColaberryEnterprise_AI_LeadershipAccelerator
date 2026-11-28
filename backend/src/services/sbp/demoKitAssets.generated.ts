/* GENERATED FILE - DO NOT EDIT BY HAND.
 *
 * Source of truth: backend/src/services/sbp/demoKitAssets/
 * Regenerate:      node scripts/generateDemoKitAssets.js
 * Verified by:     demoKit.drift.test.ts (fails CI if this file is stale)
 *
 * Inlined rather than read at runtime because `tsc` does not copy non-TS files into dist/
 * and adding a Dockerfile COPY is ESCALATE-tier in this run's execution contract.
 */

/** `demoKitAssets/index.html` with demoVisual/*.ts inlined at its marker. */
export const DEMO_KIT_ENGINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connected demo</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap">
<style>
/*
 * Connected Demo engine. ONE file, no build step, no network beyond the font.
 * It renders whatever demo-spec.json describes. Nothing about any one project
 * lives in this file: to change what the demo shows, change the spec.
 * The only brand lever is --accent, which the spec sets (app.accent).
 * Layout idea: dark rail of navigation on the left, one working surface on the right,
 * a permanent strip on top that says this is sample data.
 */
:root {
  color-scheme: light;
  --accent: #0F766E;
  --accent-ink: #FFFFFF;
  --rail: color-mix(in srgb, var(--accent) 34%, #0A1513);
  --rail-hi: color-mix(in srgb, var(--accent) 52%, #0A1513);
  --rail-text: #D7E4E1;
  --rail-muted: #A9C2BD;
  --ground: #F4F6F5;
  --surface: #FFFFFF;
  --ink: #12211F;
  --muted: #55635F;
  --line: #DDE3E1;
  --wash: #EEF1F0;
  --ok-bg: color-mix(in srgb, var(--accent) 14%, #FFFFFF);
  --ok-ink: color-mix(in srgb, var(--accent) 78%, #000000);
  --att: #B45309;
  --att-bg: #FDF1E3;
  --att-ink: #7C3A06;
  --att-line: #F3D3AC;
  /* A failed or reverted action needs a tone of its own. Reusing the amber
     "attention" tone for it would make "a person must look at this" and "this
     did not happen" look identical, which is the confusion the trust standard
     exists to prevent. */
  --bad-bg: #FEF3F2;
  --bad-ink: #912018;
  --live-bg: #EEF4FF;
  --live-ink: #1F3A8A;
  --demo: #3B2A78;
  --display: "Space Grotesk", Inter, system-ui, sans-serif;
  --body: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 14px/1.45 var(--body); }
a { color: var(--accent); }
a:hover { color: var(--ok-ink); }
:focus-visible { outline: 3px solid var(--att); outline-offset: 2px; border-radius: 4px; }
h1, h2, h3 { font-family: var(--display); font-weight: 600; margin: 0; text-wrap: balance; }
h1 { font-size: 28px; letter-spacing: -0.02em; }
h2 { font-size: 18px; }
p { margin: 0; }

.demo-strip { background: var(--demo); color: #FFFFFF; display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; justify-content: space-between; padding: 8px 16px; font-size: 13px; }
.demo-strip strong { letter-spacing: 0.06em; }
.demo-strip .right { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
.demo-strip a { color: #FFFFFF; }
.demo-strip button { font: inherit; color: #FFFFFF; background: transparent; border: 1px solid #B7A9E6; border-radius: 6px; min-height: 32px; padding: 0 10px; cursor: pointer; }
.demo-strip code { font-size: 12px; color: #E2DBFA; }

.shell { display: flex; flex-wrap: wrap; min-height: calc(100% - 48px); }
.rail { flex: 1 1 232px; background: var(--rail); color: var(--rail-text); padding: 20px 14px; display: flex; flex-direction: column; gap: 22px; }
.brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; color: #FFFFFF; text-decoration: none; font: 600 19px var(--display); }
.brand:hover { color: #FFFFFF; }
.brand .mark { width: 28px; height: 28px; border-radius: 7px; background: color-mix(in srgb, var(--accent) 55%, #FFFFFF); color: var(--rail); display: grid; place-items: center; font-size: 16px; font-weight: 700; }
.nav-group { display: flex; flex-direction: column; gap: 2px; }
.navbox { display: flex; flex-direction: column; gap: 22px; }
.navbox > summary { display: none; }
.navbox > .navlist { display: flex; flex-direction: column; gap: 22px; }
.nav-label { padding: 0 10px 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--rail-muted); }
.nav a { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 10px; border-radius: 8px; color: var(--rail-text); text-decoration: none; font-weight: 500; }
.nav a:hover { background: var(--rail-hi); color: #FFFFFF; }
.nav a[aria-current="page"] { background: var(--rail-hi); color: #FFFFFF; font-weight: 600; }
.nav a .lbl { flex: 1; }
.nav .badge { min-width: 22px; padding: 1px 7px; border-radius: 11px; background: #FFD9A8; color: #5A2A03; font-size: 12px; font-weight: 700; text-align: center; }
.nav .count { font-size: 12px; color: var(--rail-muted); }
.rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: 12px; }
.conn { padding: 12px; border-radius: 10px; background: color-mix(in srgb, var(--rail) 80%, #FFFFFF 6%); display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.conn b { color: #FFFFFF; }
.conn div { display: flex; align-items: center; gap: 8px; }
.conn i { width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--rail-muted); }
.persona { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.persona .av { width: 34px; height: 34px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 55%, #FFFFFF); color: var(--rail); display: grid; place-items: center; font-weight: 700; }
.persona b { display: block; color: #FFFFFF; }
.persona span { font-size: 12px; color: var(--rail-muted); }

main { flex: 999 1 560px; min-width: 0; padding: 28px 32px 48px; }
.page { max-width: 1160px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
.head { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; justify-content: space-between; }
.head p, .lede { color: var(--muted); max-width: 68ch; }
.crumbs { display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); }
.crumbs a { font-weight: 600; }
.from { font-size: 12px; color: var(--muted); }

.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.card.pad { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.card.att { border-color: var(--att-line); }
.card-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.card-head a { font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
.cols { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
.cols > .wide { flex: 2 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
.cols > .narrow { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 14px; }
.tile { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.tile:hover { border-color: var(--accent); color: var(--ink); }
.tile .n { font: 600 34px/1 var(--display); font-variant-numeric: tabular-nums; }
.tile span span { color: var(--muted); display: block; }
.tile.att { background: var(--att-bg); border-color: var(--att-line); color: var(--att-ink); }
.tile.att span span { color: var(--att-ink); }

.pill { display: inline-block; padding: 3px 10px; border-radius: 12px; background: var(--wash); color: #3D4A47; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pill.ok { background: var(--ok-bg); color: var(--ok-ink); }
.pill.attention { background: var(--att-bg); color: var(--att-ink); }
.pill.strong { background: var(--ink); color: #FFFFFF; }
.who { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid var(--line); color: #3D4A47; background: var(--surface); }
.who.human { border-color: var(--att-line); color: var(--att-ink); background: var(--att-bg); }

.scroll { overflow-x: auto; }
table { width: 100%; min-width: 560px; border-collapse: collapse; text-align: left; }
th { padding: 10px 12px; font-size: 12px; font-weight: 600; color: #3D4A47; background: var(--ground); white-space: nowrap; }
td { padding: 13px 12px; border-top: 1px solid var(--line); vertical-align: middle; }
th:first-child, td:first-child { padding-left: 20px; }
th:last-child, td:last-child { padding-right: 20px; }
td.title { font-weight: 600; white-space: nowrap; }
td.title a { display: inline-flex; align-items: center; min-height: 32px; }
.num { font-variant-numeric: tabular-nums; }
.meter { display: flex; align-items: center; gap: 10px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.meter .track { width: 110px; height: 8px; border-radius: 4px; background: var(--wash); }
.meter .fill { height: 8px; border-radius: 4px; background: var(--accent); }
.meter.over .fill { background: var(--att); }
.private { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.empty { padding: 18px 20px; color: var(--muted); }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { min-height: 44px; padding: 0 16px; border: 1px solid #C5CECB; border-radius: 22px; background: var(--surface); color: var(--ink); font: 500 14px var(--body); cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--rail); border-color: var(--rail); color: #FFFFFF; font-weight: 600; }
.btn { min-height: 44px; padding: 0 18px; border-radius: 8px; border: 1px solid #C5CECB; background: var(--surface); color: var(--ink); font: 600 14px var(--body); cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn:hover { filter: brightness(0.96); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
dl.facts { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 10px 16px; }
dl.facts dt { color: var(--muted); }
dl.facts dd { margin: 0; min-width: 0; }

.feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.feed li { display: flex; gap: 12px; }
.feed time { flex: 0 0 62px; font-size: 12px; color: var(--muted); padding-top: 2px; font-variant-numeric: tabular-nums; }
.feed .meta { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; margin-top: 4px; font-size: 12px; color: var(--muted); }

.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 22px; align-items: start; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.agent { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.agent h3 { font-size: 15px; }
.agent .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.agent small { color: var(--muted); font-size: 12px; }
.note { font-size: 12px; color: var(--muted); }
.toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); max-width: min(560px, calc(100% - 32px)); background: var(--ink); color: #FFFFFF; padding: 12px 16px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
.toast:empty { display: none; }
/* ---- trust timeline -----------------------------------------------------
 * One row per action, from the spec's \`events\` array. Every row answers,
 * without a click: who acted, which human owns it, what state the action is
 * actually in, how much autonomy it had, whether a person approved it, what
 * evidence backs it, and whether it can be undone.
 * The status pill is the load-bearing part. An action that failed must never
 * read as one that worked, so failed and reverted get their own tone rather
 * than sharing amber with "waiting on a person".
 */
.tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tl > li { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 0 14px; padding: 16px 0; border-top: 1px solid var(--line); }
.tl > li:first-child { border-top: 0; padding-top: 0; }
.tl time { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; padding-top: 3px; }
.tl .what { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
/* The longest tier label ("A3 · acted alone, a person can undo it") is wider than a 320px
   screen's timeline column; let it wrap between words instead of spilling out (v12). */
.tl .what .pill { white-space: normal; max-width: 100%; }
.tl .what b { font-size: 14px; font-weight: 600; }
.tl .why { margin-top: 6px; color: var(--muted); }
/* \`.actor\`, NOT \`.who\`: \`.who\` is already the engine's uppercase bordered agent/person badge
   (see above). Reusing the name inherited its text-transform and weight, so every actor line
   rendered as a shouting all-caps bar that outcompeted the status pill it sits under. A
   collision patched with more overrides is a collision waiting to come back. */
.tl .actor { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--muted); }
.tl .actor b { color: var(--ink); font-weight: 600; }
.tl .refs { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px 8px; font-size: 12px; color: var(--muted); align-items: center; }
.tl .refs code { background: var(--wash); border-radius: 4px; padding: 1px 6px; font-size: 11px; overflow-wrap: anywhere; }
/* Evidence references are one unbroken token ("agency_message/northwindagency…"); at 320px v13's
   pushed the Trust screen into a sideways scroll. They may break anywhere. */
.tl .unverified { color: var(--att-ink); font-weight: 600; }
.pill.danger { background: var(--bad-bg); color: var(--bad-ink); }
.pill.live { background: var(--live-bg); color: var(--live-ink); }
.pill.faded { background: var(--wash); color: var(--muted); }
.pill.tier { background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
.err { margin: 40px auto; max-width: 640px; padding: 20px; background: var(--att-bg); color: var(--att-ink); border: 1px solid var(--att-line); border-radius: 12px; }
@media (max-width: 640px) {
  main { padding: 20px 16px 40px; }
  .rail { gap: 8px; padding: 12px; }
  .nav-label, .rail-foot { display: none; }
  /* Phone: the menu folds behind one button that names the page you are on. */
  .navbox > summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 8px; background: var(--rail-hi); color: #FFFFFF; font-weight: 600; cursor: pointer; list-style: none; }
  .navbox > summary::-webkit-details-marker { display: none; }
  .navbox > summary::after { content: '\\25BE'; font-size: 14px; }
  .navbox[open] > summary::after { content: '\\25B4'; }
  .navbox > summary .here { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .navbox > .navlist { gap: 6px; padding-top: 6px; }
  /* Phone: each row is a card of label and value, so nothing scrolls sideways. */
  .scroll { overflow-x: visible; }
  /* Blocks, not table layout: a table sizes itself to its widest cell and pushes past the screen. */
  table, tbody { display: block; width: 100%; min-width: 0; }
  thead { display: none; }
  tbody tr { display: block; padding: 10px 0; border-top: 1px solid var(--line); }
  tbody tr:first-child { border-top: 0; }
  td { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 5px 16px; border-top: 0; text-align: right; overflow-wrap: anywhere; }
  td::before { content: attr(data-label); flex: 0 1 auto; max-width: 45%; color: var(--muted); font-size: 12px; font-weight: 600; text-align: left; }
  td.title { display: block; text-align: left; font-weight: 600; white-space: normal; }
  td.title::before { content: none; }
  /* Phone: a fact's label sits above its value, so a long label cannot push the value off screen. */
  dl.facts { grid-template-columns: minmax(0, 1fr); gap: 2px 0; }
  dl.facts dd { margin-bottom: 10px; overflow-wrap: anywhere; }
}
@media (prefers-reduced-motion: no-preference) { .tile, .nav a, .btn { transition: background-color .12s, border-color .12s; } }

/* ---------------------------------------------------------------- the visual layer
 *
 * Series colours are SEPARATE from status colours on purpose: a bar coloured like a warning
 * teaches the reader that length means danger. Status keeps the amber and red tones and always
 * carries a word as well, so the meaning survives a colour-blind reader and a greyscale print.
 */
:root {
  --series: color-mix(in srgb, var(--accent) 72%, #2F6FB5);
  --series-soft: color-mix(in srgb, var(--accent) 18%, #FFFFFF);
  --grid: color-mix(in srgb, var(--line) 70%, #FFFFFF);
  --now: #B45309;
  --chart-ink: var(--ink);
  --chart-muted: var(--muted);
}
.chart { padding: 16px 18px 14px; }
.chart-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0 0 10px; }
.chart-head h3 { font: 600 15px/1.3 var(--display); margin: 0; letter-spacing: -.01em; }
.chart-head p { margin: 0; color: var(--chart-muted); font-size: 12.5px; }
/* Charts scroll inside their own box so the PAGE never scrolls sideways at 380px. */
.scroller { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
.scroller > svg { display: block; width: 100%; min-width: 520px; height: auto; }
.cap-note { margin: 8px 0 0; font-size: 12px; color: var(--chart-muted); }

/* timeline */
.lane-label { font: 500 11.5px Inter, system-ui, sans-serif; fill: var(--chart-ink); }
.lane .bar { stroke: var(--series); stroke-width: 7; stroke-linecap: round; opacity: .42; }
.lane.bad .bar { stroke: var(--bad-ink); opacity: .34; }
.mk circle { fill: var(--surface); stroke: var(--series); stroke-width: 2; }
.mk.bad circle { stroke: var(--bad-ink); }
.mk text { font: 600 9px Inter, system-ui, sans-serif; fill: var(--chart-ink); text-anchor: middle; }
.tick line { stroke: var(--grid); stroke-width: 1; }
.tick text { font: 10px Inter, system-ui, sans-serif; fill: var(--chart-muted); }
.nowline line { stroke: var(--now); stroke-width: 1.5; }
.nowline text { font: 600 10px Inter, system-ui, sans-serif; fill: var(--now); }

/* a value against its target */
.vbar { display: flex; align-items: center; gap: 8px; min-width: 150px; }
.vbar .track { position: relative; flex: 1; height: 7px; border-radius: 4px; background: var(--wash); overflow: visible; }
.vbar .fill { height: 100%; border-radius: 4px; background: var(--series); }
.vbar.warn .fill { background: var(--att); }
.vbar.over .fill { background: var(--bad-ink); }
.vbar .limit { position: absolute; top: -3px; width: 2px; height: 13px; background: var(--chart-ink); opacity: .55; }
.vbar .val { font-size: 12px; white-space: nowrap; color: var(--chart-ink); }
.vbar .of { color: var(--chart-muted); }
.vbar .flag { margin-left: 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--bad-ink); }

/* comparison bars */
.limit-key { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--chart-muted); margin-bottom: 8px; }
.limit-key i { width: 2px; height: 12px; background: var(--chart-ink); opacity: .55; }
.bars { display: grid; gap: 6px; }
.brow { display: grid; grid-template-columns: minmax(90px, 30%) 1fr auto; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
.brow .lbl { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brow .track { height: 14px; border-radius: 4px; background: var(--wash); }
.brow .fill { display: block; height: 100%; border-radius: 4px; background: var(--series); }
.brow.over .fill { background: var(--att); }
.brow .val { font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--chart-ink); }
.brow:hover .track { outline: 2px solid var(--series-soft); }

/* funnel */
.funnel { display: grid; gap: 6px; }
.stage { display: grid; grid-template-columns: minmax(80px, 28%) 1fr auto; align-items: center; gap: 10px; }
.stage .lbl { font-size: 12.5px; }
.stage .track { height: 16px; border-radius: 4px; background: var(--wash); }
.stage .fill { height: 100%; border-radius: 4px; background: var(--series); opacity: .85; }
.stage .val { font-size: 12.5px; font-variant-numeric: tabular-nums; }

/* path of steps */
.steps-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.steps-key { font: 600 11px Inter, system-ui, sans-serif; color: var(--chart-muted); min-width: 56px; }
.steps { display: flex; align-items: center; gap: 6px; }
.step { display: inline-flex; flex-direction: column; border: 1px solid var(--line); border-radius: 8px; padding: 5px 9px; background: var(--surface); white-space: nowrap; }
.step b { font-size: 12px; font-weight: 600; }
.step small { font-size: 10.5px; color: var(--chart-muted); }
.step.failed { border-color: var(--bad-ink); background: var(--bad-bg); }
.step.executing { border-color: var(--att-line); background: var(--att-bg); }
.gap { font-size: 10.5px; color: var(--chart-muted); white-space: nowrap; }

/* decisions */
.dcards { display: grid; gap: 10px; }
.dcard { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: var(--surface); }
.dhead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.dhead h3 { font: 600 14px/1.3 var(--display); margin: 0 0 6px; }
.dcard .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 14px; margin: 6px 0 10px; }
.dcard .fact dt { font-size: 11px; color: var(--chart-muted); margin: 0; }
.dcard .fact dd { font-size: 12.5px; margin: 0; }
.dact { display: flex; gap: 8px; flex-wrap: wrap; }

/* who did what */
.tierbar { display: flex; height: 18px; border-radius: 5px; overflow: hidden; margin-bottom: 10px; }
.tierbar .seg { display: flex; align-items: center; justify-content: center; background: var(--series); opacity: .9; }
.tierbar .seg + .seg { margin-left: 2px; }
.tierbar .seg b { font: 600 10px Inter, system-ui, sans-serif; color: #fff; }
.tierbar .tA0 { opacity: .35; } .tierbar .tA1 { opacity: .5; } .tierbar .tA2 { opacity: .68; }
.tierbar .tA3 { opacity: .84; } .tierbar .tA4 { opacity: 1; }
.actors { display: grid; gap: 6px; }
.actor { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
.actor .n { color: var(--chart-muted); }
.chip-s { font-size: 11px; border-radius: 999px; padding: 1px 8px; background: var(--wash); }
.chip-s.att { background: var(--att-bg); color: var(--att-ink); }
.chip-s.bad { background: var(--bad-bg); color: var(--bad-ink); }

@media (max-width: 420px) {
  .brow, .stage { grid-template-columns: 1fr auto; }
  .brow .lbl, .stage .lbl { grid-column: 1 / -1; }
  .chart { padding: 14px; }
}

/*
 * Dark, defined once over the same variables the light theme uses, so every surface and every
 * chart moves together. The rail is already accent-derived and dark in both.
 */
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --ground: #0D1413; --surface: #141D1B; --ink: #E8EFED; --muted: #9FB2AE;
    --line: #26332F; --wash: #1B2522;
    --ok-bg: color-mix(in srgb, var(--accent) 26%, #0D1413);
    --ok-ink: color-mix(in srgb, var(--accent) 40%, #FFFFFF);
    --att: #E59A3C; --att-bg: #2B1F0E; --att-ink: #F3C98B; --att-line: #4A361A;
    --bad-bg: #2A1414; --bad-ink: #F2A6A0;
    --live-bg: #121C33; --live-ink: #AFC4F5;
    --grid: #223029; --now: #E59A3C;
    --series: color-mix(in srgb, var(--accent) 52%, #7FB2E8);
    --series-soft: color-mix(in srgb, var(--accent) 30%, #0D1413);
  }
  .step { background: var(--surface); }
  .tierbar .seg b { color: #0D1413; }
}
</style>
</head>
<body>
<!-- The pre-JavaScript state. It carries the banner because this page is served from a public
     link: a viewer with JavaScript off, or one who reads the page before it boots, would
     otherwise see a bare "Loading" with nothing saying what they are looking at is a simulation.
     The wording is bound to the engine's SIMULATED constant by a test, so the two copies cannot
     drift apart. -->
<div id="app"><div class="demo-strip"><span><strong>DEMO</strong> · Simulated, not live. Sample data only. Nothing here was produced by the real system.</span><span class="right"></span></div><p class="err">Loading the demo…</p></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<!-- The spec. Left empty here: the engine then fetches demo-spec.json from beside this file.
     tools/build-standalone.mjs writes the spec into this tag so the page opens with a double-click. -->
<script type="application/json" id="demo-spec">{}</script>

<script>
(function () {
  'use strict';
  var SPEC = null, ROWS = {}, ROUTES = {}, FILTERS = {}, CURRENT = '', PLAN = null;

  /* The visual rules are inlined here at generate time from
   * backend/src/services/sbp/demoVisual/*.ts, which is where they are written, typed and unit
   * tested against six fixtures. They decide WHAT this engine draws; everything below only
   * draws it. The marker is replaced by scripts/lib/inlineVisualRules.js, so this file on disk
   * is the readable half and the shipped constant is the whole. */
  /* GENERATED from backend/src/services/sbp/demoVisual/*.ts by
   * scripts/lib/inlineVisualRules.js. Do not edit here: edit the TypeScript, which is unit
   * tested, and regenerate with \`node scripts/generateDemoKitAssets.js\`. */
  var VISUAL = (function () {
    /**
     * demoVisual/visualRules - the thresholds, caps and vocabulary the visual engine obeys. PURE.
     *
     * ## Why the numbers live here and not in the engine
     *
     * \`directives/demo-visual-rules.md\` is the standing reference a person reads. If the numbers in
     * that document and the numbers in the code are typed twice, they drift, and the document becomes
     * a description of what the engine used to do. These constants are the ones the engine uses and
     * the ones the directive quotes, and \`visualPlan.rules.test.ts\` reads the directive off disk and
     * fails when a number in it no longer matches the constant beside it.
     *
     * ## Why thresholds exist at all
     *
     * The platform generates demos for thousands of projects in domains nobody has seen. A chart
     * drawn from two data points is not an analysis, it is decoration that implies one. Each minimum
     * below is the point beneath which the picture says less than the table it would replace, so
     * beneath it the engine keeps the table. Each cap is the point beyond which the picture stops
     * being readable, so beyond it the engine shows the most attention-worthy items and a way to
     * reach the rest.
     *
     * These are starting values, as the pack that specified them says. They are named so that tuning
     * them is one edit with a test and a directive line attached, rather than a hunt through a 50 KB
     * HTML file.
     */
    /** Minimum work items before a timeline beats a table. One lane is a date, not a timeline. */
    const MIN_TIMELINE_LANES = 2;
    /** Minimum timed events before a timeline is worth drawing, when lanes come from events. */
    const MIN_TIMELINE_EVENTS = 4;
    /** Minimum rows before a bar chart beats reading the numbers. */
    const MIN_BAR_ROWS = 3;
    /** Minimum stages before a funnel is a funnel rather than two numbers. */
    const MIN_FUNNEL_STAGES = 2;
    /** Minimum distinct tiers before a stacked tier bar carries information. */
    const MIN_TIER_SEGMENTS = 2;
    /** Minimum steps before a path of steps beats a sentence. */
    const MIN_PATH_STEPS = 2;
    /** At most this many headline tiles. Beyond six nobody reads the seventh. */
    const MAX_HEADLINE_TILES = 6;
    /** At most this many timeline lanes; the rest are reachable through the table. */
    const MAX_TIMELINE_LANES = 8;
    /** At most this many bars in one comparison. */
    const MAX_BAR_ROWS = 12;
    /** At most this many funnel stages. */
    const MAX_FUNNEL_STAGES = 8;
    /**
     * A text field longer than this is quoted, never charted or truncated into a cell.
     *
     * Applies to the VALUE, not the field name: the same field can be short in one row and a
     * paragraph in another, and the decision is about what is actually there.
     */
    const QUOTE_BLOCK_MIN_CHARS = 120;
    /**
     * Field types the contract defines. Mirrored here because \`screens\` and \`entities\` arrive as
     * \`unknown\` from the Zod schema, so the reader has to decide what it is looking at from strings.
     */
    const FIELD_TYPES = [
        'text', 'date', 'time', 'datetime', 'number', 'enum', 'ref', 'meter', 'bool', 'who', 'private',
    ];
    /** Field types that carry a moment in time, used to find a work item's start and end. */
    const TIME_FIELD_TYPES = ['date', 'time', 'datetime'];
    /**
     * Every visual the plan can ask for. The engine implements exactly these and nothing else, so a
     * new picture is a change here first, which is what keeps the directive able to list them all.
     */
    const VISUAL_KINDS = [
        'timeline',
        'target_bar',
        'status_pills',
        'funnel',
        'step_path',
        'comparison_bars',
        'matrix',
        'decision_cards',
        'actor_summary',
        'quote_block',
    ];
    /**
     * Why a visual was NOT drawn. Carried in the plan rather than dropped, for two reasons: the tests
     * assert the reason (so "no timeline" cannot pass for the wrong cause), and the engine needs to
     * know which fallback to render in that block's place.
     */
    const SKIP_REASONS = [
        'no_candidate_data',
        'below_minimum',
        'no_variation',
        'private_field',
    ];
    /** What the engine draws instead when a visual is skipped. Never "nothing". */
    const FALLBACKS = ['table', 'list', 'facts', 'none'];

    /**
     * demoVisual/specReaders - read the loosely-typed half of a demo spec without trusting it. PURE.
     *
     * ## Why this exists
     *
     * \`DemoSpecSchema\` types \`events\` precisely and then types \`screens\`, \`entities\` and \`nav\` as
     * \`z.record(z.string(), z.unknown())\`. That is deliberate (the shapes are the engine's contract,
     * not the persistence contract) but it means everything the visual rules need to inspect arrives
     * as \`unknown\`, from a document an agent wrote and a student may have edited.
     *
     * So every reader here answers with a narrowed value or omits the thing entirely. None throws.
     * A spec with a malformed entity must still produce a plan for the rest of the spec: refusing the
     * whole demo because one field object is a string would turn a cosmetic flaw into a blank page,
     * and the renderer already has a fallback for every block.
     *
     * ## What it does NOT do
     *
     * It makes no decisions. Nothing here knows what a timeline is or when one is worth drawing;
     * \`visualPlan.ts\` owns that. Keeping the two apart is what lets the rules be tested against hand
     * written shapes without a spec, and the readers against broken specs without a rule in sight.
     */
    function isRecord(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    function str(value) {
        return typeof value === 'string' && value.trim() !== '' ? value : null;
    }
    function num(value) {
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    function readField(key, raw) {
        var _a;
        const r = isRecord(raw) ? raw : {};
        const type = str(r.type);
        return {
            key,
            type: type || null,
            unit: str(r.unit),
            // \`target\` is not in the v1 contract. It is read here because phase 3 adds it as an optional
            // field and a spec that already carries one should get its reference line today.
            max: (_a = num(r.max)) !== null && _a !== void 0 ? _a : num(r.target),
            warn: num(r.warn),
            ref: str(r.ref),
            labels: isRecord(r.labels) ? r.labels : null,
            tones: isRecord(r.tones) ? r.tones : null,
            shownAs: str(r.shown_as),
        };
    }
    function readEntity(key, raw) {
        if (!isRecord(raw))
            return null;
        const fieldsRaw = Array.isArray(raw.fields) ? raw.fields : [];
        const fields = [];
        for (const f of fieldsRaw) {
            const fk = isRecord(f) ? str(f.key) : null;
            if (fk)
                fields.push(readField(fk, f));
        }
        const rows = Array.isArray(raw.rows) ? raw.rows.filter(isRecord) : [];
        const actionsRaw = Array.isArray(raw.actions) ? raw.actions : [];
        const actions = actionsRaw.filter(isRecord).map((a) => ({
            label: str(a.label),
            when: isRecord(a.when) ? a.when : null,
        }));
        return {
            key,
            label: str(raw.label),
            plural: str(raw.plural),
            statusField: str(raw.status),
            columns: Array.isArray(raw.columns) ? raw.columns.filter((c) => typeof c === 'string') : [],
            fields,
            rows: rows,
            actions,
        };
    }
    function entitiesOf(spec) {
        const raw = spec.entities;
        if (!isRecord(raw))
            return [];
        const out = [];
        for (const [key, value] of Object.entries(raw)) {
            const entity = readEntity(key, value);
            if (entity)
                out.push(entity);
        }
        // Sorted by key so the plan is deterministic whatever order the JSONB column came back in.
        return out.sort((a, b) => a.key.localeCompare(b.key));
    }
    function screensOf(spec) {
        const raw = spec.screens;
        if (!isRecord(raw))
            return [];
        const out = [];
        for (const [id, value] of Object.entries(raw)) {
            if (!isRecord(value))
                continue;
            out.push({
                id,
                type: str(value.type),
                title: str(value.title),
                entity: str(value.entity),
                blocks: Array.isArray(value.blocks) ? value.blocks.filter(isRecord) : [],
            });
        }
        return out.sort((a, b) => a.id.localeCompare(b.id));
    }
    /** A field a number can be measured against: a meter, or a number with a stated ceiling. */
    function measuredFields(entity) {
        return entity.fields.filter((f) => f.type !== 'private' && f.max !== null && (f.type === 'meter' || f.type === 'number'));
    }
    /** Numeric fields with no stated ceiling. Compared against each other rather than a target. */
    function plainNumberFields(entity) {
        return entity.fields.filter((f) => f.type === 'number' && f.max === null);
    }
    function enumFields(entity) {
        return entity.fields.filter((f) => f.type === 'enum');
    }
    function refFields(entity) {
        return entity.fields.filter((f) => f.type === 'ref' && f.ref !== null);
    }
    function timeFields(entity) {
        return entity.fields.filter((f) => f.type !== null && TIME_FIELD_TYPES.includes(f.type));
    }
    /**
     * How many rows actually carry a usable number for this field.
     *
     * Counted rather than assumed from \`rows.length\`, because a field declared on an entity is not a
     * field every row fills, and a bar chart of nine rows where four are blank is a chart that lies
     * about its own completeness.
     */
    function rowsWithNumber(entity, fieldKey) {
        return entity.rows.filter((r) => num(r[fieldKey]) !== null).length;
    }
    /** Distinct non-empty values of a field across an entity's rows, in first-seen order. */
    function distinctValues(entity, fieldKey) {
        const seen = [];
        for (const row of entity.rows) {
            const v = row[fieldKey];
            const key = typeof v === 'string' || typeof v === 'number' ? String(v) : null;
            if (key !== null && key !== '' && !seen.includes(key))
                seen.push(key);
        }
        return seen;
    }

    /* ------------------------------------------------------------------ small helpers */
    const byCountDesc = (a, b) => b.n - a.n;
    function latestEventTime(events) {
        let best = null;
        let bestMs = -Infinity;
        for (const e of events) {
            const ms = Date.parse(e.occurred_at);
            // An unparseable timestamp is compared as a string rather than dropped: a spec using a
            // display time is still ordered, just not arithmetically.
            const value = Number.isNaN(ms) ? -Infinity : ms;
            if (value > bestMs || (best === null && Number.isNaN(ms))) {
                if (!Number.isNaN(ms) || best === null) {
                    best = e.occurred_at;
                    bestMs = value;
                }
            }
        }
        return best;
    }
    function cap(items, max) {
        if (items.length <= max)
            return { items, capped: null };
        return { items: items.slice(0, max), capped: { shown: max, total: items.length } };
    }
    /**
     * Which entity is the work the demo is about?
     *
     * Scored, not guessed: an entity earns points for every event whose \`work_id\` matches one of its
     * row ids, and for every OTHER entity that points at it through a \`ref\` field. That is the
     * structural definition of "the thing the work is about" and it holds in any domain. Ties break
     * on the entity key so the answer is stable.
     */
    function primaryWorkEntity(entities, events) {
        if (!entities.length)
            return null;
        const scores = entities.map((e) => {
            const ids = new Set(e.rows.map((r) => String(r.id)));
            const fromEvents = events.filter((ev) => ids.has(ev.work_id)).length;
            const fromRefs = entities
                .filter((other) => other.key !== e.key)
                .reduce((n, other) => n + refFields(other).filter((f) => f.ref === e.key).length, 0);
            return { key: e.key, n: fromEvents + fromRefs };
        });
        const ranked = [...scores].sort((a, b) => (b.n - a.n) || a.key.localeCompare(b.key));
        return ranked[0] && ranked[0].n > 0 ? ranked[0].key : null;
    }
    /* ------------------------------------------------------------------ the detections */
    function planTimeline(entities, events, primary) {
        const entity = entities.find((e) => e.key === primary) || null;
        // Route 1: work items that carry two or more times of their own.
        if (entity) {
            const times = timeFields(entity);
            if (times.length >= 2) {
                const lanes = entity.rows.filter((r) => times.filter((f) => typeof r[f.key] === 'string' && r[f.key] !== '').length >= 2);
                if (lanes.length >= MIN_TIMELINE_LANES) {
                    const { items, capped } = cap(lanes.map((r) => String(r.id)), MAX_TIMELINE_LANES);
                    return {
                        kind: 'timeline', entity: entity.key,
                        fields: times.map((f) => f.key), items, capped,
                    };
                }
            }
        }
        // Route 2: lanes from the events themselves, grouped by the work they belong to.
        const workIds = Array.from(new Set(events.map((e) => e.work_id))).sort();
        if (events.length >= MIN_TIMELINE_EVENTS && workIds.length >= MIN_TIMELINE_LANES) {
            const { items, capped } = cap(workIds, MAX_TIMELINE_LANES);
            return { kind: 'timeline', entity: primary, fields: ['work_id', 'occurred_at'], items, capped };
        }
        return {
            kind: 'timeline', entity: primary, reason: 'below_minimum', fallback: 'table',
            detail: \`\${workIds.length} work ids and \${events.length} events; needs \${MIN_TIMELINE_LANES} lanes or \${MIN_TIMELINE_EVENTS} events\`,
        };
    }
    function planTargetBars(entity) {
        const measured = measuredFields(entity);
        if (!measured.length) {
            return {
                kind: 'target_bar', entity: entity.key, reason: 'no_candidate_data', fallback: 'table',
                detail: 'no meter field and no number carrying a max or target',
            };
        }
        return {
            kind: 'target_bar', entity: entity.key,
            fields: measured.map((f) => f.key),
            items: entity.rows.map((r) => String(r.id)),
            capped: null,
        };
    }
    function planComparisonBars(entity) {
        const candidates = plainNumberFields(entity)
            .map((f) => ({ f, n: rowsWithNumber(entity, f.key) }))
            .filter((c) => c.n >= MIN_BAR_ROWS)
            .sort(byCountDesc);
        if (!candidates.length) {
            const best = plainNumberFields(entity)
                .map((f) => rowsWithNumber(entity, f.key))
                .reduce((m, n) => Math.max(m, n), 0);
            return {
                kind: 'comparison_bars', entity: entity.key, reason: 'below_minimum', fallback: 'table',
                detail: \`best numeric field is filled on \${best} rows; needs \${MIN_BAR_ROWS}\`,
            };
        }
        const field = candidates[0].f;
        const rows = entity.rows.filter((r) => typeof r[field.key] === 'number').map((r) => String(r.id));
        const { items, capped } = cap(rows, MAX_BAR_ROWS);
        return { kind: 'comparison_bars', entity: entity.key, fields: [field.key], items, capped };
    }
    function planStatusPills(entity) {
        const enums = enumFields(entity);
        if (!enums.length) {
            return {
                kind: 'status_pills', entity: entity.key, reason: 'no_candidate_data', fallback: 'table',
                detail: 'no enum field',
            };
        }
        const field = enums.find((f) => f.key === entity.statusField) || enums[0];
        const values = distinctValues(entity, field.key);
        const { items, capped } = cap(values, MAX_HEADLINE_TILES);
        return { kind: 'status_pills', entity: entity.key, fields: [field.key], items, capped };
    }
    /**
     * A funnel is child rows narrowing through stages. Stages come from the DATA in order of
     * narrowing count, never from a list somebody typed, and a stage set whose counts are all equal
     * is not a funnel: it is a category breakdown wearing a funnel's shape.
     */
    function planFunnel(entity, workEntity) {
        const pointsAtWork = refFields(entity).some((f) => f.ref === workEntity);
        const enums = enumFields(entity);
        if (!workEntity || !pointsAtWork || !enums.length) {
            return {
                kind: 'funnel', entity: entity.key, reason: 'no_candidate_data', fallback: 'table',
                detail: 'not a child of the work entity, or carries no status enum',
            };
        }
        const field = enums.find((f) => f.key === entity.statusField) || enums[0];
        const counts = distinctValues(entity, field.key)
            .map((v) => ({ v, n: entity.rows.filter((r) => String(r[field.key]) === v).length }))
            .sort(byCountDesc);
        if (counts.length < MIN_FUNNEL_STAGES) {
            return {
                kind: 'funnel', entity: entity.key, reason: 'below_minimum', fallback: 'table',
                detail: \`\${counts.length} stages; needs \${MIN_FUNNEL_STAGES}\`,
            };
        }
        if (counts[0].n === counts[counts.length - 1].n) {
            return {
                kind: 'funnel', entity: entity.key, reason: 'no_variation', fallback: 'table',
                detail: \`every stage holds \${counts[0].n} rows, so nothing narrows\`,
            };
        }
        const { items, capped } = cap(counts.map((c) => c.v), MAX_FUNNEL_STAGES);
        return { kind: 'funnel', entity: entity.key, fields: [field.key], items, capped };
    }
    /** A path of steps is a causal chain: events linked by \`parent_event_id\` inside one \`work_id\`. */
    function planStepPath(events) {
        const byWork = new Map();
        for (const e of events) {
            const list = byWork.get(e.work_id) || [];
            list.push(e);
            byWork.set(e.work_id, list);
        }
        const chained = Array.from(byWork.entries())
            .map(([work, list]) => ({ work, n: list.filter((e) => e.parent_event_id !== null).length + 1 }))
            .filter((c) => c.n >= MIN_PATH_STEPS)
            .sort((a, b) => (b.n - a.n) || a.work.localeCompare(b.work));
        if (!chained.length) {
            return {
                kind: 'step_path', entity: null, reason: 'below_minimum', fallback: 'list',
                detail: \`no work item has \${MIN_PATH_STEPS} causally linked events\`,
            };
        }
        return {
            kind: 'step_path', entity: null,
            fields: ['parent_event_id', 'status', 'occurred_at'],
            items: chained.map((c) => c.work), capped: null,
        };
    }
    /** Rows a person must act on: an entity action with a \`when\`, and rows that match it. */
    function planDecisionCards(entities) {
        const pending = [];
        const fields = new Set();
        for (const entity of entities) {
            for (const action of entity.actions) {
                if (!action.when)
                    continue;
                for (const [k, v] of Object.entries(action.when)) {
                    fields.add(k);
                    for (const row of entity.rows) {
                        const match = Array.isArray(v) ? v.map(String).includes(String(row[k])) : String(row[k]) === String(v);
                        const id = \`\${entity.key}:\${String(row.id)}\`;
                        if (match && !pending.includes(id))
                            pending.push(id);
                    }
                }
            }
        }
        if (!pending.length) {
            return {
                kind: 'decision_cards', entity: null, reason: 'no_candidate_data', fallback: 'none',
                detail: 'no entity action declares a \`when\`, or no row matches one',
            };
        }
        return { kind: 'decision_cards', entity: null, fields: [...fields].sort(), items: pending, capped: null };
    }
    /**
     * Who did what, built from \`events\` rather than from the plan's roster.
     *
     * Guard 4 of the rules: never show an empty state the data contradicts. The old engine printed
     * "the plan names no agents" on a screen whose own activity log named twelve, because it read
     * \`agents\` and the scaffold had left it empty.
     */
    function planActorSummary(events) {
        const actors = Array.from(new Set(events.map((e) => e.actor.id))).sort();
        if (!actors.length) {
            return {
                kind: 'actor_summary', entity: null, reason: 'no_candidate_data', fallback: 'none',
                detail: 'the spec records no events, so nobody has acted',
            };
        }
        const tiers = Array.from(new Set(events.map((e) => e.autonomy_tier)));
        return {
            kind: 'actor_summary', entity: null,
            // The tier bar is part of this block only when it would carry information.
            fields: tiers.length >= MIN_TIER_SEGMENTS ? ['actor', 'autonomy_tier'] : ['actor'],
            items: actors, capped: null,
        };
    }
    /** Long text is quoted, never charted. Decided on the VALUES present, not on the field name. */
    function planQuoteBlocks(entity) {
        const keys = entity.fields
            .filter((f) => f.type === 'text')
            .filter((f) => entity.rows.some((r) => typeof r[f.key] === 'string' && r[f.key].length >= QUOTE_BLOCK_MIN_CHARS))
            .map((f) => f.key);
        if (!keys.length)
            return null;
        return { kind: 'quote_block', entity: entity.key, fields: keys, items: [], capped: null };
    }
    /* ------------------------------------------------------------------ assembly */
    function isSkipped(b) {
        return b.reason !== undefined;
    }
    /**
     * Build the plan.
     *
     * Screens keep the order and types the spec declares; this decides what each one DRAWS, in the
     * analysis order the rules set out (summary before detail on every screen).
     */
    function visualPlan(spec) {
        const entities = entitiesOf(spec);
        const events = spec.events || [];
        const primary = primaryWorkEntity(entities, events);
        const timeline = planTimeline(entities, events, primary);
        const decisions = planDecisionCards(entities);
        const actors = planActorSummary(events);
        const steps = planStepPath(events);
        const global = [];
        const globalSkipped = [];
        for (const b of [decisions, actors])
            (isSkipped(b) ? globalSkipped : global).push(b);
        const screens = screensOf(spec).map((screen) => {
            const blocks = [];
            const skipped = [];
            const push = (b) => {
                if (isSkipped(b))
                    skipped.push(b);
                else
                    blocks.push(b);
            };
            const entity = entities.find((e) => e.key === screen.entity) || null;
            if (screen.type === 'home') {
                // Counts first, then measured-against-target, then the one picture of the whole, then what
                // needs a person, and the feed last. That order is the analysis the reader wants.
                const workEntity = entities.find((e) => e.key === primary);
                if (workEntity)
                    push(planStatusPills(workEntity));
                if (workEntity)
                    push(planTargetBars(workEntity));
                push(timeline);
                push(decisions);
                for (const child of entities)
                    push(planFunnel(child, primary));
            }
            else if (screen.type === 'list' && entity) {
                push(planTargetBars(entity));
                push(planComparisonBars(entity));
                /*
                 * Only on the screen showing the work the events are ABOUT. Events carry a \`work_id\`, so a
                 * path of steps drawn on an unrelated entity's screen is a true picture of the wrong
                 * thing: the people list showed how the shifts went, under a heading about the work.
                 */
                if (entity.key === primary)
                    push(steps);
                const matrixRefs = refFields(entity);
                if (matrixRefs.length >= 2 && plainNumberFields(entity).length >= 1) {
                    blocks.push({
                        kind: 'matrix', entity: entity.key,
                        fields: [...matrixRefs.slice(0, 2).map((f) => f.key), plainNumberFields(entity)[0].key],
                        items: entity.rows.map((r) => String(r.id)), capped: null,
                    });
                }
            }
            else if (screen.type === 'queue') {
                push(decisions);
            }
            else if (screen.type === 'roster') {
                push(actors);
            }
            if (entity) {
                const quote = planQuoteBlocks(entity);
                if (quote)
                    blocks.push(quote);
            }
            return { screen: screen.id, type: screen.type, blocks, skipped };
        });
        return {
            version: 1,
            now: latestEventTime(events),
            primaryWorkEntity: primary,
            screens,
            global,
            globalSkipped,
        };
    }
    return { visualPlan: visualPlan, primaryWorkEntity: primaryWorkEntity };
  })();

  var esc = function (v) {
    return v === null || v === undefined ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var slug = function (v) { return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.9 2.7 2.6 3 5.2"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.1 7.7 7.5 9 4.4-1.3 7.5-4.5 7.5-9V6z"/>',
    flow: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/>',
    dot: '<circle cx="12" cy="12" r="3"/>'
  };
  var icon = function (name, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.dot) + '</svg>';
  };
  var LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  // ---- the trust vocabulary -------------------------------------------------
  // These three tables are the engine's half of the demo-spec contract. The
  // spec declares the same unions (ACTION_LIFECYCLE, AUTONOMY_TIERS,
  // DEMO_ENVIRONMENTS); these decide how each value is shown. They live here,
  // not in any one project's spec, so every generated demo inherits them.

  // The ONE sentence that says this is not a real system. Declared once and
  // rendered by strip() so the success page and the error page cannot drift
  // into saying different things, or into one of them saying nothing.
  var SIMULATED = 'Simulated, not live';

  // The screen key the engine uses when it has to add the trust timeline
  // itself. Double underscore so it cannot collide with a spec-authored key.
  var TRUST_SCREEN = '__trust';

  // The full action lifecycle. \`done: true\` is granted to exactly one state.
  var STATUS = {
    proposed:  { label: 'Proposed',  tone: '',       done: false },
    queued:    { label: 'Queued',    tone: '',       done: false },
    executing: { label: 'Executing', tone: 'live',   done: false },
    succeeded: { label: 'Succeeded', tone: 'ok',     done: true },
    failed:    { label: 'Failed',    tone: 'danger', done: false },
    canceled:  { label: 'Canceled',  tone: 'faded',  done: false },
    reverted:  { label: 'Reverted',  tone: 'danger', done: false }
  };

  /*
   * Resolve a status, failing LOUD rather than silent.
   *
   * Two deliberate choices, both of which exist to honor the standard's
   * hard gate that a demo never claims an action completed when it did not:
   *
   * 1. An unrecognized status renders as "Unrecognized state" in the danger
   *    tone. It does NOT fall back to succeeded, and it does not fall back to
   *    a neutral pill either, because a reader skims neutral as "fine".
   * 2. hasOwnProperty, not \`STATUS[s] ||\`. A spec carrying the string
   *    "constructor" or "toString" would otherwise find a truthy object on the
   *    prototype chain and render a function's source as the label.
   */
  function statusOf(s) {
    return Object.prototype.hasOwnProperty.call(STATUS, s)
      ? STATUS[s]
      : { label: 'Unrecognized state', tone: 'danger', done: false };
  }

  // What each autonomy tier actually permitted. Plain words, because "A3"
  // alone tells a viewer nothing about what the agent was allowed to do.
  var TIERS = {
    A0: 'A0 · observed only',
    A1: 'A1 · suggested, a person acted',
    A2: 'A2 · acted after a person approved',
    A3: 'A3 · acted alone, a person can undo it',
    A4: 'A4 · acted alone, no undo'
  };
  function tierOf(t) {
    return Object.prototype.hasOwnProperty.call(TIERS, t) ? TIERS[t] : String(t || 'tier not stated');
  }

  // ---- data helpers ---------------------------------------------------------
  var ent = function (key) { return SPEC.entities[key]; };
  var rowsOf = function (key) { return ROWS[key] || []; };
  var field = function (ekey, fkey) { return (ent(ekey).fields || []).find(function (f) { return f.key === fkey; }); };
  var find = function (ekey, id) { return rowsOf(ekey).find(function (r) { return r.id === id; }); };
  var matches = function (row, where) {
    return Object.keys(where || {}).every(function (k) {
      var w = where[k];
      return Array.isArray(w) ? w.indexOf(row[k]) >= 0 : row[k] === w;
    });
  };
  var pick = function (ekey, where) { return rowsOf(ekey).filter(function (r) { return matches(r, where); }); };
  var routeOf = function (ekey, row) { return slug(ekey) + '-' + slug(row.id); };

  // Plain text for one field. Refs resolve to the title of the row they point at.
  function text(ekey, fkey, row) {
    var f = field(ekey, fkey), v = row[fkey];
    if (!f) return v === undefined ? '' : String(v);
    if (f.type === 'private') return 'private';
    if (v === null || v === undefined || v === '') return '';
    if (f.type === 'ref') { var t = find(f.ref, v); return t ? title(f.ref, t) : String(v); }
    if (f.type === 'bool') return v ? 'Yes' : 'No';
    if (f.type === 'meter' || f.type === 'number') return v + (f.unit ? ' ' + f.unit : '');
    return String(v);
  }
  function fill(tpl, ekey, row) {
    return String(tpl || '').replace(/\\{(\\w+)\\}/g, function (_, k) { return k === 'persona' ? SPEC.app.persona.name : ekey ? text(ekey, k, row) : ''; });
  }
  function title(ekey, row) {
    var t = ent(ekey).title || 'id';
    return t.indexOf('{') >= 0 ? fill(t, ekey, row) : text(ekey, t, row) || String(row.id);
  }
  // HTML for one field.
  function show(ekey, fkey, row) {
    var f = field(ekey, fkey), v = row[fkey];
    if (!f) return esc(v);
    if (f.type === 'private') return '<span class="private">' + LOCK + esc(f.shown_as || 'Private. Never shared.') + '</span>';
    if (v === null || v === undefined || v === '') return '<span class="note">' + esc(f.empty || '—') + '</span>';
    if (f.type === 'ref') {
      var t = find(f.ref, v);
      return t ? '<a href="#' + routeOf(f.ref, t) + '">' + esc(title(f.ref, t)) + '</a>' : esc(v);
    }
    if (f.type === 'enum') {
      var tone = (f.tones || {})[v] || '';
      return '<span class="pill ' + esc(tone) + '">' + esc((f.labels || {})[v] || v) + '</span>';
    }
    if (f.type === 'meter') {
      var pct = Math.max(0, Math.min(100, (Number(v) / (f.max || 100)) * 100));
      return '<span class="meter' + (Number(v) > (f.max || 100) || (f.warn && Number(v) >= f.warn) ? ' over' : '') + '"><span class="track"><span class="fill" style="display:block;width:' + pct.toFixed(0) + '%"></span></span>' + esc(v) + (f.unit ? ' ' + esc(f.unit) : '') + '</span>';
    }
    if (f.type === 'number') return '<span class="num">' + esc(v) + (f.unit ? ' ' + esc(f.unit) : '') + '</span>';
    if (f.type === 'who') return '<span class="who ' + (v === 'human' ? 'human' : '') + '">' + (v === 'human' ? 'Person' : 'Agent') + '</span>';
    var plain = text(ekey, fkey, row);
    return plain.length <= 18 ? '<span style="white-space:nowrap">' + esc(plain) + '</span>' : esc(plain);
  }
  var label = function (ekey, fkey) { var f = field(ekey, fkey); return f ? f.label : fkey; };
  var columnsOf = function (ekey, drop) {
    var e = ent(ekey);
    var cols = e.columns || (e.fields || []).filter(function (f) { return f.type !== 'private'; }).slice(0, 5).map(function (f) { return f.key; });
    return cols.filter(function (c) { return c !== drop; });
  };

  function table(ekey, rows, cols) {
    if (!rows.length) return '<div class="empty">Nothing here in this sample.</div>';
    var e = ent(ekey), tkey = e.title && e.title.indexOf('{') < 0 ? e.title : null;
    var h = '<div class="scroll"><table><thead><tr>';
    if (!tkey || cols.indexOf(tkey) < 0) h += '<th scope="col">' + esc(e.label) + '</th>';
    cols.forEach(function (c) { h += '<th scope="col">' + esc(label(ekey, c)) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>';
      var link = '<a href="#' + routeOf(ekey, r) + '">' + esc(title(ekey, r)) + '</a>';
      if (!tkey || cols.indexOf(tkey) < 0) h += '<td class="title">' + link + '</td>';
      cols.forEach(function (c) { h += c === tkey ? '<td class="title">' + link + '</td>' : '<td data-label="' + esc(label(ekey, c)) + '">' + show(ekey, c, r) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  // ---- actions (the only thing that changes state) --------------------------
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.textContent = ''; }, 5000);
  }
  function logEvent(msg, ekey, row) {
    var L = SPEC.app.log;
    if (!L || !ROWS[L.entity]) return;
    var ev = { id: 'demo-' + (ROWS[L.entity].length + 1) };
    ev[L.time] = 'Just now'; ev[L.actor] = SPEC.app.persona.name; ev[L.kind] = 'human'; ev[L.text] = msg;
    if (L.link) {
      var lf = field(L.entity, L.link);
      if (lf && lf.ref === ekey) ev[L.link] = row.id;
      else if (lf) { var via = (ent(ekey).fields || []).find(function (f) { return f.type === 'ref' && f.ref === lf.ref; }); if (via) ev[L.link] = row[via.key]; }
    }
    ROWS[L.entity].unshift(ev);
  }
  function act(ekey, id, action) {
    var row = find(ekey, id);
    if (!row || !action) return;
    Object.keys(action.set || {}).forEach(function (k) { row[k] = action.set[k] === '{persona}' ? SPEC.app.persona.name : action.set[k]; });
    // "also" lets one decision ripple: approving here changes a row over there.
    (action.also || []).forEach(function (x) {
      var where = {};
      Object.keys(x.where || {}).forEach(function (k) { var m = /^\\{(\\w+)\\}$/.exec(String(x.where[k])); where[k] = m ? (m[1] === 'id' ? row.id : row[m[1]]) : x.where[k]; });
      pick(x.entity, where).forEach(function (r) { Object.keys(x.set || {}).forEach(function (k) { r[k] = x.set[k]; }); });
    });
    if (action.log) logEvent(fill(action.log, ekey, row), ekey, row);
    render();
    if (action.toast) toast(fill(action.toast, ekey, row));
  }
  var ACTIONS = [];
  function actionButtons(ekey, row, actions) {
    return (actions || []).filter(function (a) { return matches(row, a.when); }).map(function (a) {
      ACTIONS.push({ ekey: ekey, id: row.id, action: a });
      return '<button type="button" class="btn ' + (a.tone === 'primary' ? 'primary' : '') + '" data-act="' + (ACTIONS.length - 1) + '">' + esc(a.label) + '</button>';
    }).join('');
  }

  // ---- screens --------------------------------------------------------------
  function fromLine(s) {
    var src = s.from || [];
    return src.length ? '<p class="from">In the plan: ' + src.map(esc).join(', ') + (s.release ? ' · ships in ' + esc(s.release) : '') + '</p>' : '';
  }
  function head(s, extra) {
    return '<div class="head"><div><h1>' + esc(fill(s.title, null, {})) + '</h1>' + (s.subtitle ? '<p>' + esc(fill(s.subtitle, null, {})) + '</p>' : '') + fromLine(s) + '</div>' + (extra || '') + '</div>';
  }
  function queueCards(sid, limit) {
    var q = SPEC.screens[sid], rows = pick(q.entity, q.pending);
    if (limit) rows = rows.slice(0, limit);
    return rows.map(function (r) {
      var h = '<section class="card pad att"><div class="card-head" style="padding:0;border:0"><h2>' + esc(fill(q.card_title || '{id}', q.entity, r)) + '</h2><span class="pill attention">Waiting on ' + esc(SPEC.app.persona.name) + '</span></div>';
      if (q.summary) h += '<p style="font-size:15px">' + esc(fill(q.summary, q.entity, r)) + '</p>';
      if ((q.facts || []).length) h += '<dl class="facts">' + q.facts.map(function (k) { return '<dt>' + esc(label(q.entity, k)) + '</dt><dd>' + show(q.entity, k, r) + '</dd>'; }).join('') + '</dl>';
      h += '<div class="actions">' + actionButtons(q.entity, r, q.actions) + (q.rule ? '<span class="note">' + esc(q.rule) + '</span>' : '') + '</div></section>';
      return h;
    }).join('');
  }
  function feedList(sid, limit) {
    var f = SPEC.screens[sid], rows = rowsOf(f.entity);
    if (limit) rows = rows.slice(0, limit);
    if (!rows.length) return '<div class="empty">No activity in this sample.</div>';
    return '<ol class="feed">' + rows.map(function (r) {
      var who = r[f.kind] === 'human' ? 'human' : 'agent';
      return '<li><time>' + esc(r[f.time]) + '</time><div>' + esc(r[f.text]) + '<div class="meta"><span class="who ' + (who === 'human' ? 'human' : '') + '">' + (who === 'human' ? 'Person' : 'Agent') + '</span>' + '<span>' + esc(r[f.actor]) + '</span>' + (f.link && r[f.link] ? show(f.entity, f.link, r) : '') + '</div></div></li>';
    }).join('') + '</ol>';
  }

  /* ------------------------------------------------------------------ the visuals
   *
   * Everything below DRAWS. What to draw was already decided by VISUAL.visualPlan (inlined
   * above from the TypeScript that is unit tested against six fixtures), so nothing here
   * inspects the domain or re-decides anything. If a block is absent from the plan, the block
   * is not drawn and whatever this screen did before stands: that is the fallback the rules
   * promise, and it is why every call site below is guarded rather than assumed.
   */
  function planFor(sid) {
    if (!PLAN || !PLAN.screens) return null;
    for (var i = 0; i < PLAN.screens.length; i++) if (PLAN.screens[i].screen === sid) return PLAN.screens[i];
    return null;
  }
  function blockOf(sp, kind) {
    if (!sp) return null;
    for (var i = 0; i < sp.blocks.length; i++) if (sp.blocks[i].kind === kind) return sp.blocks[i];
    return null;
  }
  function globalBlock(kind) {
    if (!PLAN) return null;
    for (var i = 0; i < PLAN.global.length; i++) if (PLAN.global[i].kind === kind) return PLAN.global[i];
    return null;
  }
  function msOf(v) { var t = Date.parse(v); return isNaN(t) ? null : t; }
  function numOf(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  /** A short clock label. The spec's own display strings are used where it has them. */
  function clockLabel(ms) {
    var d = new Date(ms);
    var h = d.getUTCHours(), m = d.getUTCMinutes();
    var ap = h < 12 ? 'AM' : 'PM', hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  /** \`{shown} of {total}\` plus a way to the rest, whenever a cap trimmed a block. */
  function cappedNote(b, href) {
    if (!b.capped) return '';
    return '<p class="cap-note">Showing ' + b.capped.shown + ' of ' + b.capped.total +
      (href ? '. <a href="#' + esc(href) + '">See all</a>' : '.') + '</p>';
  }
  function chartHead(t, takeaway) {
    // Composed titles start from a field key or an entity label, which are lower case in most
    // specs, so the heading read "hours by person". Sentence case is applied here rather than in
    // CSS because text-transform would also shout an acronym the spec capitalised on purpose.
    t = String(t || ''); t = t.charAt(0).toUpperCase() + t.slice(1);
    return '<div class="chart-head"><h3>' + esc(t) + '</h3>' + (takeaway ? '<p>' + esc(takeaway) + '</p>' : '') + '</div>';
  }

  /** Headline tiles: one per status value, counted from the rows. */
  function vStatusTiles(b) {
    if (!b) return '';
    var ekey = b.entity, fkey = b.fields[0], f = field(ekey, fkey), rows = rowsOf(ekey);
    if (!f) return '';
    var cells = b.items.map(function (v) {
      var n = rows.filter(function (r) { return String(r[fkey]) === String(v); }).length;
      var label = (f.labels || {})[v] || v;
      var tone = (f.tones || {})[v] || '';
      return '<div class="tile ' + (tone === 'attention' ? 'att' : '') + '"><span class="n">' + n + '</span>' +
        '<span><strong>' + esc(label) + '</strong><span>' + esc(ent(ekey).plural || ekey) + '</span></span></div>';
    }).join('');
    return cells ? '<div class="tiles">' + cells + '</div>' + cappedNote(b) : '';
  }

  /**
   * A number against the thing the spec says to measure it against.
   *
   * Never the number alone: "85" and "29" look alike until the target is beside them, which is
   * the whole reason this block exists rather than a cell in a table.
   */
  function vTargetBar(ekey, fkey, row) {
    var f = field(ekey, fkey);
    if (!f) return '';
    var v = numOf(row[fkey]), max = numOf(f.max);
    if (v === null || max === null) return '';
    var over = v > max, warn = f.warn !== undefined && f.warn !== null && v >= f.warn && !over;
    var pct = Math.max(2, Math.min(100, (v / Math.max(max, v)) * 100));
    var limitPct = (max / Math.max(max, v)) * 100;
    return '<div class="vbar' + (over ? ' over' : warn ? ' warn' : '') + '">' +
      '<div class="track"><div class="fill" style="width:' + pct.toFixed(1) + '%"></div>' +
      '<i class="limit" style="left:' + limitPct.toFixed(1) + '%" aria-hidden="true"></i></div>' +
      '<span class="val">' + esc(v) + (f.unit ? ' ' + esc(f.unit) : '') +
      ' <span class="of">/ ' + esc(max) + (f.unit ? ' ' + esc(f.unit) : '') + '</span>' +
      (over ? '<b class="flag">over</b>' : '') + '</span></div>';
  }

  /** The one picture of the whole: a lane per work item, event marks, and a now line. */
  function vTimeline(b, sid) {
    if (!b) return '';
    var fromRows = b.entity && b.fields.length === 2 && b.fields[0] !== 'work_id';
    var lanes = [];
    if (fromRows) {
      var ek = b.entity, f0 = b.fields[0], f1 = b.fields[1];
      b.items.forEach(function (id) {
        var row = find(ek, id); if (!row) return;
        var a = msOf(row[f0]), z = msOf(row[f1]); if (a === null || z === null) return;
        lanes.push({ id: id, label: title(ek, row), a: Math.min(a, z), z: Math.max(a, z), href: routeOf(ek, row) });
      });
    } else {
      b.items.forEach(function (work) {
        var evs = (SPEC.events || []).filter(function (e) { return e.work_id === work; });
        var times = evs.map(function (e) { return msOf(e.occurred_at); }).filter(function (t) { return t !== null; });
        if (!times.length) return;
        var row = b.entity ? find(b.entity, work) : null;
        lanes.push({
          id: work, label: row ? title(b.entity, row) : work,
          a: Math.min.apply(null, times), z: Math.max.apply(null, times),
          href: row ? routeOf(b.entity, row) : ''
        });
      });
    }
    if (!lanes.length) return '';
    var now = PLAN && PLAN.now ? msOf(PLAN.now) : null;
    var lo = Math.min.apply(null, lanes.map(function (l) { return l.a; }));
    var hi = Math.max.apply(null, lanes.map(function (l) { return l.z; }));
    if (now !== null) { lo = Math.min(lo, now); hi = Math.max(hi, now); }
    if (hi <= lo) hi = lo + 1;
    var pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    var W = 760, L = 150, R = 16, H = lanes.length * 34 + 60;
    var x = function (t) { return L + ((t - lo) / (hi - lo)) * (W - L - R); };

    var marks = '';
    lanes.forEach(function (l, i) {
      var y = 36 + i * 34;
      // Events on this lane, merged when they would overlap, so a cluster reads as a count
      // rather than as one mark hiding four.
      var evs = (SPEC.events || []).filter(function (e) { return e.work_id === l.id; })
        .map(function (e) { return { t: msOf(e.occurred_at), status: e.status }; })
        .filter(function (e) { return e.t !== null; })
        .sort(function (p, q) { return p.t - q.t; });
      var groups = [];
      evs.forEach(function (e) {
        var last = groups[groups.length - 1];
        if (last && Math.abs(x(e.t) - x(last.t)) < 9) { last.n += 1; if (e.status === 'failed') last.bad = true; }
        else groups.push({ t: e.t, n: 1, bad: e.status === 'failed' });
      });
      var bad = evs.some(function (e) { return e.status === 'failed'; });
      marks += '<g class="lane' + (bad ? ' bad' : '') + '">' +
        '<text class="lane-label" x="0" y="' + (y + 4) + '">' + esc(l.label).slice(0, 30) + '</text>' +
        '<line class="bar" x1="' + x(l.a).toFixed(1) + '" y1="' + y + '" x2="' + x(l.z).toFixed(1) + '" y2="' + y + '"/>' +
        groups.map(function (g) {
          return '<g class="mk' + (g.bad ? ' bad' : '') + '"><circle cx="' + x(g.t).toFixed(1) + '" cy="' + y + '" r="6"/>' +
            (g.n > 1 ? '<text x="' + x(g.t).toFixed(1) + '" y="' + (y + 3.5) + '">' + g.n + '</text>' : '') +
            '<title>' + esc(clockLabel(g.t)) + (g.n > 1 ? ' · ' + g.n + ' actions' : '') + '</title></g>';
        }).join('') + '</g>';
    });
    // The now label sits at the FOOT, not beside the tick row: a line drawn near a tick put two
    // labels in the same place, and the one that mattered was the one underneath.
    var nowAnchor = (x(now) - L) / (W - L - R) > 0.82 ? 'end' : 'start';
    var nowLine = now === null ? '' :
      '<g class="nowline"><line x1="' + x(now).toFixed(1) + '" y1="20" x2="' + x(now).toFixed(1) + '" y2="' + (H - 20) + '"/>' +
      '<text x="' + (x(now) + (nowAnchor === 'end' ? -5 : 5)).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + nowAnchor + '">now ' + esc(clockLabel(now)) + '</text></g>';
    var ticks = '';
    for (var k = 0; k <= 4; k++) {
      var t = lo + ((hi - lo) / 4) * k;
      // Anchored inward at the edges. Centred labels at either end hang off the viewBox and the
      // browser simply clips them, so the first and last times were unreadable.
      var anchor = k === 0 ? 'start' : (k === 4 ? 'end' : 'middle');
      ticks += '<g class="tick"><line x1="' + x(t).toFixed(1) + '" y1="20" x2="' + x(t).toFixed(1) + '" y2="' + (H - 20) + '"/>' +
        '<text x="' + x(t).toFixed(1) + '" y="12" text-anchor="' + anchor + '">' + esc(clockLabel(t)) + '</text></g>';
    }
    return '<section class="card chart">' + chartHead('Work in progress, item by item', lanes.length + ' items, ' + (SPEC.events || []).length + ' actions') +
      '<div class="scroller"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Timeline of work items">' +
      ticks + marks + nowLine + '</svg></div>' + cappedNote(b, sid) + '</section>';
  }

  /** Child rows narrowing through stages. The sentence under it is computed, never written. */
  function vFunnel(b) {
    if (!b) return '';
    var ekey = b.entity, fkey = b.fields[0], f = field(ekey, fkey), rows = rowsOf(ekey);
    if (!f) return '';
    var stages = b.items.map(function (v) {
      return { v: v, label: (f.labels || {})[v] || v, n: rows.filter(function (r) { return String(r[fkey]) === String(v); }).length };
    });
    if (!stages.length) return '';
    var top = stages[0].n, last = stages[stages.length - 1];
    var bars = stages.map(function (s) {
      var pct = top ? Math.max(3, (s.n / top) * 100) : 0;
      return '<div class="stage"><span class="lbl">' + esc(s.label) + '</span>' +
        '<div class="track"><div class="fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '<span class="val">' + s.n + '</span></div>';
    }).join('');
    var takeaway = top ? last.n + ' of ' + top + ' reached ' + last.label.toLowerCase() + '.' : '';
    return '<section class="card chart">' + chartHead(esc(ent(ekey).plural || ekey) + ' by stage', takeaway) +
      '<div class="funnel">' + bars + '</div>' + cappedNote(b) + '</section>';
  }

  /** One number compared across rows, with the limit line when the spec states one. */
  function vBars(b, sid) {
    if (!b) return '';
    var ekey = b.entity, fkey = b.fields[0], f = field(ekey, fkey);
    if (!f) return '';
    var items = b.items.map(function (id) { return find(ekey, id); }).filter(Boolean)
      .map(function (r) { return { r: r, v: numOf(r[fkey]) }; })
      .filter(function (it) { return it.v !== null; })
      .sort(function (p, q) { return q.v - p.v; });
    if (!items.length) return '';
    var max = Math.max.apply(null, items.map(function (it) { return it.v; }));
    var limit = numOf(f.max);
    var rows = items.map(function (it) {
      var pct = max ? Math.max(2, (it.v / max) * 100) : 0;
      var over = limit !== null && it.v > limit;
      return '<a class="brow' + (over ? ' over' : '') + '" href="#' + esc(routeOf(ekey, it.r)) + '">' +
        '<span class="lbl">' + esc(title(ekey, it.r)) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
        '<span class="val">' + esc(it.v) + (f.unit ? ' ' + esc(f.unit) : '') + '</span></a>';
    }).join('');
    var limitMark = limit === null ? '' :
      '<div class="limit-key"><i></i>limit ' + esc(limit) + (f.unit ? ' ' + esc(f.unit) : '') + '</div>';
    return '<section class="card chart">' + chartHead(esc(f.label || fkey) + ' by ' + esc((ent(ekey).label || ekey)).toLowerCase(), '') +
      limitMark + '<div class="bars">' + rows + '</div>' + cappedNote(b, sid) + '</section>';
  }

  /** A causal chain: what followed what, and how long it waited. */
  function vSteps(b) {
    if (!b) return '';
    var out = b.items.slice(0, 3).map(function (work) {
      var evs = (SPEC.events || []).filter(function (e) { return e.work_id === work; })
        .sort(function (p, q) { return (msOf(p.occurred_at) || 0) - (msOf(q.occurred_at) || 0); });
      if (evs.length < 2) return '';
      var steps = evs.map(function (e, i) {
        var gap = '';
        if (i > 0) {
          var a = msOf(evs[i - 1].occurred_at), z = msOf(e.occurred_at);
          if (a !== null && z !== null) gap = '<span class="gap">' + Math.round((z - a) / 60000) + ' min</span>';
        }
        return gap + '<span class="step ' + esc(e.status) + '"><b>' + esc(e.action) + '</b>' +
          '<small>' + esc(e.status) + ' · ' + esc(clockLabel(msOf(e.occurred_at))) + '</small></span>';
      }).join('');
      return '<div class="steps-row"><span class="steps-key">' + esc(work) + '</span><div class="steps">' + steps + '</div></div>';
    }).join('');
    return out ? '<section class="card chart">' + chartHead('How the work actually went', '') + '<div class="scroller">' + out + '</div></section>' : '';
  }

  /**
   * What is waiting on a person, merged into one place.
   *
   * The plan names the rows an action's \`when\` matches, across every entity, so approvals and
   * exceptions that used to be three separate menu items arrive as one queue. The buttons are
   * the entity's own actions and go through the same \`act()\` as everywhere else, so approving
   * here moves the row, the counts, the charts and the log together.
   */
  function vDecisions(b) {
    if (!b || !b.items.length) return '';
    var cards = b.items.slice(0, 6).map(function (ref) {
      var at = ref.indexOf(':'); if (at < 0) return '';
      var ekey = ref.slice(0, at), id = ref.slice(at + 1);
      var row = find(ekey, id); if (!row) return '';
      var e = ent(ekey); if (!e) return '';
      var acts = (e.actions || []).filter(function (a) { return a.when && matches(row, a.when); });
      if (!acts.length) return '';
      var facts = (b.fields || []).map(function (k) {
        var f = field(ekey, k); if (!f || f.type === 'private') return '';
        return '<div class="fact"><dt>' + esc(f.label || k) + '</dt><dd>' + show(ekey, k, row) + '</dd></div>';
      }).join('');
      return '<div class="dcard"><div class="dhead"><h3>' + title(ekey, row) + '</h3>' +
        '<span class="chip-s att">Waiting on ' + esc(SPEC.app.persona.name) + '</span></div>' +
        (facts ? '<dl class="facts">' + facts + '</dl>' : '') +
        '<div class="dact">' + actionButtons(ekey, row, acts) + '</div></div>';
    }).join('');
    if (!cards) return '';
    return '<section class="card chart">' + chartHead('Needs your decision', b.items.length + ' waiting') +
      '<div class="dcards">' + cards + '</div>' + '</section>';
  }

  /** Actions by autonomy tier, plus who did them. Built from the events, never from a roster. */
  function vActors(b) {
    if (!b) return '';
    var evs = SPEC.events || [];
    if (!evs.length) return '';
    var tiers = {};
    evs.forEach(function (e) { tiers[e.autonomy_tier] = (tiers[e.autonomy_tier] || 0) + 1; });
    var keys = Object.keys(tiers).sort();
    var seg = keys.map(function (t) {
      var pct = (tiers[t] / evs.length) * 100;
      return '<span class="seg t' + esc(t) + '" style="width:' + pct.toFixed(1) + '%" title="' + esc(t) + ': ' + tiers[t] + '"><b>' + esc(t) + '</b></span>';
    }).join('');
    var rows = b.items.map(function (id) {
      var mine = evs.filter(function (e) { return e.actor.id === id; });
      if (!mine.length) return '';
      var a = mine[0].actor;
      var failed = mine.filter(function (e) { return e.status === 'failed'; }).length;
      var held = mine.filter(function (e) { return e.approval && e.approval.status === 'pending'; }).length;
      return '<div class="actor"><span class="who ' + (a.type === 'human' ? 'human' : '') + '">' + esc(a.type) + '</span>' +
        '<b>' + esc(a.label) + '</b><span class="n">' + mine.length + ' actions</span>' +
        (held ? '<span class="chip-s att">' + held + ' waiting on a person</span>' : '') +
        (failed ? '<span class="chip-s bad">' + failed + ' failed</span>' : '') + '</div>';
    }).join('');
    return '<section class="card chart">' + chartHead('Who did what', evs.length + ' actions by ' + b.items.length + (b.items.length === 1 ? ' actor' : ' actors')) +
      (keys.length > 1 ? '<div class="tierbar">' + seg + '</div>' : '') + '<div class="actors">' + rows + '</div></section>';
  }

  var RENDER = {
    home: function (s, sid) {
      var wide = '', narrow = '', top = '';
      (s.blocks || []).forEach(function (b) {
        if (b.type === 'counts') {
          top += '<div class="tiles">' + b.items.map(function (it) {
            var n = pick(it.entity, it.where).length;
            return '<a class="tile ' + (it.tone === 'attention' && n ? 'att' : '') + '" href="#' + esc(it.to) + '"><span class="n">' + n + '</span><span><strong>' + esc(it.label) + '</strong>' + (it.hint ? '<span>' + esc(it.hint) + '</span>' : '') + '</span></a>';
          }).join('') + '</div>';
        } else if (b.type === 'queue') {
          wide += queueCards(b.queue, b.limit || 1);
        } else if (b.type === 'list') {
          wide += '<section class="card"><div class="card-head"><h2>' + esc(b.title) + '</h2>' + (b.more ? '<a href="#' + esc(b.more) + '">See all</a>' : '') + '</div>' + table(b.entity, pick(b.entity, b.where).slice(0, b.limit || 5), b.columns || columnsOf(b.entity)) + '</section>';
        } else if (b.type === 'feed') {
          narrow += '<section class="card pad"><div class="card-head" style="padding:0;border:0"><h2>' + esc(b.title) + '</h2>' + '<a href="#' + esc(b.feed) + '">Full log</a></div>' + feedList(b.feed, b.limit || 6) + (b.note ? '<p class="note" style="border-top:1px solid var(--line);padding-top:12px">' + esc(b.note) + '</p>' : '') + '</section>';
        }
      });
      /*
       * The plan's pictures, in the analysis order the rules set out: counts, then the one
       * picture of the whole, then what needs a person beside how the work narrowed. They are
       * ADDED to what the spec declared rather than replacing it, so a spec that already asks
       * for a queue and a feed keeps both, and a spec that declares no blocks at all (which the
       * fixtures do) still gets a readable screen.
       */
      var sp = planFor(sid);
      if (sp) {
        if (!top) top = vStatusTiles(blockOf(sp, 'status_pills'));
        var pic = vTimeline(blockOf(sp, 'timeline'), sid);
        var dec = wide ? '' : vDecisions(blockOf(sp, 'decision_cards'));
        var fun = sp.blocks.filter(function (b) { return b.kind === 'funnel'; })
          .map(function (b) { return vFunnel(b); }).join('');
        wide = pic + wide + dec + fun;
      }
      return head(s, s.clock === false ? '' : '<span class="pill">' + esc(SPEC.app.clock || '') + '</span>') + top + '<div class="cols"><div class="wide">' + wide + '</div>' + (narrow ? '<div class="narrow">' + narrow + '</div>' : '') + '</div>';
    },
    list: function (s, sid) {
      var rows = pick(s.entity, s.where), chips = '';
      if (s.filter) {
        var f = field(s.entity, s.filter), cur = FILTERS[sid] || '';
        var vals = f.type === 'ref' ? rowsOf(f.ref).map(function (r) { return [r.id, title(f.ref, r)]; }) : Object.keys(rows.reduce(function (m, r) { m[r[s.filter]] = 1; return m; }, {})).map(function (v) { return [v, (f.labels || {})[v] || v]; });
        chips = '<div class="chips" role="group" aria-label="Filter by ' + esc(f.label) + '"><button type="button" class="chip" data-filter="" aria-pressed="' + (cur === '' ? 'true' : 'false') + '">All</button>' + vals.map(function (v) { return '<button type="button" class="chip" data-filter="' + esc(v[0]) + '" aria-pressed="' + (cur === String(v[0]) ? 'true' : 'false') + '">' + esc(v[1]) + '</button>'; }).join('') + '</div>';
        if (cur) rows = rows.filter(function (r) { return String(r[s.filter]) === cur; });
      }
      /*
       * The table stays, and the pictures sit under it. The rules' composition for a list screen
       * is "keep the table, then show what it cannot": how the rows compare, and how the work
       * actually went. Replacing the table would take away the one view where every value is
       * readable and traceable.
       */
      var spL = planFor(sid), extra = '';
      if (spL) {
        extra = vBars(blockOf(spL, 'comparison_bars'), sid) + vSteps(blockOf(spL, 'step_path'));
      }
      return head(s) + chips + '<section class="card">' + table(s.entity, rows, s.columns || columnsOf(s.entity)) + '</section>' + extra + (s.note ? '<p class="note">' + esc(s.note) + '</p>' : '');
    },
    queue: function (s, sid) {
      var done = rowsOf(s.entity).filter(function (r) { return !matches(r, s.pending); });
      var cards = queueCards(sid);
      return head(s) + (cards || '<section class="card"><div class="empty">Nothing is waiting on ' + esc(SPEC.app.persona.name) + '.</div></section>') +
        '<section class="card"><div class="card-head"><h2>Decided</h2></div>' + table(s.entity, done, s.columns || columnsOf(s.entity)) + '</section>';
    },
    feed: function (s, sid) {
      return head(s) + '<section class="card pad">' + feedList(sid) + '</section>';
    },
    roster: function (s) {
      var auto = { acts_autonomously: ['Runs on its own', ''], acts_with_approval: ['Prepares, then a person releases it', 'human'], suggests: ['Drafts for a person', 'human'] };
      var agents = (SPEC.agents || []).map(function (a) {
        var m = auto[a.autonomy] || [a.autonomy, ''];
        return '<div class="card agent"><div class="row"><h3>' + esc(a.name) + '</h3><span class="who ' + m[1] + '">' + (m[1] ? 'Agent + person' : 'Agent') + '</span></div><p>' + esc(a.purpose) + '</p><small>Starts when: ' + esc(a.trigger) + '</small><small>' + esc(m[0]) + (a.stops_when ? ' · stops and asks when: ' + esc(a.stops_when) : '') + '</small>' + (a.screen ? '<a href="#' + esc(a.screen) + '">See it in the demo</a>' : '') + '</div>';
      }).join('');
      var people = (SPEC.people || []).map(function (p) {
        return '<div class="card agent"><div class="row"><h3>' + esc(p.role) + '</h3><span class="who human">Person</span></div><ul style="margin:0;padding-left:18px">' + (p.decides || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' + (p.screen ? '<a href="#' + esc(p.screen) + '">Where they do it</a>' : '') + '</div>';
      }).join('');
      /*
       * Guard 4: never show an empty state the data contradicts.
       *
       * This screen used to print "The plan names no agents" whenever \`plan.agents\` was empty,
       * on a page whose own activity log named twelve. The roster the events describe is drawn
       * first, and the plan's lists only fill in behind it. The empty states now say what is
       * actually missing, which is the plan's description of the agents and not the agents.
       */
      var actors = vActors(globalBlock('actor_summary'));
      var noAgents = actors
        ? '<div class="card"><div class="empty">The plan does not describe these agents yet. What they did is above.</div></div>'
        : '<div class="card"><div class="empty">The plan names no agents.</div></div>';
      return head(s) + actors + '<div class="split"><div class="stack"><h2>Done by agents</h2>' + (agents || noAgents) + '</div><div class="stack"><h2>Decided by people</h2>' + (people || '<div class="card"><div class="empty">The plan names no human decisions.</div></div>') + '</div></div>';
    },
    rules: function (s) {
      var g = (SPEC.guardrails || []).map(function (x) {
        return '<div class="card agent"><div class="row"><h3>' + esc(x.id) + '</h3><span class="pill strong">Must never happen</span></div><p>' + esc(x.statement) + '</p>' + (x.shown_as ? '<small>In this demo: ' + esc(x.shown_as) + '</small>' : '') + '</div>';
      }).join('');
      var sys = (SPEC.systems || []).map(function (n) { return '<div class="card agent"><div class="row"><h3>' + esc(n) + '</h3><span class="pill">Simulated</span></div><small>The real app connects here. This demo does not.</small></div>'; }).join('');
      var src = SPEC.source || {};
      var cov = (SPEC.coverage || []).map(function (c) {
        return '<tr><td class="title">' + esc(c.story) + '</td><td>' + esc(c.title || '') + '</td><td>' + (c.screen ? '<a href="#' + esc(c.screen) + '">' + esc(c.label || 'Open') + '</a>' : '<span class="note">' + esc(c.note || 'Not shown') + '</span>') + '</td></tr>';
      }).join('');
      var coverage = cov ? '<section class="card"><div class="card-head"><h2>What this demo covers</h2><span class="note">One row per story in the plan</span></div><div class="scroll"><table><thead><tr><th scope="col">Story</th><th scope="col">What it builds</th><th scope="col">Where to see it</th></tr></thead><tbody>' + cov + '</tbody></table></div></section>' : '';
      return head(s) + coverage + '<div class="split"><div class="stack"><h2>Guardrails</h2>' + (g || '<div class="card"><div class="empty">The plan has no guardrails.</div></div>') + '</div><div class="stack"><h2>Connections</h2>' + sys +
        '<h2>About this demo</h2><div class="card agent"><p>Every person, time and number on these screens is made up. The screens, rules and agents come from the project plan.</p><dl class="facts"><dt>Project</dt><dd>' + esc(src.project) + '</dd><dt>Plan</dt><dd>version ' + esc(src.plan_version) + ' · ' + esc(String(src.plan_sha256 || '').slice(0, 12)) + '</dd><dt>Sample seed</dt><dd>' + esc(src.seed) + '</dd><dt>Built</dt><dd>' + esc(String(src.generated_at || '').slice(0, 10)) + '</dd></dl></div></div></div>';
    }
  };

  /*
   * The trust screen. Added as its own assignment rather than inside the
   * RENDER literal above because \`boot()\` also synthesizes a screen of this
   * type when a spec does not declare one: the standard asks for the timeline
   * to be universal, so it cannot depend on each project's spec remembering
   * to ask for it.
   */
  RENDER.trust = function (s) {
    var n = (SPEC.events || []).length;
    return head(s, '<span class="pill">' + n + (n === 1 ? ' action' : ' actions') + '</span>')
      + '<section class="card pad">' + trustTimeline(s.limit) + '</section>'
      + '<p class="note" style="margin-top:14px">Every line above is invented sample data. '
      + 'The real system records the same fields for every action an agent takes, which is what '
      + 'makes a line like this auditable rather than decorative.</p>';
  };

  function detail(ekey, row) {
    var e = ent(ekey), listScreen = Object.keys(SPEC.screens).find(function (k) { var s = SPEC.screens[k]; return (s.type === 'list' || s.type === 'queue') && s.entity === ekey; });
    var h = '<div class="crumbs">' + (listScreen ? '<a href="#' + listScreen + '">' + esc(SPEC.screens[listScreen].title) + '</a>' : '<span>' + esc(e.plural || e.label) + '</span>') + '<span aria-hidden="true">/</span><span>' + esc(title(ekey, row)) + '</span></div>';
    var status = (e.fields || []).find(function (f) { return f.type === 'enum' && f.key === (e.status || 'status'); });
    h += '<div class="head"><div><h1>' + esc(title(ekey, row)) + '</h1>' + (e.detail_subtitle ? '<p>' + esc(fill(e.detail_subtitle, ekey, row)) + '</p>' : '') + '</div><div class="actions">' + (status ? show(ekey, status.key, row) : '') + actionButtons(ekey, row, e.actions) + '</div></div>';
    var facts = '<section class="card pad"><h2>' + esc(e.label) + '</h2><dl class="facts">' + (e.fields || []).map(function (f) { return '<dt>' + esc(f.label) + '</dt><dd>' + show(ekey, f.key, row) + '</dd>'; }).join('') + '</dl></section>';
    var related = '';
    Object.keys(SPEC.entities).forEach(function (ok) {
      (ent(ok).fields || []).forEach(function (f) {
        if (f.type !== 'ref' || f.ref !== ekey) return;
        var rs = rowsOf(ok).filter(function (r) { return r[f.key] === row.id; });
        if (!rs.length) return;
        var L = SPEC.app.log;
        if (L && L.entity === ok) {
          var fs = Object.keys(SPEC.screens).find(function (k) { return SPEC.screens[k].type === 'feed' && SPEC.screens[k].entity === ok; });
          var fd = SPEC.screens[fs];
          related += '<section class="card pad"><h2>What happened</h2><ol class="feed">' + rs.map(function (r) { return '<li><time>' + esc(r[fd.time]) + '</time><div>' + esc(r[fd.text]) + '<div class="meta"><span class="who ' + (r[fd.kind] === 'human' ? 'human' : '') + '">' + (r[fd.kind] === 'human' ? 'Person' : 'Agent') + '</span>' + esc(r[fd.actor]) + '</div></div></li>'; }).join('') + '</ol></section>';
        } else {
          related += '<section class="card"><div class="card-head"><h2>' + esc(ent(ok).plural || ent(ok).label) + '</h2><span class="note">' + rs.length + '</span></div>' + table(ok, rs, columnsOf(ok, f.key)) + '</section>';
        }
      });
    });
    return h + '<div class="cols"><div class="wide">' + (related || '<section class="card"><div class="empty">Nothing else in this sample points at this record.</div></section>') + '</div><div class="narrow">' + facts + '</div></div>';
  }

  // ---- shell ----------------------------------------------------------------
  // ---- the trust timeline ---------------------------------------------------
  /*
   * Renders SPEC.events: one row per action, in the order the spec lists them.
   *
   * Deliberately NOT re-sorted and deliberately NOT locale-formatted. The
   * producer owns the order, and \`toLocaleString\` would make one spec render
   * different bytes on a machine in another timezone, which breaks the
   * determinism the rest of this pipeline is built on.
   */
  var APPROVAL = {
    granted: ['ok', 'Approved by'],
    pending: ['attention', 'Waiting on'],
    denied: ['danger', 'Refused by'],
    not_required: ['faded', 'No approval needed']
  };

  // Named environments only. An allow-list rather than an echo, so a
  // hand-edited spec cannot get the word "production" onto a simulated screen,
  // and so the fallback still says plainly that this is not live.
  var ENVS = { demo: 'Demo data', sandbox: 'Sandbox', simulation: 'Simulation' };
  function envOf(v) {
    return Object.prototype.hasOwnProperty.call(ENVS, v) ? ENVS[v] : 'Not a live environment';
  }

  function trustEvent(e) {
    var st = statusOf(e.status);
    var a = e.actor || {};
    var ap = e.approval || {};
    var appr = Object.prototype.hasOwnProperty.call(APPROVAL, ap.status)
      ? APPROVAL[ap.status]
      : ['danger', 'Approval state unrecognized'];
    var when = String(e.occurred_at || '');

    var h = '<li>';
    h += '<time datetime="' + esc(when) + '">' + esc(when.slice(11, 16)) + '<br>' + esc(when.slice(0, 10)) + '</time>';
    h += '<div>';

    // What was done, and the state it is ACTUALLY in.
    h += '<div class="what"><b>' + esc(e.action) + '</b>'
      + '<span class="pill ' + st.tone + '">' + esc(st.label) + '</span>'
      + '<span class="pill' + (e.risk_level === 'high' ? ' attention' : '') + '">'
      + esc(e.risk_level ? e.risk_level + ' risk' : 'risk not stated') + '</span>'
      + '<span class="pill tier">' + esc(tierOf(e.autonomy_tier)) + '</span>'
      + '<span class="pill faded">' + esc(envOf(e.environment)) + '</span></div>';

    // Why. One line, and labelled as narrative rather than as the record.
    h += '<p class="why">' + esc(e.reason_summary) + '</p>';

    // Who acted, whether that identity was actually established, and which
    // human is accountable either way.
    h += '<div class="actor"><span>'
      + (a.type === 'agent' ? 'Agent' : (a.type === 'human' ? 'Person' : 'System'))
      + ' <b>' + esc(a.label) + '</b>' + (a.id ? ' <code>' + esc(a.id) + '</code>' : '') + '</span>'
      + '<span>' + (a.verified
        ? 'identity verified'
        : '<span class="unverified">identity asserted, not verified</span>') + '</span>'
      + '<span>accountable: <b>' + esc(e.human_owner_id) + '</b></span>'
      + '<span class="pill ' + appr[0] + '">' + esc(appr[1])
      + (ap.assigned_to ? ' ' + esc(ap.assigned_to) : '') + '</span></div>';

    // What it touched, whether it can be undone, and what backs it up.
    // An empty evidence list says so out loud: a blank space reads as "fine".
    var evid = (e.evidence_refs || []).length
      ? (e.evidence_refs || []).map(function (r) { return '<code>' + esc(r) + '</code>'; }).join('')
      : '<span class="unverified">no evidence attached</span>';
    h += '<div class="refs">'
      + '<span class="pill ' + (e.reversible ? 'faded' : 'attention') + '">'
      + (e.reversible ? 'Reversible' : 'Cannot be undone') + '</span>'
      + (e.recovery_ref ? '<span>recovery <code>' + esc(e.recovery_ref) + '</code></span>' : '')
      + ((e.side_effects || []).length
        ? '<span>touched ' + (e.side_effects || []).map(esc).join(', ') + '</span>'
        : '<span>no side effects</span>')
      + '<span>evidence ' + evid + '</span>'
      + ((e.policy_refs || []).length
        ? '<span>policy ' + (e.policy_refs || []).map(function (r) { return '<code>' + esc(r) + '</code>'; }).join('') + '</span>'
        : '')
      + '<span>trace <code>' + esc(e.trace_id) + '</code></span>'
      + '</div>';

    return h + '</div></li>';
  }

  function trustTimeline(limit) {
    var evs = SPEC.events || [];
    if (limit) evs = evs.slice(0, limit);
    if (!evs.length) return '<div class="empty">No actions have been recorded in this demo.</div>';
    return '<ul class="tl">' + evs.map(trustEvent).join('') + '</ul>';
  }

  /*
   * The permanent "this is not real" strip. ONE copy, rendered by both the
   * working page and the error page.
   *
   * The error page used to render without it, so a viewer who hit a load
   * failure saw a bare message with nothing on screen saying that what they
   * were looking at was a simulation. Two copies of this markup could also
   * drift into saying different things, which is the hazard the whole kit is
   * organized against.
   */
  function strip(withControls) {
    var a = (SPEC && SPEC.app) || {};
    var src = (SPEC && SPEC.source) || {};
    var right = '';
    if (withControls) {
      right = '<code>plan v' + esc(src.plan_version) + ' · ' + esc(String(src.plan_sha256 || '').slice(0, 7)) + '</code>'
        + '<button type="button" id="reset">Reset demo</button>'
        + (a.command_center_href ? '<a href="' + esc(a.command_center_href) + '">Command Center</a>' : '');
    }
    // "Sample data" in so many words: STORY-900's acceptance asks for a banner that says the data
    // is sample data, and "simulated" alone left a student's agent ticking it on a near miss (v12).
    return '<div class="demo-strip"><span><strong>DEMO</strong> · ' + esc(SIMULATED) + '.'
      + ' Sample data only.'
      + (a.name ? ' A preview of the finished ' + esc(a.name) + '.' : '')
      + ' Nothing here was produced by the real system.</span>'
      + '<span class="right">' + right + '</span></div>';
  }

  function navLabel(active) {
    var hit = null;
    (SPEC.nav || []).forEach(function (g) { g.items.forEach(function (it) { if (it.screen === active) hit = it.label; }); });
    return hit || 'Menu';
  }
  function phone() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches;
  }
  function navBox(active) {
    return '<details class="navbox"' + (phone() ? '' : ' open') + '><summary><span class="here">Menu · ' + esc(navLabel(active)) + '</span></summary><div class="navlist">' + nav(active) + '</div></details>';
  }
  function nav(active) {
    return (SPEC.nav || []).map(function (g) {
      return '<div class="nav-group nav"><div class="nav-label">' + esc(g.group) + '</div>' + g.items.map(function (it) {
        var extra = '';
        if (it.badge) { var n = pick(it.badge.entity, it.badge.where).length; if (n) extra = '<span class="' + (it.badge.tone === 'attention' ? 'badge' : 'count') + '">' + n + (it.badge.suffix ? ' ' + esc(it.badge.suffix) : '') + '</span>'; }
        return '<a href="#' + esc(it.screen) + '"' + (it.screen === active ? ' aria-current="page"' : '') + '>' + icon(it.icon) + '<span class="lbl">' + esc(it.label) + '</span>' + extra + '</a>';
      }).join('') + '</div>';
    }).join('');
  }
  function render() {
    ACTIONS = [];
    var name = (location.hash || '').replace(/^#/, ''), first = SPEC.nav[0].items[0].screen;
    var body, active;
    if (!SPEC.screens[name] && !ROUTES[name]) name = first;
    CURRENT = name; active = name;
    if (SPEC.screens[name]) body = RENDER[SPEC.screens[name].type](SPEC.screens[name], name);
    else if (ROUTES[name]) {
      var rt = ROUTES[name], row = find(rt.ekey, rt.id);
      body = row ? detail(rt.ekey, row) : null;
      active = Object.keys(SPEC.screens).find(function (k) { var s = SPEC.screens[k]; return (s.type === 'list' || s.type === 'queue') && s.entity === rt.ekey; }) || '';
    }
    if (!body) { active = first; body = RENDER[SPEC.screens[first].type](SPEC.screens[first], first); }
    var a = SPEC.app;
    // "(simulated)" and not just "demo": the tab title is the one piece of this page that
    // survives into a screenshot, a screen share or a bookmark, where the banner does not.
    // demoRender.ts sets the same words server-side for the moment before this runs.
    document.title = a.name + ' demo (simulated)';
    document.getElementById('app').innerHTML =
      strip(true) +
      '<div class="shell"><nav class="rail" aria-label="Main"><a class="brand" href="#' + esc(first) + '"><span class="mark">' + esc(a.name.charAt(0)) + '</span>' + esc(a.name) + '</a>' + navBox(active) +
      '<div class="rail-foot">' + ((SPEC.systems || []).length ? '<div class="conn"><b>Connections · simulated</b>' + SPEC.systems.map(function (n) { return '<div><i></i>' + esc(n) + '</div>'; }).join('') + '</div>' : '') +
      '<div class="persona"><span class="av">' + esc(a.persona.name.charAt(0)) + '</span><div><b>' + esc(a.persona.name) + '</b><span>' + esc(a.persona.role) + '</span></div></div></div></nav>' +
      '<main><div class="page">' + body + '</div></main></div>';
  }
  function boot(spec) {
    SPEC = spec;
    if (!SPEC || !SPEC.screens || !SPEC.nav) throw new Error('demo-spec.json has no screens or nav.');

    /*
     * What this demo draws, decided once, here.
     *
     * Wrapped, and the wrapping is the point: the rules are the new part of this engine and the
     * tables are the old part that works. If planning throws on some spec shape nobody has seen,
     * the demo must come up as it did before, not go blank. PLAN stays null, every visual call
     * site is already guarded on it, and the console says why for whoever is looking.
     */
    try {
      PLAN = (typeof VISUAL !== 'undefined' && VISUAL && VISUAL.visualPlan) ? VISUAL.visualPlan(SPEC) : null;
    } catch (err) {
      PLAN = null;
      if (window.console && console.warn) console.warn('demo: the visual rules did not run; falling back to tables.', err);
    }
    if (SPEC.app.accent) document.documentElement.style.setProperty('--accent', SPEC.app.accent);

    /*
     * The trust timeline is universal, so the ENGINE adds it when a spec does
     * not declare one.
     *
     * The requirement is that every generated demo inherits the timeline.
     * Leaving each project's spec responsible for asking would mean the one
     * spec that forgets ships a demo with no accountability surface at all,
     * and that is the demo that gets shown to the person who most needs it.
     *
     * Idempotent and additive: it never replaces a trust screen the spec
     * declared, and it appends a nav group rather than editing one.
     */
    if ((SPEC.events || []).length) {
      var declared = Object.keys(SPEC.screens).some(function (k) {
        return SPEC.screens[k] && SPEC.screens[k].type === 'trust';
      });
      if (!declared) {
        SPEC.screens[TRUST_SCREEN] = {
          type: 'trust',
          title: 'Trust and activity',
          subtitle: 'Every action in this demo: who did it, which person is accountable, and what state it is actually in.'
        };
        SPEC.nav = SPEC.nav.concat([{
          group: 'Accountability',
          items: [{ label: 'Trust and activity', screen: TRUST_SCREEN, icon: 'shield' }]
        }]);
      }
    }
    var load = function () {
      ROWS = {}; ROUTES = {};
      Object.keys(SPEC.entities).forEach(function (k) {
        ROWS[k] = JSON.parse(JSON.stringify(SPEC.entities[k].rows || []));
        ROWS[k].forEach(function (r) { ROUTES[routeOf(k, r)] = { ekey: k, id: r.id }; });
      });
    };
    load();
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.id === 'reset') { load(); FILTERS = {}; render(); toast('Demo reset to its starting sample.'); }
      else if (b.dataset.act !== undefined) { var x = ACTIONS[Number(b.dataset.act)]; if (x) act(x.ekey, x.id, x.action); }
      else if (b.dataset.filter !== undefined) { FILTERS[CURRENT] = b.dataset.filter; render(); }
    });
    window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
    render();
  }
  function fail(msg) {
    // strip() first: a failure page with no label is a page that has quietly
    // stopped saying this is a simulation.
    document.getElementById('app').innerHTML = strip(false) + '<div class="err"><strong>The demo could not load.</strong><p>' + esc(msg) + '</p><p>If you opened this file with a double-click, the browser blocks it from reading demo-spec.json. Run <code>node tools/build-standalone.mjs</code> to make a single file that opens anywhere, or serve the folder over HTTP.</p></div>';
  }

  var inline = {};
  try { inline = JSON.parse(document.getElementById('demo-spec').textContent || '{}'); } catch (e) { inline = {}; }
  if (inline && inline.screens) { try { boot(inline); } catch (e) { fail(e.message); } }
  else {
    fetch('demo-spec.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('demo-spec.json returned HTTP ' + r.status); return r.json(); })
      .then(boot)
      .catch(function (e) { fail(e.message); });
  }
})();
</script>
</body>
</html>
`;

/** Byte-for-byte `demoKitAssets/scaffold-demo-spec.mjs`. */
export const DEMO_KIT_SCAFFOLD_MJS = `#!/usr/bin/env node
/*
 * scaffold-demo-spec: read a project's Command Center data and write a first-pass
 * demo-spec.json at schema_version 2: screens, navigation, the Human / Agent split, seeded
 * sample rows, AND the trust-and-work timeline the spec contract requires.
 *
 *   node tools/scaffold-demo-spec.mjs --repo <repo root> [--out demo/demo-spec.json]
 *
 * READS (all written by the spine or by STORY-000, never by this tool):
 *   .colaberry/plan.json            requirements, stories, agents, derived roles/systems/guardrails
 *   .colaberry/manifest.json        plan version + hash (stamped on the demo so staleness shows)
 *   command-center/data-model.json  the proposed tables: the shape of the sample data
 *
 * PURE apart from the file reads and the one write: no clock, no network, no Math.random.
 * The sample is seeded from the plan hash, so the same plan always gives the same demo
 * and a reviewer can tell "the plan changed" from "the dice changed".
 *
 * This is the FLOOR, not the finished demo. It is correct and connected but generic.
 * The story prompt has the builder's agent refine it into one believable scenario.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const repo = args.repo || '.';
const out = args.out || path.join(repo, 'demo', 'demo-spec.json');
const read = (p) => JSON.parse(fs.readFileSync(path.join(repo, p), 'utf8'));
const tryRead = (p) => { try { return read(p); } catch { return null; } };

const plan = read('.colaberry/plan.json');
const manifest = tryRead('.colaberry/manifest.json') || {};
const model = tryRead('command-center/data-model.json') || { tables: [] };
const tables = model.tables || [];
const derived = plan.derived || {};
const project = plan.project || {};
const sha = manifest.plan_sha256 || project.plan_sha256 || '';

// ---- seeded randomness -------------------------------------------------------
const seed = parseInt(sha.slice(0, 8), 16) || 1;
let state = seed >>> 0;
const rnd = () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const one = (xs) => xs[Math.floor(rnd() * xs.length)];

const FIRST = ['Ana', 'Ben', 'Elena', 'Jo', 'Leah', 'Marcus', 'Priya', 'Sam', 'Tomas', 'Noor', 'Wei', 'Imani', 'Luca', 'Dara'];
const LAST = ['Flores', 'Carter', 'Ruiz', 'Tanaka', 'Brandt', 'Bell', 'Nair', 'Okafor', 'Vega', 'Haddad', 'Chen', 'Mbeki', 'Rossi', 'Quinn'];
const AREAS = ['North side', 'Riverside', 'Old Town', 'East End', 'Hillcrest', 'Lakeview'];
const ACCENTS = ['#0F766E', '#1D4ED8', '#7C3AED', '#9D174D', '#0E7490', '#3F6212'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The demo's "today" is the day the plan was synced: a fact, not a clock read.
const base = new Date(manifest.generated_at || '2026-01-05T12:00:00Z');
const dayStr = (offset) => { const d = new Date(base.getTime() + offset * 86400000); return \`\${MONTHS[d.getUTCMonth()]} \${d.getUTCDate()}\`; };
const timeStr = (mins) => { const h = Math.floor(mins / 60), m = mins % 60; return \`\${((h + 11) % 12) + 1}:\${String(m).padStart(2, '0')} \${h < 12 ? 'AM' : 'PM'}\`; };

const human = (s) => { const t = String(s).replace(/_id$/, '').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const plural = (s) => (/[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/.test(s) ? s + 'es' : s + 's');
const tableNames = tables.map((t) => t.name);

// ---- tables -> entities ------------------------------------------------------
const OK = /^(filled|approved|yes|connected|closed|done|complete|active|resolved|paid|sent)$/i;
const ATT = /^(open|pending|waiting|escalated|error|overdue|new|draft)$/i;

function fieldOf(table, f) {
  const note = f.note || '';
  const baseDef = { key: f.name, label: human(f.name) };
  if (/RESTRICTED/i.test(note)) return { ...baseDef, type: 'private', shown_as: 'Private. Never shared.' };
  if (f.type === 'ref') {
    const named = tableNames.find((n) => note.split(/[\\s,]/)[0] === n) || tableNames.filter((n) => f.name.includes(n)).sort((a, b) => b.length - a.length)[0];
    if (!named) return { ...baseDef, type: 'text' };
    return { ...baseDef, type: 'ref', ref: named, nullable: /null/i.test(note) };
  }
  if (f.type === 'enum') {
    const values = note.split('|').map((v) => v.trim()).filter(Boolean);
    const tones = Object.fromEntries(values.map((v) => [v, OK.test(v) ? 'ok' : ATT.test(v) ? 'attention' : '']).filter(([, t]) => t));
    return { ...baseDef, type: 'enum', values, tones };
  }
  if (f.type === 'boolean') return { ...baseDef, type: 'bool' };
  if (f.type === 'timestamp') return { ...baseDef, type: 'datetime' };
  if (['date', 'time', 'number', 'text'].includes(f.type)) return { ...baseDef, type: f.type };
  return null; // json and anything unknown is not shown
}

const entities = {};
for (const t of tables) {
  const fields = (t.fields || []).filter((f) => f.type !== 'id').map((f) => fieldOf(t, f)).filter(Boolean);
  const isPeople = fields.some((f) => f.key === 'name') && fields.some((f) => /email|mobile|phone/.test(f.key));
  const isLog = /audit|event|log|activity|history/.test(t.name) && fields.some((f) => f.type === 'datetime');
  const refs = fields.filter((f) => f.type === 'ref');
  // A record with no name is titled by what it belongs to and when: "Office B · Nov 20".
  // Prefer a ref to a named place or thing, then a named person, then anything.
  const named = (f) => (tables.find((x) => x.name === f.ref).fields || []).some((x) => x.name === 'name');
  const person = (f) => (tables.find((x) => x.name === f.ref).fields || []).some((x) => /email|mobile|phone/.test(x.name));
  const bestRef = [...refs].sort((a, b) => (named(a) ? (person(a) ? 1 : 0) : 2) - (named(b) ? (person(b) ? 1 : 0) : 2))[0];
  let title = fields.some((f) => f.key === 'name') ? 'name' : null;
  if (!title) {
    const parts = [bestRef, fields.find((f) => ['date', 'datetime'].includes(f.type))].filter(Boolean).map((f) => \`{\${f.key}}\`);
    title = parts.length ? parts.join(' · ') : 'id';
  }
  const inTitle = (title.match(/\\{(\\w+)\\}/g) || [title]).map((k) => k.replace(/[{}]/g, ''));
  const status = fields.find((f) => f.type === 'enum' && /status|decision|response|state/.test(f.key)) || fields.find((f) => f.type === 'enum');
  entities[t.name] = {
    label: human(t.name), plural: plural(human(t.name)), table: t.name, purpose: t.purpose, derived_from: t.derived_from || [],
    title, status: status ? status.key : undefined, isPeople, isLog,
    columns: fields.filter((f) => f.type !== 'private' && !inTitle.includes(f.key)).slice(0, 5).map((f) => f.key),
    fields, rows: [],
  };
}

// ---- sample rows: ids first, so every ref can point at a real row -------------
const agents = plan.agents || [];
const personaName = (() => {
  for (const r of plan.requirements || []) {
    const m = /\\b(?:page|notify|alert|ask)\\s+([A-Z][a-z]+)\\b/.exec(r.statement) || /\\b([A-Z][a-z]+)\\s+approv/.exec(r.statement);
    if (m && !['The', 'System'].includes(m[1])) return m[1];
  }
  return 'You';
})();
const roles = derived.roles || [];
// "As Dana, …" and "As a hygienist, …" both narrate a story; the article is optional.
const reEsc = (s) => String(s).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
const narratedBy = (role) => new RegExp(\`^\\\\s*As\\\\s+(?:an?\\\\s+)?\${reEsc(role)}\\\\s*,\`, 'i');
// The demo is the screen of whoever narrates the most stories. ShiftFill v12 took the LAST
// role instead, and showed Dana as "Hygienist" though 16 of 17 stories were hers.
const ownRole = [...roles]
  .map((role, i) => ({ role, i, n: (plan.stories || []).filter((s) => narratedBy(role).test(s.narrative || '')).length }))
  .sort((a, b) => b.n - a.n || a.i - b.i)[0]?.role;
// A role that is the person's own name ("Dana") is not a job title to print under it.
const personaRole = !ownRole || ownRole.toLowerCase() === personaName.toLowerCase() ? 'Operator' : human(ownRole);

// Lower-case letters and digits, as DEMO_SPEC_CONTRACT.md requires ("g101", not "G-101").
const prefix = (name) => name.split('_').map((w) => w[0]).join('').toLowerCase();
const countFor = (e) => (e.isLog ? 10 : e.isPeople ? 8 : e.fields.some((f) => f.type === 'ref') ? 6 : 3);
for (const [key, e] of Object.entries(entities)) e.rows = Array.from({ length: countFor(e) }, (_, i) => ({ id: \`\${prefix(key)}\${101 + i}\` }));

const usedNames = new Set();
function value(key, e, f, i) {
  if (f.type === 'private') return undefined;
  if (f.type === 'ref') return f.nullable && rnd() < 0.4 ? null : one(entities[f.ref].rows).id;
  if (f.type === 'enum') return f.values[i < f.values.length ? i : int(0, f.values.length - 1)];
  if (f.type === 'bool') return rnd() < 0.85;
  if (f.type === 'date') return dayStr(int(-2, 2));
  if (f.type === 'time') return timeStr(one([420, 480, 540, 720, 780, 900]));
  if (f.type === 'datetime') return e.isLog ? \`\${dayStr(0)}, \${timeStr(420 - i * 6)}\` : \`\${dayStr(int(-1, 0))}, \${timeStr(int(36, 90) * 10)}\`;
  if (f.type === 'number') {
    if (/weekly|projected/.test(f.key)) return int(6, 11) * 4;
    if (/hour/.test(f.key)) return one([4, 6, 8]);
    if (/minute/.test(f.key)) return int(5, 30);
    if (/rank|wave|number/.test(f.key)) return (i % 3) + 1;
    if (/adjust/.test(f.key)) return int(-2, 2);
    return int(1, 20);
  }
  // text
  if (f.key === 'name' && e.isPeople) { let n; do { n = \`\${one(FIRST)} \${one(LAST)}\`; } while (usedNames.has(n)); usedNames.add(n); return n; }
  if (f.key === 'name') return \`\${e.label} \${String.fromCharCode(65 + i)}\`;
  if (/email/.test(f.key)) return null; // filled from the name below
  if (/mobile|phone/.test(f.key)) return \`555-01\${String(10 + i).padStart(2, '0')}\`;
  if (/location|address/.test(f.key)) return AREAS[i % AREAS.length];
  if (/_ref$/.test(f.key)) return \`ref-\${(seed + i * 7919).toString(16).slice(-5)}\`;
  if (/actor/.test(f.key) && agents.length) return agents[i % agents.length].name;
  if (/action|text|what|message|statement/.test(f.key) && agents.length) return \`Produced: \${(agents[i % agents.length].outputs || [])[0] || 'a result'}\`; // v13: an agent with outputs: [] printed "Produced: undefined"
  if (/(_to|_by)$/.test(f.key)) return personaName;
  if (/channel/.test(f.key)) return one((derived.systems || ['Email']));
  return \`Sample \${f.label.toLowerCase()}\`;
}
/*
 * A row must never claim something happened that its own state says has not.
 *
 * ShiftFill v13 (2026-11-24): three agency messages read \`review: pending\` with a \`sent_at\`,
 * which is a sample row breaking the plan's own guardrail ("Dana approves any message to a temp
 * agency before it is sent"), and the demo story's Trust line forbids exactly that. The check
 * above only read ONE status field per entity, and never blanked a sent time.
 *
 * Every enum on the row is read, and its state decides what cannot have happened yet:
 *   - a GATE state (held, pending review, awaiting approval, draft, queued) on any field that is
 *     not about a reply: nothing past the gate happened, so no sent / delivered / approved /
 *     decided / accepted / filled / replied value;
 *   - a waiting state on a REPLY field (reply, response, answer): the message went out, but no
 *     reply came, so only the reply's own values are blanked. A sent offer keeps its sent time.
 */
const GATE_STATE = /^(held|on[ _]hold|pending|awaiting(?:[ _]\\w+)?|draft|queued|in[ _]review|not[ _]sent|unsent)$/i;
// "held" on a reply field is still a gate (v13: an offer held for overtime approval read
// \`response: held\` with a sent time); "pending" there only means no reply yet.
const HELD = /^(held|on[ _]hold|draft|queued|not[ _]sent|unsent)$/i;
const WAITING_REPLY = /^(pending|waiting|awaiting(?:[ _]\\w+)?|none|no[ _]reply)$/i;
// A person refused it, so it never went out (v13: a \`rejected\` agency message with a sent time).
// Not on reply fields: a hygienist answering "no" does not unsend the offer.
const REFUSED = /^(rejected|declined|denied|cancell?ed|not[ _]approved)$/i;
const REPLY_FIELD = /reply|response|answer/;
const PAST_GATE = /(^|_)(sent|delivered|released|approved|decided|accepted|filled|replied|responded|answered|closed|resolved|completed)(_|$)/;
const REPLIED = /(^|_)(replied|responded|answered|accepted)(_|$)/;
const SENT = /(^|_)(sent|delivered|released)(_|$)/;
function blankFor(key, state) {
  if (REPLY_FIELD.test(key)) return HELD.test(state) ? PAST_GATE : WAITING_REPLY.test(state) ? REPLIED : null;
  return GATE_STATE.test(state) ? PAST_GATE : REFUSED.test(state) ? SENT : null;
}
// "Nov 22, 1:20 PM" as minutes, for ordering only. Null for anything else.
const MON = 'JanFebMarAprMayJunJulAugSepOctNovDec';
function stamp(v) {
  const m = /^([A-Z][a-z]{2}) (\\d{1,2}), (\\d{1,2}):(\\d{2}) (AM|PM)$/.exec(String(v ?? ''));
  if (!m || MON.indexOf(m[1]) < 0) return null;
  return (((MON.indexOf(m[1]) / 3) * 31 + Number(m[2])) * 24 + (Number(m[3]) % 12) + (m[5] === 'PM' ? 12 : 0)) * 60 + Number(m[4]);
}
function keepRowCoherent(e, row) {
  // A reply never comes before what it answers (v13: an offer answered a day before it was sent).
  const sentKey = e.fields.find((g) => SENT.test(g.key) && stamp(row[g.key]) !== null)?.key;
  const replyKey = e.fields.find((g) => REPLIED.test(g.key) && stamp(row[g.key]) !== null)?.key;
  if (sentKey && replyKey && stamp(row[replyKey]) < stamp(row[sentKey])) [row[sentKey], row[replyKey]] = [row[replyKey], row[sentKey]];
  for (const f of e.fields) {
    if (f.type !== 'enum' || row[f.key] == null) continue;
    const blank = blankFor(f.key, String(row[f.key]));
    if (!blank) continue;
    for (const g of e.fields) if (g !== f && g.type !== 'enum' && blank.test(g.key)) row[g.key] = null;
  }
}

for (const [key, e] of Object.entries(entities)) {
  e.rows.forEach((row, i) => {
    for (const f of e.fields) { const v = value(key, e, f, i); if (v !== undefined) row[f.key] = v; }
    for (const f of e.fields) if (/email/.test(f.key) && row.name) row[f.key] = \`\${row.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com\`;
    // Something still open or pending has not been filled, decided or answered yet.
    if (e.status && ATT.test(String(row[e.status]))) {
      for (const f of e.fields) if (/filled|decided|responded|closed|resolved|completed/.test(f.key)) row[f.key] = null;
    }
    keepRowCoherent(e, row);
  });
}

// ---- which entity is which kind of screen ------------------------------------
const logKey = Object.keys(entities).find((k) => entities[k].isLog) || null;
const gated = agents.filter((a) => a.autonomy_level !== 'acts_autonomously');
// The approval queue is the table that records the decision a gated agent waits for:
// it carries pending/approved, and it was derived from the requirement that agent stops at.
const gateIds = gated.flatMap((a) => (a.approval_gates || []).map((t) => t.split(/\\s/)[0]));
const queueScore = (k) => entities[k].derived_from.filter((r) => gateIds.includes(r)).length * 2 + (/approv|decision|review|sign/.test(k) ? 3 : 0);
const queueKey = gated.length ? Object.keys(entities)
  .filter((k) => entities[k].fields.some((f) => f.type === 'enum' && f.values.includes('pending') && f.values.some((v) => /approved|declined|rejected/.test(v))))
  .sort((a, b) => queueScore(b) - queueScore(a))[0] || null : null;

if (logKey) {
  const L = entities[logKey];
  L.fields.push({ key: 'actor_kind', label: 'Done by', type: 'who' });
  L.rows.forEach((r) => { r.actor_kind = 'agent'; });
}

// Stories that give a person something to open decide what is in "Work".
const workStories = (plan.stories || []).filter((s) => s.workspace && s.workspace.kind === 'workspace');
const score = (key) => workStories.reduce((n, s) => n + (s.fulfills || []).filter((r) => entities[key].derived_from.includes(r)).length, 0);
const storiesFor = (key) => workStories.filter((s) => (s.fulfills || []).some((r) => entities[key].derived_from.includes(r)));
const listable = Object.keys(entities).filter((k) => k !== logKey && k !== queueKey);
const work = listable.filter((k) => entities[k].status && score(k) > 0).sort((a, b) => score(b) - score(a)).slice(0, 4);
const records = listable.filter((k) => !work.includes(k));

const screens = {};
const ICON = (e) => (e.isPeople ? 'people' : e.fields.some((f) => f.type === 'date') ? 'calendar' : 'grid');
const listScreen = (key) => {
  const e = entities[key], st = storiesFor(key);
  const filter = e.status || (e.fields.find((f) => f.type === 'ref') || {}).key;
  screens[plural(key).replace(/_/g, '-')] = {
    type: 'list', title: e.plural, subtitle: e.purpose, entity: key, filter,
    from: st.map((s) => s.id), release: st.length ? st.map((s) => s.release).sort()[0] : undefined,
  };
  return { screen: plural(key).replace(/_/g, '-'), label: e.plural, icon: ICON(e) };
};
const workItems = work.map(listScreen);
// Every table gets a screen, so every record can be opened. Only the ones a person would
// go looking for get a place in the navigation; the rest are reached from the records they belong to.
const recordItems = records.map((k) => [k, listScreen(k)]).filter(([k]) => entities[k].isPeople || entities[k].title === 'name' || entities[k].status).map(([, item]) => item);

if (queueKey) {
  const e = entities[queueKey], f = e.fields.find((x) => x.type === 'enum' && x.values.includes('pending'));
  const yes = f.values.find((v) => /approved/.test(v)), no = f.values.find((v) => /declined|rejected/.test(v));
  const who = (e.fields.find((x) => x.type === 'ref' && entities[x.ref].isPeople) || e.fields.find((x) => x.type === 'ref') || { key: 'id' }).key;
  const gate = (derived.guardrails || []).find((g) => gated.some((a) => (a.approval_gates || []).some((t) => t.startsWith(g.id))));
  screens.approvals = {
    type: 'queue', title: 'Approvals', subtitle: \`Work an agent has prepared and may not release without \${personaName}.\`,
    entity: queueKey, pending: { [f.key]: 'pending' }, card_title: \`\${e.label}: {\${who}}\`,
    facts: e.columns.filter((c) => c !== f.key),
    actions: [
      { label: 'Approve', tone: 'primary', set: { [f.key]: yes }, log: \`{persona} approved: {\${who}}\`, toast: 'Approved. The agent carries on from here.' },
      ...(no ? [{ label: 'Decline', set: { [f.key]: no }, log: \`{persona} declined: {\${who}}\`, toast: 'Declined. The agent skips this one.' }] : []),
    ],
    rule: gate ? gate.statement : undefined,
    from: gated.flatMap((a) => a.owns || []),
  };
}
if (logKey) {
  const L = entities[logKey], t = (k) => (L.fields.find((f) => k.test(f.key)) || {}).key;
  screens.activity = { type: 'feed', title: 'Activity log', subtitle: 'Every step each agent and person took, newest first.', entity: logKey, time: (L.fields.find((f) => f.type === 'datetime') || {}).key, actor: t(/actor/) || 'id', kind: 'actor_kind', text: t(/action|text|what|message/) || 'id' };
}
screens['who-does-what'] = { type: 'roster', title: 'Who does what', subtitle: 'The split the plan made between agents and people.' };
screens.rules = { type: 'rules', title: 'Rules and connections', subtitle: 'What the finished system must never do, and what it plugs into.' };

// A tile counts the state that needs watching (open, pending, ...). A table with no such state gets no tile.
const firstOf = (key) => { const e = entities[key], f = e.fields.find((x) => x.key === e.status); const v = f.values.find((x) => ATT.test(x)); return v ? { field: f.key, value: v } : null; };
screens.today = {
  type: 'home', title: personaName === 'You' ? project.name || 'Home' : \`Good morning, \${personaName}\`, subtitle: project.descriptor || plan.descriptor || '',
  blocks: [
    { type: 'counts', items: [
      ...(queueKey ? [{ label: 'Waiting on you', entity: queueKey, where: screens.approvals.pending, to: 'approvals', tone: 'attention' }] : []),
      ...work.filter((k) => firstOf(k)).map((k) => { const s = firstOf(k); return { label: \`\${human(s.value)} \${entities[k].plural.toLowerCase()}\`, entity: k, where: { [s.field]: s.value }, to: plural(k).replace(/_/g, '-') }; }),
    ] },
    ...(queueKey ? [{ type: 'queue', queue: 'approvals', limit: 1 }] : []),
    ...(work[0] ? [{ type: 'list', title: entities[work[0]].plural, entity: work[0], limit: 5, more: plural(work[0]).replace(/_/g, '-') }] : []),
    ...(logKey ? [{ type: 'feed', title: 'What the agents did', feed: 'activity', limit: 6 }] : []),
  ],
};

const nav = [
  { group: 'Work', items: [{ screen: 'today', label: 'Today', icon: 'home' }, ...workItems, ...(queueKey ? [{ screen: 'approvals', label: 'Approvals', icon: 'check', badge: { entity: queueKey, where: screens.approvals.pending, tone: 'attention' } }] : [])] },
  ...(recordItems.length || logKey ? [{ group: 'Records', items: [...recordItems, ...(logKey ? [{ screen: 'activity', label: 'Activity log', icon: 'list' }] : [])] }] : []),
  { group: 'System', items: [{ screen: 'who-does-what', label: 'Who does what', icon: 'flow' }, { screen: 'rules', label: 'Rules', icon: 'shield' }] },
];

// ---- the Human / Agent split, straight from the plan --------------------------
const people = roles.map((role) => {
  const re = narratedBy(role);
  const mine = role === ownRole;
  const decides = workStories.filter((s) => re.test(s.narrative || '')).map((s) => \`\${human(s.workspace.action || 'review')} in \${s.workspace.ref}\`);
  if (mine) agents.forEach((a) => (a.escalation_rules || []).forEach((r) => decides.push(r)));
  return { role: human(role), decides, screen: queueKey && mine ? 'approvals' : undefined };
}).filter((p) => p.decides.length);

// One row per story: where a reviewer can see it, or an honest "not shown".
const coverage = (plan.stories || []).map((s) => {
  const hit = Object.keys(screens).find((k) => (screens[k].from || []).includes(s.id));
  const headless = !s.workspace || s.workspace.kind !== 'workspace';
  return { story: s.id, title: s.title, screen: hit || (headless ? 'who-does-what' : null), label: hit ? screens[hit].title : headless ? 'Runs in the background: Who does what' : undefined, note: hit || headless ? undefined : 'No screen yet. Add one when you refine the demo.' };
});

// ---- the trust-and-work timeline (demo-spec v2) -------------------------------
/*
 * WHY THIS BLOCK EXISTS, and why it was missing.
 *
 * The spec contract moved to v2 when the trust standard landed: \`schema_version: 2\`, an
 * \`environment\`, and an \`events\` array where every action carries a structured actor, an
 * accountable human, a causal reason, evidence and policy references, an approval state, its
 * side effects, whether it is reversible, and where to recover. \`demoRender.ts\` validates
 * against that contract and REFUSES anything else.
 *
 * This tool kept emitting v1 with no events at all. The engine shipped beside it reads
 * \`SPEC.events\` and renders the timeline, so a hand-scaffolded spec rendered a demo with no
 * timeline, and the platform's public route rejected it outright. A student following this
 * kit's own instructions produced a file that could not be published.
 *
 * THE SHAPE MIRRORS \`connectedDemoSpec.ts\`, deliberately, because two derivations of the same
 * contract is the duplicate-truth failure the kit is vendored in one place to prevent. One
 * difference, and it is an improvement rather than a divergence: the generator picks actors and
 * owners from a fixed list because it has only a plan, while this tool is run inside the
 * student's repo and can name the agents and the persona THEIR plan declares.
 *
 * THE LIFECYCLE IS SPREAD ON PURPOSE. A timeline where every action succeeded is the demo the
 * trust standard exists to prevent: it teaches a viewer that the system always works, which is
 * the one thing no system does. Every third action fails and every fifth is reverted, so a
 * scaffolded demo always shows at least one action that did not complete, and what was done
 * about it.
 */
const specStories = (plan.stories || []).filter((s) => s && s.id && s.title);

/* The actors this plan actually declares. A plan with no agents gets the system as the actor,
 * which is true rather than convenient: something performed the action. */
const eventActors = agents.length
  ? agents.map((a) => ({ type: 'agent', id: a.id, label: a.name || a.id }))
  : [{ type: 'system', id: 'system', label: \`\${project.name || plan.project_name || 'The build'} runtime\` }];

const events = specStories.map((s, i) => {
  const failed = i > 0 && i % 3 === 0;
  const reverted = i > 0 && i % 5 === 0;
  const status = reverted ? 'reverted' : failed ? 'failed' : i === 1 ? 'executing' : 'succeeded';
  const highRisk = failed || reverted;
  const actor = eventActors[i % eventActors.length];
  const occurred = new Date(base.getTime() + i * 37 * 60 * 1000);

  return {
    event_id: \`\${s.id}-E1\`,
    occurred_at: occurred.toISOString(),
    work_id: s.id,
    trace_id: \`trace-\${String(s.id).toLowerCase()}\`,
    parent_event_id: i === 0 ? null : \`\${specStories[i - 1].id}-E1\`,

    // \`verified: false\` is not a placeholder. A demo can verify no identity, and the contract
    // requires it be able to say so rather than implying a guarantee it does not have.
    actor: { ...actor, verified: false },
    human_owner_id: personaName === 'You' ? personaRole : personaName,

    action: s.title,
    status,
    risk_level: highRisk ? 'high' : i % 2 === 0 ? 'low' : 'medium',
    autonomy_tier: highRisk ? 'A2' : i % 2 === 0 ? 'A1' : 'A3',

    reason_summary: s.narrative || \`\${s.title} (no narrative on this story)\`,
    evidence_refs: [\`\${s.id}/acceptance\`],
    // The requirements this story fulfills ARE its policy references: they are the stated rules
    // the action is answerable to, and they come from the plan rather than from this tool.
    policy_refs: (s.fulfills || []).slice(0, 2),

    approval: highRisk
      ? { required: true, status: 'granted', assigned_to: personaName === 'You' ? personaRole : personaName }
      : { required: false, status: 'not_required', assigned_to: null },

    side_effects: failed ? [] : ['demo-fixtures'],
    reversible: !reverted,
    recovery_ref: reverted ? \`\${s.id}/recovery\` : null,
    environment: 'demo',
  };
});

const privateTables = Object.values(entities).filter((e) => e.fields.some((f) => f.type === 'private'));
const spec = {
  schema_version: 2,
  environment: 'demo',
  events,
  // Every key here is a STRING or omitted, never null. The contract types them as optional
  // strings, and Zod treats null as a type error rather than as absence, so a repo without a
  // manifest used to emit \`plan_version: null\` and the whole spec was refused. \`seed\` was a
  // number for the same reason: nobody had ever validated this block, because the version
  // check failed first, so the first validation of it found both at once.
  source: Object.fromEntries(Object.entries({
    project: project.name || plan.project_name,
    plan_version: manifest.plan_version ?? project.plan_version,
    plan_sha256: sha,
    generated_at: manifest.generated_at,
    seed: String(seed),
  }).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])),
  app: {
    name: project.name || plan.project_name || 'Project', descriptor: project.descriptor || plan.descriptor || '', accent: ACCENTS[seed % ACCENTS.length],
    persona: { name: personaName, role: personaRole }, clock: \`\${DAYS[base.getUTCDay()]}, \${LONG_MONTHS[base.getUTCMonth()]} \${base.getUTCDate()}\`,
    command_center_href: '../index.html',
    ...(logKey ? { log: { entity: logKey, time: screens.activity.time, actor: screens.activity.actor, kind: 'actor_kind', text: screens.activity.text } } : {}),
  },
  nav, screens,
  entities: Object.fromEntries(Object.entries(entities).map(([k, e]) => { const { isPeople, isLog, purpose, derived_from, ...keep } = e; return [k, { ...keep, derived_from }]; })),
  agents: agents.map((a) => ({ id: a.id, name: a.name, purpose: a.purpose, trigger: a.trigger, autonomy: a.autonomy_level, stops_when: (a.escalation_rules || []).join('; ') || undefined, screen: a.autonomy_level !== 'acts_autonomously' && queueKey ? 'approvals' : undefined })),
  people,
  guardrails: (derived.guardrails || []).map((g) => ({
    id: g.id, statement: g.statement,
    shown_as: queueKey && entities[queueKey].derived_from.includes(g.id) ? 'The work is held in Approvals until a person decides.'
      : privateTables.some((e) => e.derived_from.includes(g.id)) && /share|reason|private|disclos/i.test(g.statement) ? 'The field shows as private on every screen and holds no sample value.' : undefined,
  })),
  systems: derived.systems || [],
  coverage,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, \`\${JSON.stringify(spec, null, 2)}\\n\`);
console.log(\`wrote \${out}: \${Object.keys(screens).length} screens, \${Object.keys(entities).length} entities, \${Object.values(entities).reduce((n, e) => n + e.rows.length, 0)} sample rows, \${events.length} timeline events, seed \${seed}\`);
`;

/** Byte-for-byte `demoKitAssets/build-standalone.mjs`. */
export const DEMO_KIT_STANDALONE_MJS = `#!/usr/bin/env node
/*
 * build-standalone — put demo-spec.json inside the demo page, so the result is ONE
 * file that opens with a double-click, attaches to an email, or drops into a slide.
 *
 *   node tools/build-standalone.mjs <demo dir> [out.html]
 *
 * <demo dir> holds index.html (the engine) and demo-spec.json. Default out: <demo dir>/standalone.html
 */
import fs from 'node:fs';
import path from 'node:path';

const [dir = 'demo', outArg] = process.argv.slice(2);
const engine = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'demo-spec.json'), 'utf8'));
const slot = '<script type="application/json" id="demo-spec">{}</script>';
if (!engine.includes(slot)) { console.error('index.html has no empty demo-spec slot. Is it the engine file?'); process.exit(1); }
// "</" inside JSON would end the script tag early; "<\\/" is the same string to JSON.parse.
const json = JSON.stringify(spec).replace(/<\\//g, '<\\\\/');
const name = (spec.app && spec.app.name) || 'Connected';
const html = engine
  .replace(slot, () => \`<script type="application/json" id="demo-spec">\${json}</script>\`)
  .replace('<title>Connected demo</title>', () => \`<title>\${name} Connected Demo</title>\`);
const out = outArg || path.join(dir, 'standalone.html');
fs.writeFileSync(out, html);
console.log(\`wrote \${out} (\${(html.length / 1024).toFixed(0)} KB)\`);
`;

/** Byte-for-byte `demoKitAssets/DEMO_SPEC_CONTRACT.md`. */
export const DEMO_KIT_CONTRACT_MD = `# demo-spec.json: the contract

\`demo/index.html\` is an engine. It contains nothing about any project and draws whatever
\`demo/demo-spec.json\` describes. To change the demo, change the spec. Never edit the engine.

The scaffold (\`scaffold-demo-spec.mjs\`) writes a first spec from the plan and the data model.
The builder's agent refines it. This file says what each part means.

## Top level

| Key | What it is |
|---|---|
| \`schema_version\` | **\`2\`.** Not 1. The renderer validates against this contract and REFUSES any other value, so a spec at version 1 renders nothing and cannot be published. |
| \`environment\` | One of \`demo\`, \`sandbox\`, \`simulation\`. **\`production\` is not a permitted value**, which is the point: a simulated screen can never claim to be the real system. |
| \`events\` | **Required.** The trust-and-work timeline, one entry per action. See *Events* below. An empty array is valid and means "this build performs no actions yet"; omitting the key is not. |
| \`source\` | Where the demo came from: \`project\`, \`plan_version\`, \`plan_sha256\`, \`generated_at\` (all copied from \`.colaberry/manifest.json\`), \`seed\`, \`inputs\`, and \`refined\` (false from the scaffold; set true once a person or agent has shaped the scenario). The banner shows the plan version and hash, so a demo built from an old plan is visible as one. |
| \`app\` | \`name\`, \`descriptor\`, \`accent\` (one hex colour, the only brand lever), \`persona\` \`{name, role}\` (who the home screen is for), \`clock\` (the one moment the sample is set in), \`command_center_href\`, and \`log\` (which entity records activity, see Actions). |
| \`nav\` | Groups of \`{screen, label, icon, badge?}\`. \`badge\` is \`{entity, where, tone?, suffix?}\` and is a live count, never a typed number. Icons: \`home calendar check grid people list doc shield flow\`. |
| \`screens\` | The screens, by id. Ids are lower-case letters, digits and hyphens: they are the address after \`#\`. |
| \`entities\` | The sample data, by key. One per data-model table the demo shows. |
| \`agents\` | From \`plan.agents\`: \`name\`, \`purpose\`, \`trigger\`, \`autonomy\`, \`stops_when\`, \`screen\`. |
| \`people\` | \`{role, decides[], screen?}\`: the decisions the plan keeps for a person. |
| \`guardrails\` | From the plan's SAFE requirements: \`id\`, \`statement\`, and \`shown_as\`, one sentence naming where in the sample the guardrail visibly holds. |
| \`systems\` | From \`plan.derived.systems\`. Always drawn as simulated. |
| \`coverage\` | One row per story: \`{story, title, screen, label}\` or \`{story, title, screen: null, note}\`. |

## Events

The timeline is what makes this a TRUST demo rather than a product tour. Each entry is one
action, and every field exists because a viewer would otherwise have to take something on faith.

| Key | What it is |
|---|---|
| \`event_id\` | Unique within the spec. |
| \`occurred_at\` | ISO-8601. Derived from the plan's sync time, never from a clock read, so the same plan gives the same timeline. |
| \`work_id\` | The piece of work this action belongs to, so several actions on one item group together. The scaffold uses the story id. |
| \`trace_id\` | The thread through a whole chain of actions. |
| \`parent_event_id\` | The action that caused this one, or \`null\` for the first. This is the CAUSAL field: a timeline that cannot say what caused what is a list, not a trace. |
| \`actor\` | \`{type, id, label, verified}\`. \`type\` is \`agent\`, \`human\` or \`system\`: a structured identity, not a flat "who". \`id\` is stable, so two actions by the same agent are provably the same agent. **\`verified\` is \`false\` in every demo**, because a demo can verify no identity and must say so rather than implying a guarantee it does not have. |
| \`human_owner_id\` | The accountable person. Required **even when the actor is a human**, so accountability is never ambiguous. |
| \`action\` | What was done, in the product's words. |
| \`status\` | The full lifecycle: \`proposed\`, \`queued\`, \`executing\`, \`succeeded\`, \`failed\`, \`canceled\`, \`reverted\`. A timeline where everything succeeded teaches a viewer that the system always works, which is the one thing no system does, so the scaffold fails every third action and reverts every fifth. |
| \`risk_level\` | \`low\`, \`medium\`, \`high\`. |
| \`autonomy_tier\` | \`A0\` to \`A4\`, and it is attached to the ACTION, never to an agent as a personality trait. The same agent may act at different tiers. |
| \`reason_summary\` | Why, in one line. Narrative, and explicitly **not** audit truth on its own: that is what the two reference lists below are for. |
| \`evidence_refs\` | What the action was based on. |
| \`policy_refs\` | The stated rules it is answerable to. The scaffold uses the requirements the story fulfills, which come from the plan rather than from the tool. |
| \`approval\` | \`{required, status, assigned_to}\`, where status is \`pending\`, \`granted\`, \`denied\` or \`not_required\`. |
| \`side_effects\` | What changed outside the system. A failed action usually has none, and saying so is the claim. |
| \`reversible\` | Whether it can be undone. |
| \`recovery_ref\` | Where to undo it, or \`null\`. A \`reverted\` action without one is a dead end. |
| \`environment\` | Same permitted set as the top level. |

## Entities

\`\`\`json
"gap": {
  "label": "Gap", "plural": "Gaps", "table": "gap",
  "title": "{office} · {shift}",
  "status": "status",
  "columns": ["hours", "status", "progress"],
  "fields": [ ... ],
  "actions": [ ... ],
  "rows": [ { "id": "b1120", "office": "b", "status": "open" } ]
}
\`\`\`

- \`title\` is a field key, or a template with \`{field}\` slots. Ref fields resolve to the title of the row they point at.
- \`rows[].id\` is lower-case letters and digits. The record's address is \`#<entity>-<id>\`.
- Every entity gets a detail page automatically: its facts, plus every row elsewhere that points at it.

### Field types

| \`type\` | Draws as | Extra keys |
|---|---|---|
| \`text\`, \`date\`, \`time\`, \`datetime\` | The value as written. Dates and times are display strings. | \`empty\` |
| \`number\` | Number with \`unit\`. | \`unit\` |
| \`enum\` | A pill. | \`labels\` (value → words), \`tones\` (value → \`ok\`, \`attention\`, \`strong\`) |
| \`ref\` | A link to that row's detail page. | \`ref\` (entity key), \`empty\` |
| \`meter\` | A bar against \`max\`. Turns to the attention colour above \`max\`, or at \`warn\`. | \`max\`, \`warn\`, \`unit\` |
| \`bool\` | Yes or No. | |
| \`who\` | An Agent or Person chip. Value \`agent\` or \`human\`. | |
| \`private\` | A lock and \`shown_as\`. **The row holds no value for this field.** Use it for anything the data model marks RESTRICTED. | \`shown_as\` |

## Screens

| \`type\` | What it is | Keys |
|---|---|---|
| \`home\` | The landing screen. | \`title\`, \`subtitle\`, \`blocks[]\`: \`counts\` (\`items[]\` of \`{label, hint, entity, where, to, tone}\`), \`queue\` (\`queue\`: a queue screen id, \`limit\`), \`list\` (\`title, entity, where, columns, limit, more\`), \`feed\` (\`title, feed\`: a feed screen id, \`limit\`, \`note\`). |
| \`list\` | A table of one entity; each row opens its detail. | \`entity\`, \`columns\`, \`filter\` (a field key: one chip per value), \`where\`, \`note\` |
| \`queue\` | Work an agent prepared that a person must release. | \`entity\`, \`pending\` (a \`where\`), \`card_title\`, \`summary\` (templates), \`facts[]\`, \`actions[]\`, \`rule\` (the guardrail text), \`columns\` (for the Decided table) |
| \`feed\` | The activity log. | \`entity\`, \`time\`, \`actor\`, \`kind\` (a \`who\` field), \`text\`, \`link\` (a ref field) |
| \`roster\` | Who does what: agents on one side, people on the other. Reads \`agents\` and \`people\`. | |
| \`rules\` | Coverage, guardrails, connections and the provenance of the demo. | |

Every screen may carry \`from\` (story ids) and \`release\`; they are printed under the title so a
reviewer can trace a screen back to the plan.

\`where\` is an object of \`field: value\` or \`field: [values]\`. All must match.

## Actions

The only thing that changes state. On a queue screen or on an entity (shown on its detail page).

\`\`\`json
{ "label": "Approve overtime", "tone": "primary",
  "when": { "decision": "pending" },
  "set": { "decision": "approved", "decided_by": "{persona}" },
  "also": [ { "entity": "shift_offer", "where": { "gap": "{gap}", "hygienist": "{hygienist}" }, "set": { "response": "waiting" } } ],
  "log": "Approved overtime for {hygienist}.",
  "toast": "Overtime approved. {hygienist} is texted in the next wave." }
\`\`\`

- \`set\` changes the row. \`also\` changes rows elsewhere; a \`where\` value written \`{field}\` means "the same value as this row's field".
- \`log\` adds a line to \`app.log.entity\`, signed by the persona as a person. This is how the demo shows a human decision next to the agents' work.
- Nothing is saved. **Reset demo** restores the starting sample.

## Rules the sample must keep

1. One moment in time. Every row agrees with it.
2. Counts are \`where\` clauses, never typed totals.
3. Every guardrail in the plan holds in the rows, and \`shown_as\` says where.
4. \`private\` fields have no value anywhere in the file.
5. People are fictional: invented names, \`555-01xx\` numbers, \`@example.com\` addresses.
6. \`coverage\` has a row for every story in the plan.
`;
