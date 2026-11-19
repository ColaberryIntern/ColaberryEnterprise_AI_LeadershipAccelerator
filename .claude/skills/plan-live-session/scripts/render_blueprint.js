#!/usr/bin/env node
/**
 * render_blueprint.js: writes blueprint.md and sources.md next to a blueprint.json, so the readable
 * blueprint and the structured one can never disagree. Run it after validate_blueprint.js passes.
 *
 *   node render_blueprint.js <dir-or-blueprint.json>
 */
'use strict';
const fs = require('fs');
const path = require('path');

let target = process.argv[2];
if (!target) { console.error('usage: render_blueprint.js <dir|blueprint.json>'); process.exit(1); }
if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'blueprint.json');
const dir = path.dirname(target);
const bp = JSON.parse(fs.readFileSync(target, 'utf8'));

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const L = [];
const p = (...x) => L.push(...x);
const mmss = (m) => `${String(Math.floor(m / 60)).padStart(1, '0')}:${String(m % 60).padStart(2, '0')}`;
const h = bp.header;
const P = bp.meta.params;
const sbById = Object.fromEntries(bp.soundBites.map((s) => [s.id, s]));

/* 1. Header */
p(`# ${h.title}`, '');
p(`> ${h.openingLine}`, '');
if (bp.meta.belowPassMark) p(`**⚠ Below the pass mark:** idea score ${bp.scores.idea} < ${P.pass_mark}. Read the tightening log before using this.`, '');
p('## 1. Header', '');
p('| | |', '|---|---|');
p(`| **Promise** | ${esc(h.promise)} |`);
p(`| **Air date** | ${h.airDate} |`);
p(`| **Audience** | ${h.audience}${bp.runOfShow.publicEndsAtMinute != null ? ` (public until minute ${bp.runOfShow.publicEndsAtMinute})` : ''} |`);
p(`| **Length** | ${h.lengthMinutes} minutes |`);
p(`| **Curriculum** | Week ${h.week.number}: ${esc(h.week.theme)} |`);
p(`| **Beat** | ${esc(h.week.beat)} |`);
p(`| **Academy course** | ${h.week.academy.url ? `[${esc(h.week.academy.title)}](${h.week.academy.url})` : esc(h.week.academy.title)} (${h.week.academy.status}) |`);
p(`| **Deliverable** | ${esc(h.week.deliverable)} |`);
if (h.week.storyDevice) p(`| **Story device** | ${esc(h.week.storyDevice)} |`);
p(`| **Lens** | ${h.lens} |`);
p(`| **Callback** | ${esc(h.lastSessionCallback)} |`);
if (h.series) p(`| **Series** | ${esc(h.series)} |`);
if (h.guest) p(`| **Guest** | ${esc(h.guest)} |`);
p(`| **Scores** | Idea ${bp.scores.idea}/100 · Room ${bp.scores.room.total}/50 · Yield ${bp.scores.yield.total}/50 |`, '');
if ((bp.meta.assumptions || []).length) { p('**Assumptions made (no question was asked):**', ''); for (const a of bp.meta.assumptions) p(`- ${a}`); p(''); }

p('### Why this topic (data pick)', '');
// Weights follow the run's `source` (score_topics.js WEIGHT_SETS); prefer the ones the ranking recorded.
const WS = { news: { closeness: 20, coverage: 15, demand: 20, buildability: 15, newsFit: 30 }, curriculum: { closeness: 35, coverage: 25, demand: 20, buildability: 15, newsFit: 5 } };
const W = h.dataPick.weights || WS[P.source] || { closeness: 30, coverage: 20, demand: 20, buildability: 15, newsFit: 15 };
const cell = (f, k) => `${f[k]} → ${Math.round((f[k] / 5) * W[k] * 10) / 10}`;
p(`| # | Wk | Theme | Close /${W.closeness} | Uncovered /${W.coverage} | Demand /${W.demand} | Build /${W.buildability} | News /${W.newsFit} | Total | Evidence |`, '|---|---|---|---|---|---|---|---|---|---|');
for (const r of h.dataPick.rows.slice(0, 6)) {
  const f = r.factors;
  p(`| ${r.rank} | ${r.week} | ${esc(r.theme)} | ${cell(f, 'closeness')} | ${cell(f, 'coverage')} | ${cell(f, 'demand')} | ${cell(f, 'buildability')} | ${cell(f, 'newsFit')} | **${r.total}** | ${esc(r.evidence)} |`);
}
p('', 'Each cell is the 0–5 factor → its weighted points.');
p('', `Picked week ${h.dataPick.pickedWeek}: ${h.dataPick.reason}`, '');

p('### Angles considered', '');
p('| Lens | Title | Idea | Opening line |', '|---|---|---|---|');
for (const a of bp.angles) p(`| ${a.lens}${a.chosen ? ' ✅' : ''} | ${esc(a.title)}${a.originalTitle && a.originalTitle !== a.title ? ` (was “${esc(a.originalTitle)}”)` : ''} | ${a.idea.total} | ${esc(a.openingLine)} |`);
p('');
p('### Tightening log', '');
if (!h.tighteningLog.length) p('Passed on the first score; no rounds needed.');
else { p('| Round | Angle | Title | Score | What changed |', '|---|---|---|---|---|'); for (const t of h.tighteningLog) p(`| ${t.round} | ${t.angleLens || ''} | ${esc(t.title)} | ${t.score} | ${esc(t.changed)} |`); }
p('');
if ((bp.news || []).length || (bp.demand || []).length) {
  p('### News and demand behind it', '');
  for (const n of bp.news || []) p(`- **${esc(n.headline)}**, ${esc(n.publisher)}, ${n.publishedAt} (${n.ageDays} days old): ${n.url}`);
  for (const d of bp.demand || []) p(`- ▶ ${esc(d.title)}: ${esc(d.channel)}, ${d.views != null ? d.views : '?'} views${d.channelMedian ? ` vs channel median ${d.channelMedian}` : ''}${d.url ? `: ${d.url}` : ''}`);
  if (!(bp.demand || []).length) p('- No demand evidence with a channel median was found this run.');
  p('');
}
if ((bp.newsDropped || []).length) {
  p('### Stories found but dropped', '');
  for (const d of bp.newsDropped) p(`- ✖ **${esc(d.headline)}**${d.publisher ? `, ${esc(d.publisher)}` : ''}: ${esc(d.reason)}${d.alternateTried ? ` (alternate tried: ${esc(d.alternateTried)})` : ''}: ${d.url}`);
  p('');
}

/* 2. Run of show */
p('## 2. Run-of-show', '');
p('| Start | Min | Mode | Segment |', '|---|---|---|---|');
for (const s of bp.runOfShow.segments) {
  p(`| ${mmss(s.start)} | ${s.minutes} | ${s.mode} | ${esc(s.title)} |`);
  if (bp.runOfShow.publicEndsAtMinute != null && s.start + s.minutes === bp.runOfShow.publicEndsAtMinute) p(`| **${mmss(s.start + s.minutes)}** | | | **— public part ends here; the rest is members-only —** |`);
}
p('');
for (const s of bp.runOfShow.segments) {
  p(`### ${mmss(s.start)} · ${s.title} (${s.minutes} min, ${s.mode})`, '');
  for (const t of s.talkingPoints) p(`- ${t}`);
  p('', `**On screen:** ${s.onScreenBuild}`, `**Chat prompt:** ${s.chatPrompt}`, `**Full-screen visual:** ${s.visual}`);
  if (s.soundBiteIds.length) p(`**Sound bites:** ${s.soundBiteIds.map((id) => `${id}`).join(', ')}`);
  p('');
}

/* 3. Sound bites */
p('## 3. Sound bites', '');
p('| Id | Kind | Score | Segment | Line |', '|---|---|---|---|---|');
for (const s of bp.soundBites) p(`| ${s.id} | ${s.kind} | ${s.score} | ${s.segmentId} | “${esc(s.text)}” |`);
p('');
for (const s of bp.soundBites.filter((x) => x.story)) p(`**${s.id}, the 30-second story:** ${s.story}`, '');

/* 4. Slides */
p('## 4. Slides', '');
bp.slides.forEach((s, i) => {
  p(`### ${i + 1}. ${s.title} — ${s.type} (${s.segmentId})`, '');
  for (const b of s.bullets) p(`- ${b}`);
  p('', `**Visual:** ${s.visual}`);
  if (s.instruction) p('', '**Instruction to Claude Code:**', '', '```text', s.instruction, '```');
  if (s.diagram) p('', '```mermaid', s.diagram, '```');
  p('', `**Speaker note:** ${s.speakerNote}`, `**publicValue:** ${s.publicValue}`, '');
});

/* 5. Facts */
p('## 5. Facts and data points', '');
const count = (st) => bp.facts.filter((f) => f.status === st).length;
const verify = count('verify');
p(`${bp.facts.length} facts · ${count('sourced')} sourced · ${count('checked')} checked · ${verify} still marked **verify**.`, '');
p('| Id | Claim | Status | Source | Published | Claims registry | Used in |', '|---|---|---|---|---|---|---|');
const statusCell = (f) => {
  const base = f.status === 'verify' ? '**verify**'
    : f.status === 'checked' ? `✔ checked ${f.checkedAt}: ${(f.checkedAgainst || []).map((c) => `\`${esc(c)}\``).join(', ')}`
      : 'sourced';
  return f.illustrative ? `${base} · _illustrative_` : base;
};
for (const f of bp.facts) p(`| ${f.id} | ${esc(f.claim)} | ${statusCell(f)} | ${f.url ? `[${esc(f.source)}](${f.url})` : esc(f.source)} | ${f.publishedAt || '—'} | ${f.registry.applies ? (f.registry.key ? `\`${f.registry.key}\`` : '**not registered**') : 'n/a'} ${esc(f.registry.note)} | ${f.usedIn.join(', ')} |`);
p('');

/* 6. Participation */
p('## 6. Participation', '');
for (const q of bp.participation.questions) {
  p(`- **[${q.kind}] ${q.q}** (${q.segmentId})`);
  if (q.options.length) p(`  - Options: ${q.options.join(' · ')}`);
  p(`  - Answer: ${q.answer}`);
}
p('', '### Story beats', '');
for (const b of bp.participation.storyBeats) p(`- **${b.person}** (${b.segmentId}${b.device ? `, ${b.device}` : ''}): ${b.moment} *Stake:* ${b.stake} **${b.punch}**`);
p('');

/* 7. Demo */
p('## 7. Live demo plan', '', `**Goal:** ${bp.demo.goal}`, '');
bp.demo.steps.forEach((s, i) => p(`${i + 1}. ${s}`));
p('', '**What I tell Claude Code:**', '');
for (const c of bp.demo.claudeCodeInstructions) p('```text', c, '```', '');
p('**What could go wrong:**', '');
for (const w of bp.demo.whatCouldGoWrong) p(`- ${w}`);
p('', `**Fallback:** ${bp.demo.fallback}`, '');

/* 8. Students */
p('## 8. For the students', '', `**Build-along:** ${bp.students.buildAlong}`, '', `**Apply it to your own build plan:** ${bp.students.applyToOwnPlan}`, '', `**The open question:** ${bp.students.openQuestion}`, '');

/* 9. Content yield */
const cy = bp.contentYield;
p('## 9. Content yield', '');
p(`**Edited video (${cy.video.targetMinutes} min):** ${cy.video.title} · thumbnail: **${cy.video.thumbnailText}**`, '', `> ${cy.video.firstTwoSentences}`, '');
p('| Short | Sound bite | Segment |', '|---|---|---|');
for (const s of cy.shorts) p(`| ${esc(s.title)} | ${s.soundBiteId}: “${esc((sbById[s.soundBiteId] || {}).text)}” | ${s.segmentId} |`);
p('', '**Quote cards:**', '');
for (const q of cy.quoteCards) p(`- “${q}”`);
p('', '**LinkedIn post:**', '', cy.linkedinPost, '', `**Email:** ${cy.email.subject}`, '', cy.email.recap, '', `**Next live CTA:** ${cy.nextLiveCta}`, '');

/* 10. Scores */
p('## 10. Scores', '', `- **Idea:** ${bp.scores.idea}/100 (pass mark ${P.pass_mark})`);
const lines = (o) => Object.entries(o.lines).map(([k, v]) => `${k} ${typeof v === 'object' ? v.score : v}`).join(' · ');
p(`- **Room:** ${bp.scores.room.total}/50 (${lines(bp.scores.room)})`, `- **Yield:** ${bp.scores.yield.total}/50 (${lines(bp.scores.yield)})`, '', '**The two fixes worth the most points:**', '');
bp.scores.topFixes.forEach((f, i) => p(`${i + 1}. ${f}`));
p('');

/* 11. Checklist */
p('## 11. Pre-show checklist and risks', '');
for (const c of bp.checklist) p(`- [ ] ${c}`);
p('', '**Risks:**', '');
for (const r of bp.risks) p(`- ${r}`);
p('');

/* 12. Deck handoff */
const dh = bp.deckHandoff;
p('## 12. Deck handoff (for build-class-deck)', '');
p(`Session: **${dh.session.title}** · public title "${dh.session.publicTitle}" · week ${dh.session.week}`, '');
p('| Segment id | Start–End | Mode | Label | publicValue |', '|---|---|---|---|---|');
for (const s of dh.segments) p(`| ${s.id} | ${s.startMin}–${s.endMin} | ${s.mode} | ${esc(s.label)} | ${esc(s.publicValue)} |`);
p('', `Teach slides: ${dh.teach.length} · slideNotes: ${Object.keys(dh.slideNotes).length} · interactions: ${dh.interactions.length} · story beats: ${dh.storyBeats.length}`, '');
p('**Fields that could not be mapped (not guessed):**', '');
if (!dh.unmapped.length) p('- none');
for (const u of dh.unmapped) p(`- \`${u.field}\`: ${u.reason}`);
p('', 'The full KitConfig-shaped payload is in `blueprint.json` under `deckHandoff`.', '');

fs.writeFileSync(path.join(dir, 'blueprint.md'), L.join('\n'));

/* sources.md */
const S = [`# Sources: ${h.title}`, '', `Air date ${h.airDate}. Every URL fetched while planning, with access date.`, '', '| Title | Publisher | Published | Accessed | Fetched this run | Used for |', '|---|---|---|---|---|---|'];
for (const s of bp.sources) S.push(`| [${esc(s.title)}](${s.url}) | ${esc(s.publisher || '—')} | ${s.publishedAt || '—'} | ${s.accessedAt} | ${s.fetchedThisRun ? 'yes' : 'no'} | ${esc(s.usedFor || '')} |`);
if (!bp.sources.length) S.push('| none | | | | | |');
fs.writeFileSync(path.join(dir, 'sources.md'), S.join('\n') + '\n');
console.log(`wrote ${path.join(dir, 'blueprint.md')} and ${path.join(dir, 'sources.md')}`);
