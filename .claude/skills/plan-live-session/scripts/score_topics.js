#!/usr/bin/env node
/**
 * score_topics.js: Stage 2 of plan-live-session. Ranks the twelve curriculum weeks 0-100.
 * Deterministic: the same inputs always give the same ranking. Ties go to the week nearest
 * students_on, then the lower week number.
 *
 *   node score_topics.js --curriculum=cur.json --signals=signals.json \
 *     [--history=docs/live-sessions/history.json] [--students-on=N] [--date=YYYY-MM-DD] [--week=N]
 *     [--source=auto|mix|news|curriculum] [--json]
 *
 * --source re-weights the factors (news: news fit 30; curriculum: news fit 5); see WEIGHT_SETS.
 * signals may also carry `evidenceCount` per week (stories + videos behind it), used only to break ties.
 *
 * --curriculum  the output of load_curriculum.js (only week numbers and themes are used here)
 * --signals     the judgment inputs gathered in Stage 1, one entry per week, each 0-5:
 *                 { "weeks": { "5": { "demand": 3, "buildability": 4, "newsFit": 2,
 *                                     "evidence": "short reason, with the story/video it rests on" } } }
 *               a missing `demand` is neutral 2 (never searched); missing buildability is 3; missing newsFit is 0
 * --history     past blueprints; a week covered in the last four sessions before --date scores 0 for coverage
 *
 * | Factor                     | Weight | Score 0-5                                                       |
 * | Close to where students are|   30   | 5 within one week of students_on, 3 within two, 1 otherwise; 3 if unknown |
 * | Not yet covered            |   20   | 5 never covered, 0 covered in the last four sessions, 3 older   |
 * | Search demand              |   20   | from signals                                                    |
 * | Live build-ability         |   15   | from signals                                                    |
 * | News fit                   |   15   | from signals                                                    |
 * total = sum(score / 5 * weight), rounded to one decimal
 */
'use strict';
const fs = require('fs');

// `source` shifts weight toward what is meant to lead. Each set sums to 100; auto/mix is the spec's default.
const WEIGHT_SETS = {
  auto: { closeness: 30, coverage: 20, demand: 20, buildability: 15, newsFit: 15 },
  mix: { closeness: 30, coverage: 20, demand: 20, buildability: 15, newsFit: 15 },
  news: { closeness: 20, coverage: 15, demand: 20, buildability: 15, newsFit: 30 },
  curriculum: { closeness: 35, coverage: 25, demand: 20, buildability: 15, newsFit: 5 },
};
const WEIGHTS = WEIGHT_SETS.auto;

function clamp05(v, d) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : d; }

function closeness(week, studentsOn) {
  if (studentsOn == null) return 3;
  const d = Math.abs(week - studentsOn);
  return d <= 1 ? 5 : d <= 2 ? 3 : 1;
}

function sessionsBefore(history, date) {
  const list = (history && Array.isArray(history.sessions) ? history.sessions : []).filter((s) => s && s.week && !(s.results && s.results.aired === false));
  const before = date ? list.filter((s) => !s.date || s.date <= date) : list;
  return before.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function coverage(week, recentFirst) {
  const idx = recentFirst.findIndex((s) => Number(s.week) === week);
  if (idx === -1) return 5;
  return idx < 4 ? 0 : 3;
}

function scoreTopics({ weeks, signals, history, studentsOn, date, source = 'auto' }) {
  const W = WEIGHT_SETS[source] || WEIGHT_SETS.auto;
  const recent = sessionsBefore(history, date);
  const sig = (signals && signals.weeks) || {};
  const rows = weeks.map((w) => {
    const s = sig[String(w.week)] || {};
    const f = {
      closeness: closeness(w.week, studentsOn),
      coverage: coverage(w.week, recent),
      // demand never searched (no `demand` key) is neutral 2, so pass-1 leaders cannot lock in 20
      // points other weeks never had a chance at; searched-and-found-nothing must be an explicit 0.
      demand: clamp05(s.demand, 2),
      buildability: clamp05(s.buildability, 3),
      newsFit: clamp05(s.newsFit, 0),
    };
    const total = Math.round(Object.keys(W).reduce((t, k) => t + (f[k] / 5) * W[k], 0) * 10) / 10;
    const evidenceCount = Number(s.evidenceCount) || 0;
    return { week: w.week, theme: w.theme, factors: f, total, evidenceCount, evidence: s.evidence || (sig[String(w.week)] ? '' : 'no signal gathered (defaults used)') };
  });
  // Ties: fresher news fit, then more demand, then more stories/videos behind it, then easier to
  // build live, then nearer students_on, then the lower week number.
  const dist = (w) => (studentsOn == null ? 0 : Math.abs(w - studentsOn));
  rows.sort((a, b) => b.total - a.total
    || b.factors.newsFit - a.factors.newsFit
    || b.factors.demand - a.factors.demand
    || b.evidenceCount - a.evidenceCount
    || b.factors.buildability - a.factors.buildability
    || dist(a.week) - dist(b.week)
    || a.week - b.week);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { source, weights: W, studentsOn: studentsOn ?? null, recentWeeks: recent.slice(0, 4).map((s) => Number(s.week)), rows };
}

module.exports = { scoreTopics, WEIGHTS, WEIGHT_SETS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const readJson = (p, d) => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d);
  const cur = readJson(opt('curriculum'), null);
  if (!cur || !Array.isArray(cur.weeks)) { console.error('score_topics: --curriculum=<load_curriculum.js output> is required'); process.exit(1); }
  const so = opt('students-on', null);
  const forced = opt('week', null);
  const res = scoreTopics({
    weeks: cur.weeks,
    signals: readJson(opt('signals'), {}),
    history: readJson(opt('history'), { sessions: [] }),
    studentsOn: so == null || so === 'unknown' ? null : Number(so),
    date: opt('date', null),
    source: opt('source', 'auto'),
  });
  const WEIGHTS = res.weights;
  res.pick = forced ? res.rows.find((r) => r.week === Number(forced)) : res.rows[0];
  res.pickReason = forced ? `week=${forced} was given` : 'top-ranked row';
  if (args.includes('--json')) { process.stdout.write(JSON.stringify(res, null, 2) + '\n'); process.exit(0); }
  const top = res.rows.slice(0, 6);
  console.log(`source=${res.source} · students_on=${res.studentsOn ?? 'unknown'} · last four sessions covered weeks: ${res.recentWeeks.join(', ') || 'none'}`);
  console.log(`| # | Wk | Theme | Close /${WEIGHTS.closeness} | Uncovered /${WEIGHTS.coverage} | Demand /${WEIGHTS.demand} | Build /${WEIGHTS.buildability} | News /${WEIGHTS.newsFit} | Total |`);
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of top) {
    const p = (k) => `${r.factors[k]} → ${Math.round((r.factors[k] / 5) * WEIGHTS[k] * 10) / 10}`;
    console.log(`| ${r.rank} | ${r.week} | ${r.theme} | ${p('closeness')} | ${p('coverage')} | ${p('demand')} | ${p('buildability')} | ${p('newsFit')} | **${r.total}** |`);
  }
  console.log(`\nPick: week ${res.pick.week} (${res.pickReason}), ${res.pick.total}/100`);
}
