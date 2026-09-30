/**
 * buildTeachWeeks.js — integrate the fan-out's per-week teaching JSON into a
 * committed TS data file (backend/src/data/classTeachWeeks.ts). Reads every
 * weekN.json in the teach dir, validates + sanitizes each slide, and emits a
 * typed GENERATED_WEEK_TEACH map that classTeachContent.ts merges under the
 * hand-authored weeks.
 *
 * Usage: node buildTeachWeeks.js <teachJsonDir>
 * One-off dev tool; deterministic (weeks sorted); safe to re-run.
 */
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2];
if (!DIR) { console.error('usage: node buildTeachWeeks.js <teachJsonDir>'); process.exit(1); }

const VALID_SEGMENTS = new Set([
  'business-problem', 'architecture', 'deconstruct', 'micro-build',
  'build-map', 'guided-build', 'failure',
]);

function s(v) { return typeof v === 'string' ? v : ''; }

function cleanSlide(raw) {
  if (!raw || !VALID_SEGMENTS.has(raw.segment) || !s(raw.title)) return null;
  const out = { segment: raw.segment, eyebrow: s(raw.eyebrow), title: s(raw.title) };
  if (s(raw.body)) out.body = s(raw.body);
  if (Array.isArray(raw.bullets) && raw.bullets.length) out.bullets = raw.bullets.map(s).filter(Boolean);
  if (raw.code && s(raw.code.code)) out.code = { label: s(raw.code.label) || 'Code', code: s(raw.code.code) };
  if (s(raw.diagram)) out.diagram = s(raw.diagram);
  if (s(raw.script)) out.script = s(raw.script);
  return out;
}

const map = {};
let totalSlides = 0;
const files = fs.readdirSync(DIR).filter((f) => /^week\d+\.json$/.test(f))
  .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));

for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
  catch (e) { console.warn('skip (bad JSON):', f, e.message); continue; }
  const week = data.week || parseInt(f.slice(4), 10);
  const monday = (Array.isArray(data.monday) ? data.monday : []).map(cleanSlide).filter(Boolean);
  const thursday = (Array.isArray(data.thursday) ? data.thursday : []).map(cleanSlide).filter(Boolean);
  if (!monday.length && !thursday.length) { console.warn('skip (empty):', f); continue; }
  map[week] = { monday, thursday };
  totalSlides += monday.length + thursday.length;
  console.log(`week ${week}: ${monday.length} monday, ${thursday.length} thursday`);
}

const header = `/**
 * classTeachWeeks.ts — GENERATED. Deep teaching content for Weeks 2-12, authored
 * by the parallel fan-out and integrated by scripts/buildTeachWeeks.js. Do not
 * edit by hand; re-run the integrator to regenerate. classTeachContent.ts merges
 * this under the hand-authored weeks (Week 1 wins on conflict).
 */
import type { DayTeach } from './classTeachContent';

export const GENERATED_WEEK_TEACH: Record<number, DayTeach> = `;

const outPath = path.resolve(__dirname, '..', 'data', 'classTeachWeeks.ts');
fs.writeFileSync(outPath, header + JSON.stringify(map, null, 2) + ';\n', 'utf8');
console.log(`\nwrote ${outPath} — ${Object.keys(map).length} weeks, ${totalSlides} slides`);
