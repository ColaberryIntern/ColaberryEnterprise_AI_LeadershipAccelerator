#!/usr/bin/env node
/**
 * load_curriculum.js: Stage 1 of plan-live-session. Reads the curriculum from the repo at run time
 * and prints one JSON object per week. Nothing about the curriculum is stored in the skill; if a
 * source file changes, the next run sees the change.
 *
 *   node .claude/skills/plan-live-session/scripts/load_curriculum.js [--repo=<root>] [--week=N]
 *
 * Sources (all read, none written):
 *   backend/src/data/canonicalCourse.ts                    theme, intensive, Anthropic Academy course
 *   backend/src/data/classSessionPlan.ts                   public title, tension, assignment (the deliverable)
 *   docs/training-program-2026-q3/TWELVE_WEEK_STORY_ARC.md beat, act, 2 AM question, person who isn't there, trust rung
 *
 * Every field the parser cannot find is printed as null and listed under `gaps`, never guessed.
 * Exit 0 on success (even with gaps), 1 when a source file is missing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REPO = path.resolve(opt('repo', path.join(__dirname, '..', '..', '..', '..')));
const ONLY = opt('week', null);

const SRC = {
  course: 'backend/src/data/canonicalCourse.ts',
  plan: 'backend/src/data/classSessionPlan.ts',
  arc: 'docs/training-program-2026-q3/TWELVE_WEEK_STORY_ARC.md',
};

function read(rel) {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) { console.error(`load_curriculum: missing source ${rel} (repo root ${REPO})`); process.exit(1); }
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

// A single-quoted TS string literal, allowing escaped quotes.
const STR = "'((?:[^'\\\\]|\\\\.)*)'";
const unq = (s) => (s == null ? null : s.replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
const field = (chunk, name) => { const m = chunk.match(new RegExp(`\\b${name}:\\s*${STR}`)); return m ? unq(m[1]) : null; };

/* ---------- canonicalCourse.ts ---------- */
function parseCourse(src) {
  const out = {};
  const base = (src.match(/ANTHROPIC_ACADEMY_BASE\s*=\s*'([^']+)'/) || [])[1] || null;
  const intensives = src.split(/\n\s*intensive_number:\s*/).slice(1);
  for (const block of intensives) {
    if (!/^\d+/.test(block)) continue; // the type declarations, not data
    const num = Number(block.match(/^(\d+)/)[1]);
    const title = field(block, 'title');
    for (const wk of block.split(/\n\s*week_number:\s*/).slice(1)) {
      if (!/^\d+/.test(wk)) continue;
      const n = Number(wk.match(/^(\d+)/)[1]);
      const a = wk.match(new RegExp(`anthropic:\\s*\\{\\s*title:\\s*(?:${STR}|null),\\s*slug:\\s*(?:${STR}|null)[^}]*status:\\s*'([a-z_]+)'`));
      out[n] = {
        theme: field(wk, 'theme'),
        intensive: { number: num, title },
        academy: a ? { title: unq(a[1]) || null, url: a[2] && base ? `${base}${unq(a[2])}` : null, status: a[3] } : null,
        authoredDeliverable: (wk.match(new RegExp(`deliverable:\\s*${STR}`)) || [])[1] || null,
      };
    }
  }
  return out;
}

/* ---------- classSessionPlan.ts ---------- */
function parsePlan(src) {
  const out = {};
  const start = src.indexOf('export const WEEK_CLASS_CONTENT');
  const body = start >= 0 ? src.slice(start) : src;
  const chunks = body.split(/\n {4}week: (\d+),/);
  for (let i = 1; i < chunks.length; i += 2) {
    const n = Number(chunks[i]);
    const c = chunks[i + 1];
    const asg = c.indexOf('assignment: {');
    let assignment = null;
    if (asg >= 0) {
      const a = c.slice(asg, asg + 4000);
      const dStart = a.indexOf('deliverables: [');
      const dEnd = a.indexOf(']', dStart);
      const items = dStart >= 0 ? [...a.slice(dStart, dEnd).matchAll(new RegExp(STR, 'g'))].map((m) => unq(m[1])) : [];
      assignment = { title: field(a, 'title'), deliverables: items, proof: field(a, 'proof') };
    }
    out[n] = { publicTitle: field(c, 'publicTitle'), tension: field(c, 'tension'), assignment };
  }
  return out;
}

/* ---------- TWELVE_WEEK_STORY_ARC.md ---------- */
function parseArc(src) {
  const beats = {};
  for (const m of src.matchAll(/^\|\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)) {
    beats[Number(m[1])] = { title: m[2], beat: m[3] };
  }
  const twoAm = {};
  const twoAmSec = src.split('### 1. The 2 AM question')[1]?.split('###')[0] || '';
  for (const m of twoAmSec.matchAll(/^\|\s*(\d{1,2})\s*\|\s*(.+?)\s*\|\s*$/gm)) twoAm[Number(m[1])] = m[2];
  const person = {};
  const personSec = src.split("### 2. The person who isn't there")[1]?.split('###')[0] || '';
  for (const m of personSec.matchAll(/^- W(\d{1,2}) — (.+)$/gm)) person[Number(m[1])] = m[2].trim();
  const intro = personSec.match(/Week 2 opens on ([^.]+)\./);
  if (intro && !person[2]) person[2] = intro[1].replace(/\s+/g, ' ').trim();
  const ladder = [];
  const ladderSec = src.split('### 3. The trust ladder')[1]?.split('###')[0] || '';
  for (const m of ladderSec.matchAll(/^\|\s*(\d{1,2})(?:–(\d{1,2}))?\s*\|\s*(.+?)\s*\|\s*$/gm)) {
    ladder.push({ from: Number(m[1]), to: Number(m[2] || m[1]), rung: m[3] });
  }
  const acts = [];
  for (const m of src.matchAll(/^\|\s*\*\*([IV]+) — (\w+)\*\*\s*\|\s*(\d+)–(\d+)\s*\|\s*([^|]+?)\s*\|\s*\*([^*]+)\*\s*\|/gm)) {
    acts.push({ act: m[1], name: m[2], from: Number(m[3]), to: Number(m[4]), intensive: m[5], question: m[6] });
  }
  return { beats, twoAm, person, ladder, acts, spine: (src.match(/> \*\*(.+?)\*\*/s) || [])[1]?.replace(/\s*\n>\s*/g, ' ') || null };
}

const course = parseCourse(read(SRC.course));
const plan = parsePlan(read(SRC.plan));
const arc = parseArc(read(SRC.arc));

const weeks = [];
const gaps = [];
for (let n = 1; n <= 12; n++) {
  const c = course[n] || {};
  const p = plan[n] || {};
  const a = arc.beats[n] || {};
  const act = arc.acts.find((x) => n >= x.from && n <= x.to) || null;
  const rung = arc.ladder.find((x) => n >= x.from && n <= x.to);
  const deliverable = p.assignment
    ? { title: p.assignment.title, items: p.assignment.deliverables, proof: p.assignment.proof }
    : c.authoredDeliverable ? { title: c.authoredDeliverable, items: [], proof: null } : null;
  const w = {
    week: n,
    theme: c.theme || a.title || null,
    intensive: c.intensive || null,
    act: act ? { act: act.act, name: act.name, question: act.question } : null,
    beat: a.beat || null,
    publicTitle: p.publicTitle || null,
    tension: p.tension || null,
    academy: c.academy || null,
    deliverable,
    devices: {
      twoAmQuestion: arc.twoAm[n] || null,
      personWhoIsntThere: arc.person[n] || null,
      trustRung: rung ? rung.rung : null,
      ownProject: n >= 3 ? 'Connect the exercise to the student\'s own generated build plan.' : 'Build plan is generated in Week 3; point at it as what is coming.',
      dragonCallback: [3, 6, 9, 12].includes(n),
    },
  };
  for (const k of ['theme', 'beat', 'academy', 'deliverable']) if (w[k] == null) gaps.push(`week ${n}: ${k}`);
  weeks.push(w);
}

const result = { readAt: new Date().toISOString(), repo: REPO, sources: SRC, spine: arc.spine, weeks: ONLY ? weeks.filter((w) => w.week === Number(ONLY)) : weeks, gaps };
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
