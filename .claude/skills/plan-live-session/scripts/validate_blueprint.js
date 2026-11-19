#!/usr/bin/env node
/**
 * validate_blueprint.js: the gate a blueprint.json must pass before plan-live-session reports done.
 *
 *   node validate_blueprint.js <path/to/blueprint.json> [--json]
 *
 * Two layers:
 *   1. Structure: references/blueprint.schema.json, checked by the small validator below (the repo has
 *      no JSON-schema library at the root, and this skill adds no dependencies).
 *   2. Rules the schema cannot express: minutes sum to the length, segment shape, sound-bite scores
 *      recomputed with score_soundbite.js, teach-slide diagrams, no terminal commands on slides,
 *      sourced facts backed by a URL fetched this run, idea totals recomputed with score_idea.js,
 *      cross-references between ids, deck segments that render teach slides and story beats (read
 *      from kitSpecDaySlides.ts), dayKind vs the week's checkpoints (via load_curriculum.js), the
 *      recap naming next week, claimsRegistry.ts key shapes, demand rows backed by fetched pages,
 *      deck polls matching participation questions word for word, the news window, and the
 *      routing competitors a skills-triggering teardown needs. Schedule numbers (air date and time,
 *      next air date, episode, length, minute stamps) are exempt from the public-number warning.
 *
 * Exit 0 = valid. Exit 2 = invalid (every error printed). Exit 1 = could not read the file.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scoreSoundbite, words } = require('./score_soundbite');
const { scoreIdea } = require('./score_idea');

/* ---------------- 1. minimal JSON-schema subset ---------------- */
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
function typeOk(v, t) {
  const actual = typeOf(v);
  return (Array.isArray(t) ? t : [t]).some((x) => x === actual || (x === 'number' && actual === 'integer'));
}
function validateSchema(root, schema, value, at, errors) {
  if (schema.$ref) {
    const name = schema.$ref.replace('#/$defs/', '');
    return validateSchema(root, root.$defs[name], value, at, errors);
  }
  if (schema.type && !typeOk(value, schema.type)) { errors.push(`${at}: expected ${[].concat(schema.type).join('|')}, got ${typeOf(value)}`); return; }
  if (schema.enum && !schema.enum.some((e) => e === value)) errors.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength} characters`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${at}: ${value.length} characters, max ${schema.maxLength} ("${value}")`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${at}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${at}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${at}: ${value.length} items, need at least ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${at}: ${value.length} items, at most ${schema.maxItems}`);
    if (schema.items) value.forEach((v, i) => validateSchema(root, schema.items, v, `${at}[${i}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${at}: missing required "${k}"`);
    for (const [k, s] of Object.entries(schema.properties || {})) if (k in value) validateSchema(root, s, value[k], `${at}.${k}`, errors);
  }
}

/* ---------------- 2. rules ---------------- */
const TERMINAL = /(^|\n|`)\s*(\$ |> |npm |npx |yarn |pnpm |git |cd |pip |python |node |curl |wget |docker |ssh |scp |ls |mkdir |rm |chmod |sudo |export |set -)/;
const GREETING = /^(hi|hello|hey|welcome|good (morning|afternoon|evening)|what's up)\b/i;
const BAD_START = /^(and|so|it|this)\b/i;
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
// Valid deck segment ids, read from the repo's run-of-show templates so they never drift.
// A slide tagged with any other id renders nowhere (build-class-deck, "Hard traps").
function deckSegments() {
  const fallback = {
    build: ['result-preview', 'readiness', 'build-map', 'guided-build', 'reset', 'failure', 'demos', 'broadcast', 'cta'],
    architecture: ['cold-open', 'checkin', 'business-problem', 'architecture', 'deconstruct', 'reset', 'micro-build', 'challenge', 'trivia', 'trailer'],
  };
  const f = path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'services', 'classKit', 'runOfShow.ts');
  if (!fs.existsSync(f)) return fallback;
  const src = fs.readFileSync(f, 'utf8');
  const ids = (name) => {
    const block = (src.split(`export const ${name}`)[1] || '').split('];')[0];
    return [...block.matchAll(/\{\s*id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  };
  const out = { build: ids('BUILD_RUN_OF_SHOW'), architecture: ids('ARCHITECTURE_RUN_OF_SHOW') };
  return out.build.length && out.architecture.length ? out : fallback;
}
const DECK_SEGMENTS = deckSegments();

// The subset of segments where kitSpecDaySlides.ts actually renders teach slides
// (`teachToSlides(mteach, '<id>')` = Architecture Day, `teachToSlides(tteach, '<id>')` = Build Day).
function teachSegments() {
  const fallback = { architecture: ['checkin', 'business-problem', 'architecture', 'deconstruct', 'micro-build'], build: ['build-map', 'guided-build', 'failure'] };
  const f = path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'services', 'classKit', 'kitSpecDaySlides.ts');
  if (!fs.existsSync(f)) return fallback;
  const src = fs.readFileSync(f, 'utf8');
  const ids = (v) => [...src.matchAll(new RegExp(`teachToSlides\\(${v},\\s*'([a-z-]+)'`, 'g'))].map((m) => m[1]);
  const out = { architecture: ids('mteach'), build: ids('tteach') };
  return out.architecture.length && out.build.length ? out : fallback;
}
const TEACH_SEGMENTS = teachSegments();

// The subset of segments where kitSpecDaySlides.ts actually renders story beats
// (`pushStoryBeats(out, mBeats, '<id>'` = Architecture Day, `pushStoryBeats(out, tBeats, '<id>'` =
// Build Day). A beat tagged to any other segment is dropped without a trace.
function storySegments() {
  const fallback = { architecture: ['checkin', 'business-problem', 'architecture', 'deconstruct', 'micro-build'], build: ['result-preview', 'build-map', 'failure'] };
  const f = path.join(REPO, 'backend', 'src', 'services', 'classKit', 'kitSpecDaySlides.ts');
  if (!fs.existsSync(f)) return fallback;
  const src = fs.readFileSync(f, 'utf8');
  const ids = (v) => [...src.matchAll(new RegExp(`pushStoryBeats\\(out,\\s*${v},\\s*'([a-z-]+)'`, 'g'))].map((m) => m[1]);
  const out = { architecture: ids('mBeats'), build: ids('tBeats') };
  return out.architecture.length && out.build.length ? out : fallback;
}
const STORY_SEGMENTS = storySegments();

// frontend/src/config/claimsRegistry.ts entries: key → { verification, approvedRoutes }.
function claimsRegistry() {
  const f = path.join(REPO, 'frontend', 'src', 'config', 'claimsRegistry.ts');
  if (!fs.existsSync(f)) return null;
  const out = new Map();
  for (const block of fs.readFileSync(f, 'utf8').split(/\n\s*key:\s*'/).slice(1)) {
    const key = block.slice(0, block.indexOf("'"));
    const verification = (block.match(/verification:\s*'([A-Z_]+)'/) || [])[1] || null;
    const routes = (block.match(/approvedRoutes:\s*\[([^\]]*)\]/) || [])[1] || '';
    out.set(key, { verification, approvedRoutes: [...routes.matchAll(/'([^']*)'/g)].map((m) => m[1]) });
  }
  return out;
}
const REGISTRY = claimsRegistry();

// Curriculum (checkpoints per week, next week's title) from the repo, via load_curriculum.js.
function curriculum() {
  try { return require('./load_curriculum').loadCurriculum(REPO); } catch (e) { return null; }
}
const CURRICULUM = curriculum();

// history.json schedule (air time), for the schedule-number exemption in public copy.
function historySchedule(p) {
  const f = p ? path.resolve(p) : path.join(REPO, 'docs', 'live-sessions', 'history.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).schedule || null; } catch (e) { return null; }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * The session's own schedule values may appear in public copy without a fact row: the air date and
 * next air date (any common spelling), the air time (history.json schedule.time, 12- or 24-hour),
 * the episode number, the length in minutes and the run-of-show minute stamps. Returns the
 * patterns to blank out of public copy before numbers are traced to facts.
 */
function scheduleExemptions(bp, schedule) {
  const h = bp.header || {};
  const pats = [];
  for (const iso of [h.airDate, h.nextAirDate].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ''))) {
    const [y, m, d] = iso.split('-').map(Number);
    const mon = MONTHS[m - 1];
    pats.push(new RegExp(`\\b(?:${mon}|${mon.slice(0, 3)}\\.?)\\s+0?${d}(?:st|nd|rd|th)?\\b(?:,?\\s+${y})?`, 'gi'));
    pats.push(new RegExp(`\\b0?${d}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${mon}|${mon.slice(0, 3)}\\.?)(?:,?\\s+${y})?`, 'gi'));
    pats.push(new RegExp(`\\b0?${m}/0?${d}(?:/(?:${y}|${String(y).slice(2)}))?\\b`, 'g'));
    pats.push(new RegExp(`\\b${esc(iso)}\\b`, 'g'));
    pats.push(new RegExp(`\\b${y}\\b`, 'g'));
  }
  const t = (h.airTime || (schedule && schedule.time) || '').match(/^(\d{1,2}):(\d{2})/);
  if (t) {
    const hh = Number(t[1]); const h12 = hh % 12 || 12;
    const ampm = '\\s*[ap]\\.?\\s?m\\.?';
    const tail = t[2] === '00' ? `(?::00)?${ampm}` : `:${t[2]}(?:${ampm})?`;
    pats.push(new RegExp(`\\b(?:${h12}|0?${hh})${tail}`, 'gi'));
  }
  const ep = (String(h.series || '').match(/episode\s+(\d+)/i) || [])[1];
  if (ep) pats.push(new RegExp(`\\b(?:episode|ep\\.?)\\s*#?${ep}\\b|#${ep}\\b`, 'gi'));
  const segs = (bp.runOfShow && bp.runOfShow.segments) || [];
  const mins = new Set([h.lengthMinutes, bp.runOfShow && bp.runOfShow.publicEndsAtMinute, ...segs.flatMap((s) => [s.start, s.minutes, s.start + s.minutes])].filter((x) => Number.isInteger(x)));
  for (const v of mins) {
    pats.push(new RegExp(`\\b${v}[\\s-]*(?:minutes?|mins?)\\b`, 'gi'));
    pats.push(new RegExp(`\\bminute\\s+${v}\\b`, 'gi'));
  }
  return pats;
}
const REQUIRED_KINDS =['news-take', 'number', 'mistake', 'framework', 'prediction', 'contrarian', 'story-30s'];

function mermaidNodes(src) {
  const lines = String(src).split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const head = lines.shift() || '';
  const nodes = new Map();
  const labelRe = /([A-Za-z][A-Za-z0-9_]*)\s*(\[\[?|\(\(?|\{\{?)([^\]\)\}]*)(\]\]?|\)\)?|\}\}?)/g;
  for (const l of lines) {
    if (/^(classDef|class|style|linkStyle|subgraph|end|%%)/.test(l)) continue;
    let m;
    while ((m = labelRe.exec(l))) nodes.set(m[1], m[3].replace(/^"|"$/g, '').trim());
    const bare = l.replace(labelRe, '$1').split(/\s*(?:-->|---|-\.->|==>|--[^>-]*-->|-\.-|<-->)\s*(?:\|[^|]*\|\s*)?/);
    for (const part of bare) {
      const id = (part.match(/^([A-Za-z][A-Za-z0-9_]*)/) || [])[1];
      if (id && !nodes.has(id)) nodes.set(id, id);
    }
  }
  return { head, nodes };
}

/** Resolve a dotted path like "demo.claudeCodeInstructions[0]" inside the blueprint. */
function atPath(obj, p) {
  return p.split('.').reduce((o, part) => {
    if (o == null) return undefined;
    const m = part.match(/^([^[\]]+)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    let v = o[m[1]];
    for (const ix of m[2].match(/\d+/g) || []) v = v == null ? undefined : v[Number(ix)];
    return v;
  }, obj);
}
const lineCounts = new Map();
/**
 * status "checked": confirmed against the repo or by Ali, never a real-world/news claim.
 * checkedAgainst entries: "<repo path>:<line>" (file exists, line within it), "Ali confirmed
 * YYYY-MM-DD", or "blueprint:<path>" (the session's own design; the path must resolve).
 */
function checkFact(bp, f, at, errors) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.checkedAt || '')) errors.push(`${at}: status "checked" needs checkedAt (YYYY-MM-DD)`);
  const planned = String((bp.meta && bp.meta.generatedAt) || '').slice(0, 10);
  if (f.checkedAt && /^\d{4}-\d{2}-\d{2}$/.test(planned) && f.checkedAt > planned) errors.push(`${at}: checkedAt ${f.checkedAt} is after the planning day ${planned}`);
  if (f.url && /^https?:\/\//i.test(f.url)) errors.push(`${at}: has a web URL, so it is a real-world claim: it must be "sourced" from a page fetched this run (or "verify"), never "checked"`);
  const list = f.checkedAgainst || [];
  if (!list.length) errors.push(`${at}: status "checked" needs checkedAgainst (repo path:line, "Ali confirmed YYYY-MM-DD" or "blueprint:<path>")`);
  for (const c of list) {
    if (/^Ali confirmed \d{4}-\d{2}-\d{2}$/.test(c)) continue;
    const bpRef = c.match(/^blueprint:(.+)$/);
    if (bpRef) { if (atPath(bp, bpRef[1]) == null) errors.push(`${at}: checkedAgainst "${c}" does not resolve in this blueprint`); continue; }
    const m = c.match(/^(.+):(\d+)$/);
    if (!m) { errors.push(`${at}: checkedAgainst "${c}" is not "<repo path>:<line>", "Ali confirmed YYYY-MM-DD" or "blueprint:<path>"`); continue; }
    const file = path.resolve(REPO, m[1]);
    if (path.relative(REPO, file).startsWith('..') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { errors.push(`${at}: checkedAgainst "${c}": ${m[1]} is not a file in the repo`); continue; }
    if (!lineCounts.has(file)) lineCounts.set(file, fs.readFileSync(file, 'utf8').split(/\r?\n/).length);
    const n = Number(m[2]);
    if (n < 1 || n > lineCounts.get(file)) errors.push(`${at}: checkedAgainst "${c}": line ${n} is outside ${m[1]} (${lineCounts.get(file)} lines)`);
  }
}

function validateRules(bp, errors, warnings) {
  const P = bp.meta && bp.meta.params ? bp.meta.params : {};
  const segs = (bp.runOfShow && bp.runOfShow.segments) || [];
  const segIds = new Set(segs.map((s) => s.id));
  const sbIds = new Set((bp.soundBites || []).map((s) => s.id));
  const length = bp.runOfShow && bp.runOfShow.lengthMinutes;

  // header
  const h = bp.header || {};
  if (P.length != null && length !== P.length) errors.push(`runOfShow.lengthMinutes ${length} != params.length ${P.length}`);
  if (h.lengthMinutes !== length) errors.push(`header.lengthMinutes ${h.lengthMinutes} != runOfShow.lengthMinutes ${length}`);
  if (h.openingLine) {
    const n = words(h.openingLine).length;
    if (n > 20) errors.push(`header.openingLine is ${n} words; aim for about 12, never over 20`);
    if (GREETING.test(h.openingLine.trim())) errors.push('header.openingLine opens with a greeting');
    if (!/\byou(r)?\b/i.test(h.openingLine)) errors.push('header.openingLine does not address "you"');
  }
  if (h.dataPick && h.week && h.dataPick.pickedWeek !== h.week.number) errors.push(`header.dataPick.pickedWeek ${h.dataPick.pickedWeek} != header.week.number ${h.week.number}`);
  if (P.week && h.week && h.week.number !== P.week) errors.push(`week=${P.week} was given but the blueprint uses week ${h.week.number}`);

  // run of show
  let clock = 0;
  segs.forEach((s, i) => {
    if (s.start !== clock) errors.push(`runOfShow.segments[${i}] "${s.id}": start ${s.start}, expected ${clock}`);
    clock += Number(s.minutes) || 0;
    if (s.minutes > 10) errors.push(`runOfShow.segments[${i}] "${s.id}": ${s.minutes} minutes, max 10`);
    for (const id of s.soundBiteIds || []) if (!sbIds.has(id)) errors.push(`runOfShow.segments[${i}]: unknown sound bite ${id}`);
  });
  if (clock !== length) errors.push(`runOfShow minutes sum to ${clock}, length is ${length}`);
  if (segIds.size !== segs.length) errors.push('runOfShow segment ids are not unique');
  if (segs.length) {
    if (segs[0].mode !== 'cold-open') errors.push('segment 1 must be mode "cold-open"');
    if (segs[0].minutes > 5) errors.push(`cold open is ${segs[0].minutes} minutes, max 5`);
    if (segs[segs.length - 1].mode !== 'recap') errors.push('the last segment must be mode "recap"');
  }
  const modes = segs.map((s) => s.mode);
  if (modes.filter((m) => m === 'live-build').length < 2) errors.push('need at least two live-build segments');
  if (!modes.includes('teardown')) errors.push('need one teardown (or deliberate failure) segment');
  if (!modes.some((m) => m === 'hot-seat' || m === 'qa')) errors.push('need one hot-seat or Q&A segment');
  const pe = bp.runOfShow && bp.runOfShow.publicEndsAtMinute;
  if (P.audience === 'public-preview') {
    if (pe == null) errors.push('audience=public-preview needs runOfShow.publicEndsAtMinute');
    else {
      const boundaries = new Set([0]); let c = 0; for (const s of segs) { c += s.minutes; boundaries.add(c); }
      if (!boundaries.has(pe)) errors.push(`publicEndsAtMinute ${pe} is not a segment boundary`);
      if (pe < 20) errors.push('the public part must be at least 20 minutes');
    }
  } else if (pe != null) warnings.push(`publicEndsAtMinute is set but audience is ${P.audience}`);

  // sound bites
  const sbs = bp.soundBites || [];
  if (sbs.length < 10) errors.push(`${sbs.length} sound bites, need at least 10`);
  sbs.forEach((s, i) => {
    const n = words(s.text).length;
    if (n < 8 || n > 25) errors.push(`soundBites[${i}] ${s.id}: ${n} words, must be 8-25`);
    if (BAD_START.test(String(s.text).trim())) errors.push(`soundBites[${i}] ${s.id}: starts with "${String(s.text).trim().split(/\s+/)[0]}"`);
    const r = scoreSoundbite(s.text);
    if (r.score !== s.score) errors.push(`soundBites[${i}] ${s.id}: stored score ${s.score}, scorer says ${r.score}`);
    if (r.score < 70) errors.push(`soundBites[${i}] ${s.id}: scores ${r.score}, rewrite to 70+`);
    if (!segIds.has(s.segmentId)) errors.push(`soundBites[${i}] ${s.id}: unknown segment ${s.segmentId}`);
  });
  for (const k of REQUIRED_KINDS) if (!sbs.some((s) => s.kind === k)) errors.push(`no sound bite of kind "${k}"`);

  // slides
  const slides = bp.slides || [];
  let lastSeg = -1;
  slides.forEach((s, i) => {
    const at = `slides[${i}] "${s.title}"`;
    const segIdx = segs.findIndex((x) => x.id === s.segmentId);
    if (segIdx === -1) errors.push(`${at}: unknown segment ${s.segmentId}`);
    else if (segIdx < lastSeg) errors.push(`${at}: out of segment order`);
    else lastSeg = segIdx;
    if (s.type === 'teach') {
      if (!s.diagram) errors.push(`${at}: teach slide without a diagram`);
      else {
        const { head, nodes } = mermaidNodes(s.diagram);
        if (!/^flowchart\s+LR\b/.test(head)) errors.push(`${at}: diagram must start "flowchart LR"`);
        if (nodes.size > 7) errors.push(`${at}: diagram has ${nodes.size} nodes, max 7`);
        if (nodes.size < 2) errors.push(`${at}: diagram has ${nodes.size} node(s)`);
        for (const [id, label] of nodes) if (words(label).length > 3) errors.push(`${at}: diagram node ${id} label "${label}" is over three words`);
      }
    }
    const onSlide = [s.title, ...(s.bullets || []), s.visual, s.instruction || ''].join('\n');
    if (TERMINAL.test(onSlide)) errors.push(`${at}: looks like a terminal command; slides carry Claude Code instructions only`);
    if (s.instruction && !/run (these|the|each|every)?\s*(steps|step|commands?)?\s*yourself/i.test(s.instruction)) errors.push(`${at}: instruction must tell Claude Code to run the steps itself`);
  });

  // facts + sources
  const fetched = new Set((bp.sources || []).filter((s) => s.fetchedThisRun).map((s) => s.url));
  (bp.facts || []).forEach((f, i) => {
    if (!f.source) errors.push(`facts[${i}]: no source`);
    if (f.status === 'sourced') {
      if (!f.url) errors.push(`facts[${i}] "${f.claim}": sourced without a URL`);
      else if (!fetched.has(f.url)) errors.push(`facts[${i}] "${f.claim}": sourced, but ${f.url} is not a source fetched this run`);
    }
    if (f.status === 'checked') checkFact(bp, f, `facts[${i}] "${String(f.claim).slice(0, 60)}"`, errors);
    else if (f.checkedAgainst || f.checkedAt) errors.push(`facts[${i}]: checkedAt/checkedAgainst belong only to status "checked"`);
    // Registry shape. In scope (Colaberry, the program, pricing, credentials, partners, outcomes):
    // applies true + the entry's key, or applies true + key null + note "not registered".
    // Out of scope: applies false + key null.
    const r = f.registry || {};
    const at = `facts[${i}] "${String(f.claim).slice(0, 60)}"`;
    if (r.key != null) {
      if (r.applies !== true) errors.push(`${at}: registry.key "${r.key}" is set, so registry.applies must be true`);
      if (REGISTRY && !REGISTRY.has(r.key)) errors.push(`${at}: registry.key "${r.key}" is not a key in claimsRegistry.ts`);
    } else if (r.applies === true && !/\bnot registered\b/i.test(r.note || '')) {
      errors.push(`${at}: registry.applies true with key null must say "not registered" in registry.note`);
    }
    if (f.registryVerified) {
      const e = REGISTRY && r.key ? REGISTRY.get(r.key) : null;
      if (!r.key) errors.push(`${at}: registryVerified needs registry.key`);
      else if (e && e.verification !== 'VERIFIED') errors.push(`${at}: registryVerified, but ${r.key} is ${e.verification}, not VERIFIED`);
    }
  });

  // participation
  const q = (bp.participation && bp.participation.questions) || [];
  for (const k of ['roll-call', 'diagnostic', 'judgment-poll', 'self-check']) if (!q.some((x) => x.kind === k)) errors.push(`no participation question of kind "${k}"`);
  q.forEach((x, i) => {
    if (!segIds.has(x.segmentId)) errors.push(`participation.questions[${i}]: unknown segment ${x.segmentId}`);
    // Every question becomes a deck poll or trivia, and a deck poll needs options; a self-check
    // carries 3-4 self-rating options so the participation list and the deck cannot diverge.
    const n = (x.options || []).length;
    if (x.kind === 'self-check' && (n < 3 || n > 4)) errors.push(`participation.questions[${i}] "${x.q}": a self-check needs 3-4 self-rating options (it becomes a deck poll), has ${n}`);
    else if (n < 2) errors.push(`participation.questions[${i}] "${x.q}": needs at least 2 options (it becomes a deck poll or trivia), has ${n}`);
  });
  ((bp.participation && bp.participation.storyBeats) || []).forEach((x, i) => { if (!segIds.has(x.segmentId)) errors.push(`participation.storyBeats[${i}]: unknown segment ${x.segmentId}`); });

  // content yield
  const cy = bp.contentYield || {};
  (cy.shorts || []).forEach((s, i) => {
    if (!sbIds.has(s.soundBiteId)) errors.push(`contentYield.shorts[${i}]: unknown sound bite ${s.soundBiteId}`);
    if (!segIds.has(s.segmentId)) errors.push(`contentYield.shorts[${i}]: unknown segment ${s.segmentId}`);
  });

  if (cy.linkedinPost && cy.linkedinPost.length > 1300) errors.push(`contentYield.linkedinPost is ${cy.linkedinPost.length} characters, max 1,300`);
  (cy.shorts || []).forEach((s, i) => { if (s.title && s.title.length > 60) errors.push(`contentYield.shorts[${i}] title is ${s.title.length} characters, max 60`); });
  const publicCopy = [cy.linkedinPost, cy.video && cy.video.title, cy.video && cy.video.firstTwoSentences, cy.video && cy.video.thumbnailText,
    ...(cy.quoteCards || []), ...(cy.shorts || []).map((s) => s.title), cy.email && cy.email.subject, cy.email && cy.email.recap, cy.nextLiveCta].filter(Boolean).join('\n');
  const slideCopy = (bp.slides || []).flatMap((s) => [s.title, ...(s.bullets || []), s.visual, s.publicValue]);
  const freeHit = [publicCopy, ...slideCopy, ...(bp.soundBites || []).map((s) => s.text)].filter(Boolean).join('\n').match(/[\w-]*\bfree\b[\w-]*/i);
  if (freeHit) errors.push(`public copy (content yield, slides or sound bites) uses the word "free" ("${freeHit[0]}")`);

  // scores add up
  for (const k of ['room', 'yield']) {
    const sc = bp.scores && bp.scores[k];
    if (sc && sc.lines) {
      const vals = Object.values(sc.lines).map((v) => (v && typeof v === 'object' ? v.score : v));
      const sum = vals.reduce((t, v) => t + (Number(v) || 0), 0);
      if (vals.length !== 5) errors.push(`scores.${k} needs five lines, has ${vals.length}`);
      if (vals.some((v) => !(v >= 0 && v <= 10))) errors.push(`scores.${k}: every line is 0-10`);
      if (Math.abs(sum - sc.total) > 0.05) errors.push(`scores.${k}.total ${sc.total} != sum of its lines ${sum}`);
    }
  }

  // news: ages from the air date, every kept story fetched
  for (const [i, n] of (bp.news || []).entries()) {
    if (n.publishedAt && h.airDate && /^\d{4}-\d{2}-\d{2}/.test(n.publishedAt)) {
      const age = Math.round((Date.parse(`${h.airDate}T12:00:00Z`) - Date.parse(`${n.publishedAt.slice(0, 10)}T12:00:00Z`)) / 864e5);
      if (n.ageDays !== age) errors.push(`news[${i}] "${n.headline}": ageDays ${n.ageDays}, but ${n.publishedAt} → ${h.airDate} is ${age}`);
    }
    if (n.url && !fetched.has(n.url)) errors.push(`news[${i}] "${n.headline}": ${n.url} is not a source fetched this run`);
    // The window: news is found between (airDate - 14 days) and the planning day for the fresh
    // tier, and never after the planning day; past 90 days on air it is no hook at all.
    const planned = String((bp.meta && bp.meta.generatedAt) || '').slice(0, 10);
    if (n.publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(planned) && n.publishedAt.slice(0, 10) > planned) errors.push(`news[${i}] "${n.headline}": published ${n.publishedAt}, after the planning day ${planned}; news cannot come from the future`);
    if (n.ageDays != null && n.ageDays > 90) errors.push(`news[${i}] "${n.headline}": ${n.ageDays} days old on the air date, outside the 90-day window; drop it`);
    // The date comes from the fetched page, so it must agree with the source row.
    const src = (bp.sources || []).find((s) => s.url === n.url);
    if (src && src.publishedAt && n.publishedAt && src.publishedAt.slice(0, 10) !== n.publishedAt.slice(0, 10)) errors.push(`news[${i}] "${n.headline}": publishedAt ${n.publishedAt} != its source row's ${src.publishedAt}; take the date from the fetched page`);
  }
  // Dropped stories: a refused fetch (403/429) needs one alternate outlet tried before the drop.
  for (const [i, d] of (bp.newsDropped || []).entries()) {
    if (/\b(4\d\d|5\d\d|refus|block|paywall|timeout|timed out)/i.test(d.reason || '') && !d.alternateTried) errors.push(`newsDropped[${i}] "${d.headline}": the fetch failed (${d.reason}); try one alternate outlet for the same story and record it in alternateTried`);
  }

  // demand: every video and every page yt_demand.js printed as source is in sources, fetched this run
  for (const [i, d] of (bp.demand || []).entries()) {
    const at = `demand[${i}] "${String(d.title || d.url).slice(0, 60)}"`;
    if (d.url && !fetched.has(d.url)) errors.push(`${at}: ${d.url} is not in sources with fetchedThisRun: true`);
    for (const u of d.sourceUrls || []) if (!fetched.has(u)) errors.push(`${at}: source ${u} is not in sources with fetchedThisRun: true`);
    if (d.views != null && d.channelMedian && d.ratio != null && Math.abs(d.views / d.channelMedian - d.ratio) > 0.15) errors.push(`${at}: ratio ${d.ratio}, but views ${d.views} / channel median ${d.channelMedian} is ${(d.views / d.channelMedian).toFixed(2)}`);
    if (!d.channelMedian && d.ratio != null) errors.push(`${at}: a ratio needs a channel median`);
  }

  // angles + idea score
  const angles = bp.angles || [];
  if (P.angles && angles.length !== P.angles) errors.push(`${angles.length} angles, params.angles is ${P.angles}`);
  const chosen = angles.filter((a) => a.chosen);
  if (chosen.length !== 1) errors.push(`${chosen.length} angles marked chosen, need exactly one`);
  const lenses = angles.map((a) => a.lens);
  if (new Set(lenses).size !== lenses.length) errors.push('two angles share a lens');
  const baseLenses = ['build-story', 'news-consequence', 'mistake-teardown', 'student-journey', 'contrarian-take'];
  for (const l of baseLenses.slice(0, Math.min(5, angles.length))) if (!lenses.includes(l)) errors.push(`missing lens "${l}"`);
  angles.forEach((a, i) => {
    const r = scoreIdea(a.idea && a.idea.lines, { proofGiven: !!P.proof });
    if (a.idea && Math.abs(r.total - a.idea.total) > 0.05) errors.push(`angles[${i}] "${a.title}": stored idea total ${a.idea.total}, rubric gives ${r.total}`);
    if (a.idea && a.idea.lines && !P.proof && a.idea.lines.proof > 2) errors.push(`angles[${i}]: no proof given, so "Proof only I have" cannot exceed 2`);
  });
  if (chosen[0] && bp.scores) {
    if (Math.abs(chosen[0].idea.total - bp.scores.idea) > 0.05) errors.push(`scores.idea ${bp.scores.idea} != chosen angle's ${chosen[0].idea.total}`);
    const below = bp.scores.idea < (P.pass_mark || 70);
    if (below !== bp.meta.belowPassMark) errors.push(`meta.belowPassMark is ${bp.meta.belowPassMark} but idea ${bp.scores.idea} vs pass_mark ${P.pass_mark}`);
    if (chosen[0].title !== h.title) warnings.push(`header.title "${h.title}" differs from the chosen angle "${chosen[0].title}"`);
  }

  // checklist must-haves
  const cl = (bp.checklist || []).join('\n').toLowerCase();
  if (!/key/.test(cl) || !/client data/.test(cl) || !/student data/.test(cl)) errors.push('checklist must include: no keys, client data or student data on screen');
  if (!/news sources? re-?checked/.test(cl)) errors.push('checklist must include: news sources re-checked on the air date');
  if (!/clip-?marker/.test(cl)) errors.push('checklist must include: clip-marker button tested');

  // deck handoff
  const dh = bp.deckHandoff || {};
  const dhSum = (dh.segments || []).reduce((t, s) => t + (s.endMin - s.startMin), 0);
  if (dh.segments && dhSum !== length) errors.push(`deckHandoff.segments span ${dhSum} minutes, length is ${length}`);
  const valid = DECK_SEGMENTS[(dh.session && dh.session.dayKind) || 'build'] || [];
  (dh.segments || []).forEach((s, i) => { if (!valid.includes(s.deckSegment)) errors.push(`deckHandoff.segments[${i}] "${s.id}": deckSegment "${s.deckSegment}" is not a ${dh.session && dh.session.dayKind} segment (${valid.join(', ')})`); });
  const dayKind = (dh.session && dh.session.dayKind) || 'build';
  const teachOk = TEACH_SEGMENTS[dayKind] || [];
  for (const t of dh.teach || []) {
    if (!teachOk.includes(t.segment)) errors.push(`deckHandoff.teach "${t.title}": segment "${t.segment}" never renders teach slides on a ${dayKind} day (only ${teachOk.join(', ')})`);
    if (!/^(SITUATION|ROOM|MOOD|OPEN|SAY|DO|NOTE):/m.test(t.script || '')) errors.push(`deckHandoff.teach "${t.title}": script has no tagged lines`);
    if (!/^SAY:/m.test(t.script || '')) errors.push(`deckHandoff.teach "${t.title}": script has no SAY line for the read screen`);
    if (t.code && t.code.kind === 'review') errors.push(`deckHandoff.teach "${t.title}": kind 'review' is retired; use 'paste' into Claude Code`);
  }
  for (const x of dh.interactions || []) if (!valid.includes(x.segment)) errors.push(`deckHandoff.interactions "${x.q}": segment "${x.segment}" is not a valid deck segment`);
  for (const x of dh.storyBeats || []) if (!valid.includes(x.segment)) errors.push(`deckHandoff.storyBeats "${x.title}": segment "${x.segment}" is not a valid deck segment`);
  for (const x of dh.interactions || []) if (x.kind === 'poll' && !(x.options || []).length) errors.push(`deckHandoff.interactions "${x.q}": a deck poll needs options`);
  // Each deck poll/trivia is a participation question, word for word (same q, same options).
  const sameOpts = (a, b) => JSON.stringify((a || []).map((s) => String(s).trim())) === JSON.stringify((b || []).map((s) => String(s).trim()));
  for (const x of dh.interactions || []) {
    if (x.kind !== 'poll' && x.kind !== 'trivia') continue;
    const match = q.find((p) => String(p.q).trim() === String(x.q).trim());
    if (!match) errors.push(`deckHandoff.interactions ${x.kind} "${x.q}": matches no participation question; use the same text in both`);
    else if (!sameOpts(match.options, x.options)) errors.push(`deckHandoff.interactions ${x.kind} "${x.q}": options differ from participation question ${match.id}; use the same options in both`);
  }
  // Story beats render only in some segments of each day kind (kitSpecDaySlides.ts pushStoryBeats).
  const storyOk = STORY_SEGMENTS[dayKind] || [];
  for (const x of dh.storyBeats || []) {
    if (valid.includes(x.segment) && !storyOk.includes(x.segment)) errors.push(`deckHandoff.storyBeats "${x.title}": segment "${x.segment}" never renders story beats on a ${dayKind} day (only ${storyOk.join(', ')}); move it to one of those or list it under deckHandoff.unmapped`);
  }

  // Which day's material: dayKind decides (SKILL.md Stage 1.2). params.day forces it; otherwise
  // the default (build) is recorded as an assumption naming dayKind.
  if (P.day && dh.session && dh.session.dayKind !== P.day) errors.push(`day=${P.day} was given but deckHandoff.session.dayKind is ${dh.session.dayKind}`);
  if (!P.day && !((bp.meta && bp.meta.assumptions) || []).some((a) => /dayKind/.test(a))) errors.push('no day= was given: record the dayKind default (build) and why in meta.assumptions (an assumption that names "dayKind")');
  const wk = CURRICULUM && h.week && CURRICULUM.weeks.find((w) => w.week === h.week.number);
  if (dayKind === 'build' && wk && wk.days && wk.days.build.checkpoints.length && dh.checkpointsEnabled !== true) {
    errors.push(`Build Day plans from week ${wk.week}'s Build Day deliverable, which has ${wk.days.build.checkpoints.length} authored checkpoints (${wk.days.build.checkpoints.map((c) => `CP${c.n} ${c.label}`).join(', ')}): checkpointsEnabled must be true and the live builds must follow them. Planning the Architecture Day incident instead? set dayKind "architecture"`);
  }

  // Name next week: the recap names the next curriculum week (week + 1, or the capstone after 12).
  if (wk && wk.next && segs.length) {
    const r = segs[segs.length - 1];
    const recapText = [r.title, ...(r.talkingPoints || []), r.onScreenBuild, r.visual].join('\n');
    const nx = wk.next;
    const named = nx.week ? new RegExp(`\\bweek\\s+${nx.week}\\b`, 'i').test(recapText) || (nx.publicTitle && recapText.includes(nx.publicTitle)) : /capstone/i.test(recapText);
    if (!named) errors.push(`the recap segment must name next week: ${nx.week ? `"Week ${nx.week}" or its public title "${nx.publicTitle}"` : '"the capstone"'} (from load_curriculum.js \`next\`)`);
  }

  // Teardown of skill triggering: a vague description only loses the routing when other skills compete.
  const td = segs.filter((s) => s.mode === 'teardown').map((s) => [s.title, ...(s.talkingPoints || []), s.onScreenBuild].join('\n')).join('\n');
  if (/skill/i.test(td) && /(never fires|vague|description|trigger)/i.test(td)) {
    const comp = (bp.demo && bp.demo.routingCompetitors) || [];
    if (comp.length < 2) errors.push(`the teardown breaks skill triggering, so demo.routingCompetitors must name at least two other skills that sit in the folder during it (has ${comp.length}); alone, the vague skill can still be picked and the teardown silently succeeds`);
    if (!(bp.risks || []).some((r) => /silently succeed/i.test(r))) errors.push('the teardown breaks skill triggering: add a risks line that the teardown can silently succeed (the vague skill still fires) and what Ali says if it does');
  }
  const op = dh.opening || {};
  if (dayKind === 'build' && op.coldOpen && !op.resultPreview) errors.push('deckHandoff.opening: Build Day reads only opening.resultPreview; coldOpen alone is a silent no-op');
  if (dayKind === 'architecture' && op.resultPreview && !op.coldOpen) errors.push('deckHandoff.opening: Architecture Day reads opening.coldOpen; resultPreview alone is a silent no-op');
  if (typeof dh.checkpointsEnabled !== 'boolean') errors.push('deckHandoff.checkpointsEnabled must be true or false (the CP0..CPn slides render unless it is false)');

  // the 30-second story
  for (const s of sbs.filter((x) => x.kind === 'story-30s')) {
    const n = s.story ? words(s.story).length : 0;
    if (n < 50 || n > 110) errors.push(`soundBites ${s.id}: story-30s needs its full story in \`story\` (50-110 words, about 30 seconds), has ${n}`);
  }

  // numbers in public copy must trace to a fact that may go public
  // A checked fact may trace a public number unless it is an in-scope registry claim that is not
  // registry-verified (those stay out of public copy whatever their status).
  const publicable = (bp.facts || []).filter((f) => f.status === 'sourced' || f.illustrative || f.registryVerified
    || (f.status === 'checked' && !(f.registry && f.registry.applies)));
  const shortsText = (cy.shorts || []).map((s) => (sbs.find((b) => b.id === s.soundBiteId) || {}).text || '');
  // The session's own schedule (air date, next air date, air time, episode, length, minute stamps)
  // is exempt: the CTA may say "Tuesday, December 1, 6:30 pm Central" with no fact row.
  let pub = [publicCopy, ...shortsText].join('\n');
  for (const re of scheduleExemptions(bp, historySchedule(P.history))) pub = pub.replace(re, ' ');
  for (const num of new Set(pub.match(/\$?\d[\d,.]*%?/g) || [])) {
    const bare = num.replace(/[$,%]/g, '').replace(/\.$/, '');
    if (bare.length < 2 && !/[$%]/.test(num)) continue; // single digits: episode/week numbers
    if (!publicable.some((f) => String(f.claim).replace(/,/g, '').includes(bare))) warnings.push(`public copy uses "${num}", which matches no sourced, checked, illustrative or registry-verified fact`);
  }
}

function validate(bp, schema) {
  const errors = []; const warnings = [];
  validateSchema(schema, schema, bp, '$', errors);
  try { validateRules(bp, errors, warnings); } catch (e) { errors.push(`rule check crashed (structure too broken to check further): ${e.message}`); }
  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validate, mermaidNodes };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: validate_blueprint.js <blueprint.json> [--json]'); process.exit(1); }
  let bp;
  try { bp = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(1); }
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'references', 'blueprint.schema.json'), 'utf8'));
  const r = validate(bp, schema);
  if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); }
  else {
    for (const w of r.warnings) console.log(`WARN  ${w}`);
    for (const e of r.errors) console.log(`FAIL  ${e}`);
    console.log(r.valid ? `VALID  ${file}` : `INVALID  ${file}: ${r.errors.length} error(s)`);
  }
  process.exit(r.valid ? 0 : 2);
}
