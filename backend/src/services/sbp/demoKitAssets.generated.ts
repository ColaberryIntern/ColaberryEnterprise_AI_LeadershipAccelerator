/* GENERATED FILE - DO NOT EDIT BY HAND.
 *
 * Source of truth: backend/src/services/sbp/demoKitAssets/
 * Regenerate:      node scripts/generateDemoKitAssets.js
 * Verified by:     demoKit.drift.test.ts (fails CI if this file is stale)
 *
 * Inlined rather than read at runtime because `tsc` does not copy non-TS files into dist/
 * and adding a Dockerfile COPY is ESCALATE-tier in this run's execution contract.
 */

/** Byte-for-byte `demoKitAssets/index.html`. */
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
.tl .what b { font-size: 14px; font-weight: 600; }
.tl .why { margin-top: 6px; color: var(--muted); }
/* \`.actor\`, NOT \`.who\`: \`.who\` is already the engine's uppercase bordered agent/person badge
   (see above). Reusing the name inherited its text-transform and weight, so every actor line
   rendered as a shouting all-caps bar that outcompeted the status pill it sits under. A
   collision patched with more overrides is a collision waiting to come back. */
.tl .actor { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--muted); }
.tl .actor b { color: var(--ink); font-weight: 600; }
.tl .refs { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px 8px; font-size: 12px; color: var(--muted); align-items: center; }
.tl .refs code { background: var(--wash); border-radius: 4px; padding: 1px 6px; font-size: 11px; }
.tl .unverified { color: var(--att-ink); font-weight: 600; }
.pill.danger { background: var(--bad-bg); color: var(--bad-ink); }
.pill.live { background: var(--live-bg); color: var(--live-ink); }
.pill.faded { background: var(--wash); color: var(--muted); }
.pill.tier { background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
.err { margin: 40px auto; max-width: 640px; padding: 20px; background: var(--att-bg); color: var(--att-ink); border: 1px solid var(--att-line); border-radius: 12px; }
@media (max-width: 640px) {
  main { padding: 20px 16px 40px; }
  .rail { gap: 8px; padding: 12px; }
  .nav-group { flex-direction: row; flex-wrap: wrap; }
  .nav a .lbl { flex: none; }
  .nav-label, .rail-foot { display: none; }
}
@media (prefers-reduced-motion: no-preference) { .tile, .nav a, .btn { transition: background-color .12s, border-color .12s; } }
</style>
</head>
<body>
<!-- The pre-JavaScript state. It carries the banner because this page is served from a public
     link: a viewer with JavaScript off, or one who reads the page before it boots, would
     otherwise see a bare "Loading" with nothing saying what they are looking at is a simulation.
     The wording is bound to the engine's SIMULATED constant by a test, so the two copies cannot
     drift apart. -->
<div id="app"><div class="demo-strip"><span><strong>DEMO</strong> · Simulated, not live. Nothing here was produced by the real system.</span><span class="right"></span></div><p class="err">Loading the demo…</p></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<!-- The spec. Left empty here: the engine then fetches demo-spec.json from beside this file.
     tools/build-standalone.mjs writes the spec into this tag so the page opens with a double-click. -->
<script type="application/json" id="demo-spec">{}</script>

<script>
(function () {
  'use strict';
  var SPEC = null, ROWS = {}, ROUTES = {}, FILTERS = {}, CURRENT = '';

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
      cols.forEach(function (c) { h += c === tkey ? '<td class="title">' + link + '</td>' : '<td>' + show(ekey, c, r) + '</td>'; });
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

  var RENDER = {
    home: function (s) {
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
      return head(s) + chips + '<section class="card">' + table(s.entity, rows, s.columns || columnsOf(s.entity)) + '</section>' + (s.note ? '<p class="note">' + esc(s.note) + '</p>' : '');
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
      return head(s) + '<div class="split"><div class="stack"><h2>Done by agents</h2>' + (agents || '<div class="card"><div class="empty">The plan names no agents.</div></div>') + '</div><div class="stack"><h2>Decided by people</h2>' + (people || '<div class="card"><div class="empty">The plan names no human decisions.</div></div>') + '</div></div>';
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
    return '<div class="demo-strip"><span><strong>DEMO</strong> · ' + esc(SIMULATED) + '.'
      + (a.name ? ' A preview of the finished ' + esc(a.name) + '.' : '')
      + ' Nothing here was produced by the real system.</span>'
      + '<span class="right">' + right + '</span></div>';
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
      '<div class="shell"><nav class="rail" aria-label="Main"><a class="brand" href="#' + esc(first) + '"><span class="mark">' + esc(a.name.charAt(0)) + '</span>' + esc(a.name) + '</a>' + nav(active) +
      '<div class="rail-foot">' + ((SPEC.systems || []).length ? '<div class="conn"><b>Connections · simulated</b>' + SPEC.systems.map(function (n) { return '<div><i></i>' + esc(n) + '</div>'; }).join('') + '</div>' : '') +
      '<div class="persona"><span class="av">' + esc(a.persona.name.charAt(0)) + '</span><div><b>' + esc(a.persona.name) + '</b><span>' + esc(a.persona.role) + '</span></div></div></div></nav>' +
      '<main><div class="page">' + body + '</div></main></div>';
  }
  function boot(spec) {
    SPEC = spec;
    if (!SPEC || !SPEC.screens || !SPEC.nav) throw new Error('demo-spec.json has no screens or nav.');
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
 * scaffold-demo-spec — read a project's Command Center data and write a first-pass
 * demo-spec.json: screens, navigation, the Human / Agent split, and seeded sample rows.
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
const personaRole = human(roles[roles.length - 1] || 'operator');

const prefix = (name) => name.split('_').map((w) => w[0]).join('').toUpperCase();
const countFor = (e) => (e.isLog ? 10 : e.isPeople ? 8 : e.fields.some((f) => f.type === 'ref') ? 6 : 3);
for (const [key, e] of Object.entries(entities)) e.rows = Array.from({ length: countFor(e) }, (_, i) => ({ id: \`\${prefix(key)}-\${101 + i}\` }));

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
  if (/action|text|what|message|statement/.test(f.key) && agents.length) return \`Produced: \${(agents[i % agents.length].outputs || ['a result'])[0]}\`;
  if (/(_to|_by)$/.test(f.key)) return personaName;
  if (/channel/.test(f.key)) return one((derived.systems || ['Email']));
  return \`Sample \${f.label.toLowerCase()}\`;
}
for (const [key, e] of Object.entries(entities)) {
  e.rows.forEach((row, i) => {
    for (const f of e.fields) { const v = value(key, e, f, i); if (v !== undefined) row[f.key] = v; }
    for (const f of e.fields) if (/email/.test(f.key) && row.name) row[f.key] = \`\${row.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com\`;
    // Something still open or pending has not been filled, decided or answered yet.
    if (e.status && ATT.test(String(row[e.status]))) {
      for (const f of e.fields) if (/filled|decided|responded|closed|resolved|completed/.test(f.key)) row[f.key] = null;
    }
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
  const re = new RegExp(\`^\\\\s*As an?\\\\s+\${role}\\\\s*,\`, 'i');
  const decides = workStories.filter((s) => re.test(s.narrative || '')).map((s) => \`\${human(s.workspace.action || 'review')} in \${s.workspace.ref}\`);
  if (role.toLowerCase() === personaRole.toLowerCase()) agents.forEach((a) => (a.escalation_rules || []).forEach((r) => decides.push(r)));
  return { role: human(role), decides, screen: queueKey && role.toLowerCase() === personaRole.toLowerCase() ? 'approvals' : undefined };
}).filter((p) => p.decides.length);

// One row per story: where a reviewer can see it, or an honest "not shown".
const coverage = (plan.stories || []).map((s) => {
  const hit = Object.keys(screens).find((k) => (screens[k].from || []).includes(s.id));
  const headless = !s.workspace || s.workspace.kind !== 'workspace';
  return { story: s.id, title: s.title, screen: hit || (headless ? 'who-does-what' : null), label: hit ? screens[hit].title : headless ? 'Runs in the background: Who does what' : undefined, note: hit || headless ? undefined : 'No screen yet. Add one when you refine the demo.' };
});

const privateTables = Object.values(entities).filter((e) => e.fields.some((f) => f.type === 'private'));
const spec = {
  schema_version: 1,
  source: { project: project.name || plan.project_name, plan_version: manifest.plan_version ?? project.plan_version ?? null, plan_sha256: sha || null, generated_at: manifest.generated_at || null, seed, inputs: ['.colaberry/plan.json', '.colaberry/manifest.json', 'command-center/data-model.json'], refined: false },
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
console.log(\`wrote \${out}: \${Object.keys(screens).length} screens, \${Object.keys(entities).length} entities, \${Object.values(entities).reduce((n, e) => n + e.rows.length, 0)} sample rows, seed \${seed}\`);
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
export const DEMO_KIT_CONTRACT_MD = `# demo-spec.json — the contract

\`demo/index.html\` is an engine. It contains nothing about any project and draws whatever
\`demo/demo-spec.json\` describes. To change the demo, change the spec. Never edit the engine.

The scaffold (\`scaffold-demo-spec.mjs\`) writes a first spec from the plan and the data model.
The builder's agent refines it. This file says what each part means.

## Top level

| Key | What it is |
|---|---|
| \`schema_version\` | \`1\`. |
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
