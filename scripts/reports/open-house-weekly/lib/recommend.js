/**
 * C124: the one starred move and the 10 most impactful numbers. Deterministic and explainable: every score is shown in
 * the report with its parts, so nobody has to trust a black box.
 *
 *   move score = people short of target  x  closeness to the first win (stage weight)
 *                x  sample confidence (1, or 0.5 under minSample)  x  who can act (1 build, 0.6 needs a human)
 *
 * A move still inside the measure window of a build in story/decisions.json is NOT recommended again; it is listed as
 * "being measured" instead, so the report does not tell us to redo what we did on Tuesday.
 */
'use strict';
const { pct, grade } = require('./model');
const { rateOf } = require('./metrics');

const PLAYBOOK = require('./playbook');

function shortfall(key, r, targets) {
  const t = targets.rates[key];
  if (!t || !r || !r.d) return 0;
  const want = (t.good / 100) * r.d;
  return Math.max(0, t.lowerIsBetter ? r.n - want : want - r.n);
}

/** Facebook vs Instagram (or whichever sources have a real sample): people lost to the weaker source's rate. */
function sourceGap(w, targets) {
  const src = w.by_source.filter((s) => s.visitors >= targets.minSample).map((s) => ({ ...s, rate: pct(s.signups, s.visitors) }));
  if (src.length < 2) return null;
  src.sort((a, b) => b.rate - a.rate);
  const best = src[0], worst = src[src.length - 1];
  const lost = (worst.visitors * (best.rate - worst.rate)) / 100;
  return lost > 0 ? { best, worst, lost } : null;
}

// Steps before the sign-up. When the sign-up rate is already on target, polishing them is worth half: the page is
// doing its job, and the people we are losing are the ones who already said yes.
const TOP_OF_FUNNEL = new Set(['bounce', 'seatClick', 'formFinish']);

function candidates(w, email, targets) {
  const out = [];
  const signupOnTarget = (() => { const r = rateOf('signup', w, email); return r && grade('signup', r.n, r.d, targets).status === 'good'; })();
  for (const [key, p] of Object.entries(PLAYBOOK)) {
    if (key === 'source') continue;
    const r = rateOf(key, w, email);
    if (!r || !r.d) continue;
    const g = grade(key, r.n, r.d, targets);
    const short = shortfall(key, r, targets);
    if (short <= 0) continue;
    const conf = r.d >= targets.minSample ? 1 : 0.5;
    const who = p.executor === 'build' ? 1 : 0.6;
    const top = signupOnTarget && TOP_OF_FUNNEL.has(key) ? 0.5 : 1;
    out.push({ key, ...p, n: r.n, d: r.d, pct: g.pct, target: targets.rates[key].good, status: g.status,
      short: Math.round(short * 10) / 10, conf, who, top, score: Math.round(short * p.weight * conf * who * top * 100) / 100 });
  }
  const gap = sourceGap(w, targets);
  if (gap) {
    const p = PLAYBOOK.source;
    out.push({ key: 'source', ...p, n: gap.worst.signups, d: gap.worst.visitors, pct: gap.worst.rate, target: gap.best.rate,
      status: 'bad', short: Math.round(gap.lost * 10) / 10, conf: 1, who: 0.6, gap,
      score: Math.round(gap.lost * p.weight * 0.6 * 100) / 100 });
  }
  // Ties go to the step closer to the first win, then alphabetical, so the order never depends on object key order.
  return out.sort((a, b) => b.score - a.score || b.weight - a.weight || a.key.localeCompare(b.key));
}

/**
 * The starred move: the best-scoring candidate not already being measured. A move Claude Code can build wins unless a
 * move that needs a person scores at least 1.5x higher, because the star is what inbox zero will act on.
 */
function recommend(w, email, targets, inFlight, weekOf) {
  const busy = new Map(inFlight.map((m) => [m.move, m]));
  const all = candidates(w, email, targets);
  const free = all.filter((c) => !busy.has(c.key));
  const bestBuild = free.find((c) => c.executor === 'build');
  const bestHuman = free.find((c) => c.executor !== 'build');
  const star = bestBuild && !(bestHuman && bestHuman.score >= 1.5 * bestBuild.score) ? bestBuild : free[0] || null;
  return {
    star: star && { ...star, id: `REC-${weekOf}-${star.key}` },
    runnersUp: free.filter((c) => c !== star).slice(0, 3),
    measuring: all.filter((c) => busy.has(c.key)).map((c) => ({ ...c, by: busy.get(c.key) })),
  };
}

const SEV = { bad: 3, ok: 2, low: 1.2, good: 1, none: 0.5 };
const RATE_FACTS = {
  seatClick: (r) => `${r.pct}% of landing page visitors clicked Save my seat (${r.n} of ${r.d}).`,
  formFinish: (r) => `${r.pct}% of Save my seat clicks became a sign-up (${r.n} of ${r.d}).`,
  signup: (r) => `${r.pct}% of visitors signed up for the Open House (${r.n} of ${r.d}).`,
  enter: (r) => `${r.pct}% of brand-new accounts went in (${r.n} of ${r.d}); ${r.d - r.n} have not.`,
  play: (r) => `${r.pct}% of people who reached the video pressed play (${r.n} of ${r.d}).`,
  finish: (r) => `${r.pct}% of people who pressed play watched 75% (${r.n} of ${r.d}).`,
  credit: (r) => `${r.pct}% of people who watched 75% collected the credit (${r.n} of ${r.d}).`,
  check: (r) => `${r.pct}% of credit collectors took the Quick check (${r.n} of ${r.d}).`,
  bounce: (r) => `${r.pct}% of visitors left before a quarter of the page (${r.n} of ${r.d}).`,
  emailOpen: (r) => `${r.pct}% of welcome emails were opened (${r.n} of ${r.d}, Mandrill, a floor).`,
};
const ANCHOR = { seatClick: 'sec-forks', formFinish: 'sec-forks', signup: 'sec-funnel', enter: 'sec-account', play: 'sec-account',
  finish: 'sec-account', credit: 'sec-forks', check: 'sec-forks', bounce: 'sec-page', emailOpen: 'sec-email' };
const STAGE = { seatClick: 1, bounce: 0.9, formFinish: 1.2, signup: 1.1, enter: 1.5, play: 2, finish: 2.2, credit: 2.4, check: 2.4, emailOpen: 1 };

/** The 10 numbers that matter most this week, as tour stops. */
function topTen(w, email, targets) {
  const facts = [];
  for (const key of Object.keys(RATE_FACTS)) {
    const r = rateOf(key, w, email);
    if (!r || !r.d) continue;
    const g = grade(key, r.n, r.d, targets);
    const tone = g.status === 'good' ? 'good' : g.status === 'bad' ? 'bad' : g.status === 'ok' ? 'warn' : 'info';
    facts.push({ id: key, icon: g.status === 'good' ? '✅' : g.status === 'bad' ? '🔴' : g.status === 'ok' ? '🟡' : '⚪', tone,
      text: RATE_FACTS[key]({ ...r, pct: g.pct }), why: targets.rates[key] ? `Target ${targets.rates[key].good}%. ${g.status === 'low' ? 'Too few people to judge yet.' : ''}`.trim() : '',
      anchor: ANCHOR[key], score: SEV[g.status] * Math.sqrt(r.d) * STAGE[key] });
  }
  const gap = sourceGap(w, targets);
  if (gap) facts.push({ id: 'source', icon: '📣', tone: 'bad', anchor: 'sec-source',
    text: `${gap.best.label} converts ${gap.best.rate}% of its visitors; ${gap.worst.label} only ${gap.worst.rate}% (${gap.worst.visitors} visitors).`,
    why: `About ${Math.round(gap.lost)} more sign-ups if ${gap.worst.label} matched ${gap.best.label}.`, score: 3 * Math.sqrt(gap.worst.visitors) * 1.3 });
  const mobile = w.by_device.find((d) => d.label === 'mobile');
  if (mobile && w.visitors) facts.push({ id: 'mobile', icon: '📱', tone: 'info', anchor: 'sec-source',
    text: `${pct(mobile.visitors, w.visitors)}% of visitors are on a phone.`, why: 'Every fix is judged on a phone first.', score: 2 * Math.sqrt(w.visitors) * (mobile.visitors / w.visitors) });
  const noCredit = w.journey.finished - (w.journey.credited ?? w.journey.finished);
  if (noCredit > 0) facts.push({ id: 'nocredit', icon: '🎖️', tone: 'bad', anchor: 'sec-forks',
    text: `${noCredit} watched 75%+ of the video and never collected the credit.`, why: '75% unlocks the credit and the click awards it; the credit waits for them if they come back.', score: 3 * Math.sqrt(noCredit) * 2.4 });
  if (w.median_visit_s) facts.push({ id: 'visit', icon: '⏱️', tone: w.median_visit_s < 30 ? 'warn' : 'info', anchor: 'sec-page',
    text: `The median landing page visit lasts ${w.median_visit_s} seconds.`, why: 'The first screen has to do the whole job.', score: (w.median_visit_s < 30 ? 2 : 1) * Math.sqrt(w.visitors) * 0.8 });
  if (w.signups.training_site) facts.push({ id: 'door', icon: '🚪', tone: 'info', anchor: 'sec-howto',
    text: `${w.signups.training_site} more sign-ups came through the training site door.`, why: 'Not in this funnel; worth its own line once it grows.', score: Math.sqrt(w.signups.training_site) * 0.6 });
  return facts.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 10).map((f, i) => ({ ...f, rank: i + 1 }));
}

module.exports = { recommend, candidates, topTen, sourceGap, shortfall, PLAYBOOK };
