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
 *      cross-references between ids.
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
  });

  // participation
  const q = (bp.participation && bp.participation.questions) || [];
  for (const k of ['roll-call', 'diagnostic', 'judgment-poll', 'self-check']) if (!q.some((x) => x.kind === k)) errors.push(`no participation question of kind "${k}"`);
  q.forEach((x, i) => { if (!segIds.has(x.segmentId)) errors.push(`participation.questions[${i}]: unknown segment ${x.segmentId}`); });
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
  const publicable = (bp.facts || []).filter((f) => f.status === 'sourced' || f.illustrative || f.registryVerified);
  const shortsText = (cy.shorts || []).map((s) => (sbs.find((b) => b.id === s.soundBiteId) || {}).text || '');
  const pub = [publicCopy, ...shortsText].join('\n');
  for (const num of new Set(pub.match(/\$?\d[\d,.]*%?/g) || [])) {
    const bare = num.replace(/[$,%]/g, '').replace(/\.$/, '');
    if (bare.length < 2 && !/[$%]/.test(num)) continue; // single digits: episode/week numbers
    if (!publicable.some((f) => String(f.claim).replace(/,/g, '').includes(bare))) warnings.push(`public copy uses "${num}", which matches no sourced, illustrative or registry-verified fact`);
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
