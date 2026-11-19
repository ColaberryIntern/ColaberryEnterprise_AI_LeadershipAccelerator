#!/usr/bin/env node
/**
 * score_idea.js: the Idea rubric arithmetic (Stage 4), so the total and its caps are never done by hand.
 *
 *   node score_idea.js --lines='{"demand":3,"viewer":4,"promise":4,"tension":3,"proof":2,"series":1,"news":4}' [--proof-given]
 *   node score_idea.js --file=angles.json [--proof-given] [--table] [--write=angles.scored.json]
 *        angles.json is an array of
 *          { lens, title, angle, promise, openingLine, whyNow, proofNeeded, device,
 *            lines: { demand, viewer, promise, tension, proof, series, news }, why: { <line>: "reason" } }
 *        --table prints the Stage 4 table (lens, title, seven line scores after caps, total);
 *        --write saves each angle with its computed `idea` = { lines, caps, total }
 *
 * total = sum(score / 5 * weight), weights below, then caps:
 *   - no `proof` input given  → the proof line is clamped to at most 2 before totalling
 *   - tension <= 1 AND demand <= 1 → total capped at 50
 *   - proof == 0 → total capped at 60
 */
'use strict';
const fs = require('fs');

const IDEA_WEIGHTS = { demand: 20, viewer: 15, promise: 15, tension: 10, proof: 15, series: 10, news: 15 };

function scoreIdea(linesIn, { proofGiven = false } = {}) {
  const lines = {};
  for (const k of Object.keys(IDEA_WEIGHTS)) {
    const v = Number(linesIn && linesIn[k]);
    lines[k] = Number.isFinite(v) ? Math.max(0, Math.min(5, Math.round(v))) : 0;
  }
  const caps = [];
  if (!proofGiven && lines.proof > 2) { lines.proof = 2; caps.push('no proof given: "Proof only I have" clamped to 2'); }
  let total = Object.keys(IDEA_WEIGHTS).reduce((t, k) => t + (lines[k] / 5) * IDEA_WEIGHTS[k], 0);
  if (lines.tension <= 1 && lines.demand <= 1 && total > 50) { total = 50; caps.push('tension <= 1 and demand <= 1: total capped at 50'); }
  if (lines.proof === 0 && total > 60) { total = 60; caps.push('proof = 0: total capped at 60'); }
  return { lines, caps, total: Math.round(total * 10) / 10 };
}

module.exports = { scoreIdea, IDEA_WEIGHTS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  const proofGiven = args.includes('--proof-given');
  if (opt('file')) {
    const angles = JSON.parse(fs.readFileSync(opt('file'), 'utf8'));
    const linesOf = (a) => a.lines || (a.idea && a.idea.lines);
    const missing = angles.filter((a) => !linesOf(a) || Object.keys(IDEA_WEIGHTS).some((k) => !(k in linesOf(a))));
    if (missing.length) { console.error(`score_idea: ${missing.length} angle(s) lack all seven lines (${Object.keys(IDEA_WEIGHTS).join(', ')}): ${missing.map((a) => a.title).join('; ')}`); process.exit(1); }
    // ceiling: every movable line (viewer, promise, tension, series; proof only with --proof-given)
    // at 5, with demand and news held where the evidence put them.
    const ceilingOf = (l) => scoreIdea({ ...l, viewer: 5, promise: 5, tension: 5, series: 5, ...(proofGiven ? { proof: 5 } : {}) }, { proofGiven }).total;
    const scored = angles.map((a) => ({ ...a, idea: { ...scoreIdea(linesOf(a), { proofGiven }), ceiling: ceilingOf(linesOf(a)) } }));
    if (opt('write')) fs.writeFileSync(opt('write'), JSON.stringify(scored, null, 2) + '\n');
    if (args.includes('--table')) {
      const K = Object.keys(IDEA_WEIGHTS);
      console.log(`| Lens | Title | ${K.map((k) => `${k[0].toUpperCase()}${k.slice(1)} (0–5, ×${IDEA_WEIGHTS[k]})`).join(' | ')} | Total | Ceiling |`);
      console.log(`|${'---|'.repeat(K.length + 4)}`);
      for (const a of scored) console.log(`| ${a.lens || ''} | ${a.title || ''} | ${K.map((k) => a.idea.lines[k]).join(' | ')} | **${a.idea.total}** | ${a.idea.ceiling} |`);
      const caps = [...new Set(scored.flatMap((a) => a.idea.caps))];
      if (caps.length) console.log(`\nCaps applied: ${caps.join('; ')}`);
    } else {
      for (const a of scored) console.log(`${String(a.idea.total).padStart(5)}  ${a.title || ''}${a.idea.caps.length ? `  [${a.idea.caps.join('; ')}]` : ''}`);
    }
  } else if (opt('lines')) {
    process.stdout.write(JSON.stringify(scoreIdea(JSON.parse(opt('lines')), { proofGiven }), null, 2) + '\n');
  } else { console.error('usage: score_idea.js --lines=<json> | --file=<angles.json> [--proof-given]'); process.exit(1); }
}
