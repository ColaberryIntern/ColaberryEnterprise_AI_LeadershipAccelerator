#!/usr/bin/env node
/**
 * Validate a kit-to-ladder spec before anything touches Basecamp. Exit 1 on any problem.
 * Checks: unique ids, every blockedBy resolves, ISO weekday due dates, no ticket due before a
 * dependency, every kit file exists, no en or em dashes, AI tickets carry the loop sections,
 * Human tickets carry lettered questions with a default.
 * Usage: node validate_ladder.js <spec.js|spec.json>
 */
const fs = require('fs');
const path = require('path');

function validate(spec) {
  const problems = [];
  const all = spec.groups.flatMap((g) => g.tickets);
  const byId = new Map();
  for (const t of all) {
    if (byId.has(t.id)) problems.push(`duplicate id ${t.id}`);
    byId.set(t.id, t);
  }
  for (const t of all) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due || '')) { problems.push(`${t.id}: due must be YYYY-MM-DD`); continue; }
    const day = new Date(`${t.due}T12:00:00Z`).getUTCDay();
    if (day === 0 || day === 6) problems.push(`${t.id}: due ${t.due} is a weekend`);
    for (const b of t.blockedBy || []) {
      const dep = byId.get(b);
      if (!dep) problems.push(`${t.id}: unknown dependency ${b}`);
      else if (dep.due > t.due) problems.push(`${t.id} (${t.due}) is due before its dependency ${b} (${dep.due})`);
    }
    if (t.kind === 'ai') {
      for (const k of ['what', 'why', 'acceptance', 'tests', 'verify']) if (!t[k] || (Array.isArray(t[k]) && !t[k].length)) problems.push(`${t.id}: missing ${k}`);
    } else if (t.kind === 'human') {
      if (!t.questions || !t.questions.length) problems.push(`${t.id}: a Human ticket needs at least one question`);
      for (const q of t.questions || []) if (!q.options || q.options.length < 2 || !q.default) problems.push(`${t.id}: each question needs 2+ options and a default`);
    } else problems.push(`${t.id}: kind must be ai or human`);
  }
  for (const f of (spec.subfolders || []).flatMap((s) => s.files || [])) if (!fs.existsSync(f)) problems.push(`kit file missing: ${f}`);
  const dashes = (JSON.stringify(spec).match(/[–—]/g) || []).length;
  if (dashes) problems.push(`${dashes} en/em dash(es) in the spec`);
  return { problems, ai: all.filter((t) => t.kind === 'ai').length, human: all.filter((t) => t.kind === 'human').length, groups: spec.groups.length };
}

if (require.main === module) {
  const r = validate(require(path.resolve(process.argv[2])));
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.problems.length ? 1 : 0);
}
module.exports = { validate };
