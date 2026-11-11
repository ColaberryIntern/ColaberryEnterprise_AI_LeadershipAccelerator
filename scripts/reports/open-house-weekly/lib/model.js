/**
 * C123: pure derivations for the weekly Open House report. Snapshot (collect.sql JSON, plus the optional Mandrill
 * `email` summary) in, a view model out. No I/O, no dates read from the clock: the same snapshot always yields the same
 * report, which is what the unit tests pin.
 */
'use strict';

/** Snapshots from before 11 Nov PM have no `credited`; then finished meant credited. */
const credited = (j) => (j.credited === undefined ? j.finished : j.credited);

const pct = (n, d) => (d > 0 ? Math.round((1000 * n) / d) / 10 : null);

/** Grade one rate against its target. Under minSample people it is 'low' (grey), never green or red. */
function grade(key, n, d, targets) {
  const t = targets.rates[key];
  const p = pct(n, d);
  if (!t || p === null) return { key, n, d, pct: p, status: 'none' };
  if (d < targets.minSample) return { key, n, d, pct: p, status: 'low' };
  const ok = t.lowerIsBetter ? p <= t.ok : p >= t.ok;
  const good = t.lowerIsBetter ? p <= t.good : p >= t.good;
  return { key, n, d, pct: p, status: good ? 'good' : ok ? 'ok' : 'bad', target: t.good, lowerIsBetter: !!t.lowerIsBetter };
}

/** Change from last week in percentage points (rates) or people (counts); null when there is no last week. */
function delta(cur, prev) {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return null;
  return Math.round((cur - prev) * 10) / 10;
}

function funnel(w, targets) {
  const j = w.journey, s = w.signups;
  const rows = [
    { icon: '👀', step: 'Visited the landing page', n: w.visitors },
    { icon: '🖱️', step: 'Clicked “Save my seat”', n: w.engagement.seat, rate: 'seatClick' },
    { icon: '📝', step: 'Signed up for Open House', n: s.landing_page, rate: 'formFinish' },
    { icon: '🆕', step: 'Got a brand-new account', n: j.new_account },
    { icon: '✉️', step: 'Welcome email sent', n: j.email_sent },
    { icon: '🚪', step: 'Entered the account', n: j.entered, rate: 'enter', base: 'new_account' },
    { icon: '▶️', step: 'Pressed play on the video', n: j.played, rate: 'play' },
    { icon: '🏁', step: 'Watched 75%+ of the video', n: j.finished, rate: 'finish' },
    { icon: '🎖️', step: 'Collected the credit', n: credited(j), rate: 'credit' },
    { icon: '✅', step: 'Took the Quick check', n: j.took_check, rate: 'check' },
    { icon: '🏆', step: 'Scored 5 of 5', n: j.aced, rate: 'ace' },
  ];
  return rows.map((r, i) => {
    const prevN = i === 0 ? null : r.base === 'new_account' ? j.new_account : rows[i - 1].n;
    const g = r.rate ? grade(r.rate, r.n, prevN, targets) : { status: 'none', pct: i === 0 ? null : pct(r.n, prevN) };
    return { ...r, prevN, pctPrev: i === 0 ? null : pct(r.n, prevN), pctTop: pct(r.n, w.visitors), status: g.status };
  });
}

/** Every point where people choose, as options with counts and shares. `good` marks the option we want. */
function forks(w, email, targets) {
  const e = w.engagement, j = w.journey, s = w.signups;
  const seatDropped = Math.max(0, e.seat - s.lp_from_seat_click);
  const notEntered = Math.max(0, j.new_account - j.entered);
  const f = [
    { id: 'lp', icon: '🧭', q: 'On the landing page, what did visitors do?', rate: 'seatClick', options: [
      { label: 'Clicked “Save my seat”', n: e.seat, good: true },
      { label: 'Clicked “Start Learning AI for $0”', n: e.start },
      { label: 'Read 75%+ and left', n: e.read },
      { label: 'Skimmed (25–74%) and left', n: e.skimmed },
      { label: 'Bounced (under 25%)', n: e.bounced, bad: true }] },
    { id: 'form', icon: '📝', q: 'After “Save my seat”, did they finish the form?', rate: 'formFinish', options: [
      { label: 'Signed up', n: s.lp_from_seat_click, good: true },
      { label: 'Left the form', n: seatDropped, bad: true }] },
    { id: 'account', icon: '👤', q: 'Were the sign-ups new to us?', options: [
      { label: 'Brand-new account', n: j.new_account, good: true },
      { label: 'Already had an account', n: j.existing_account }] },
    { id: 'enter', icon: '🚪', q: 'Did the new account holders go in?', rate: 'enter', options: [
      { label: 'Yes, the Access your account button', n: j.entered_button, good: true },
      { label: 'Yes, later from the email link', n: j.entered_link, good: true },
      { label: 'Not yet', n: notEntered, bad: true }] },
    { id: 'play', icon: '▶️', q: 'Once inside, did they press play?', rate: 'play', options: [
      { label: 'Pressed play', n: j.played, good: true },
      { label: 'Did not press play', n: Math.max(0, j.entered - j.played), bad: true }] },
    { id: 'finish', icon: '🎬', q: 'Did they watch to the end?', rate: 'finish', options: [
      { label: 'Finished (75%+)', n: j.finished, good: true },
      { label: 'Quit partway', n: Math.max(0, j.played - j.finished), bad: true }] },
    { id: 'credit', icon: '🎖️', q: 'After watching 75%+, did they collect the credit?', rate: 'credit', options: [
      { label: 'Collected it', n: credited(j), good: true },
      { label: 'Watched but never collected', n: Math.max(0, j.finished - credited(j)), bad: true }] },
    { id: 'check', icon: '✅', q: 'After the credit, did they take the Quick check?', rate: 'check', options: [
      { label: 'Took it', n: Math.min(j.took_check, credited(j)), good: true },
      { label: 'Skipped it', n: Math.max(0, credited(j) - j.took_check), bad: true }] },
    { id: 'ace', icon: '🏆', q: 'How did they score?', rate: 'ace', options: [
      { label: '5 of 5', n: j.aced, good: true },
      { label: 'Missed at least one', n: Math.max(0, j.took_check - j.aced) }] },
    { id: 'next', icon: '➡️', q: 'Did they keep going to another assignment?', rate: 'keepGoing', options: [
      { label: 'Opened another assignment', n: j.kept_going, good: true },
      { label: 'Stopped', n: Math.max(0, j.entered - j.kept_going), bad: true }] },
  ];
  if (email && email.emails > 0) {
    f.splice(4, 0, { id: 'email', icon: '✉️', q: 'Did they open the welcome email?', rate: 'emailOpen', source: 'Mandrill', options: [
      { label: 'Opened', n: email.opened, good: true },
      { label: 'Not opened (or not found)', n: Math.max(0, email.emails - email.opened), bad: true }] });
  }
  return f.map((x) => {
    const total = x.options.reduce((a, o) => a + o.n, 0);
    const goodN = x.options.filter((o) => o.good).reduce((a, o) => a + o.n, 0);
    return { ...x, total, options: x.options.map((o) => ({ ...o, pct: pct(o.n, total) })),
      grade: x.rate ? grade(x.rate, goodN, total, targets) : null };
  });
}

/**
 * Every person in the funnel, bucketed by the furthest point they reached. Unit = tracked LP visitors plus LP sign-ups
 * whose visit was not tracked. Visitors who did not sign up keep their page behavior; sign-ups take their journey stage.
 */
function people(w) {
  const e = w.engagement, j = w.journey, s = w.signups;
  const untracked = Math.max(0, s.landing_page - s.lp_linked_to_visit);
  // Linked sign-ups who did not come from a seat click sit inside the other engagement tiers; take them out of the
  // shallowest tiers first so the non-sign-up buckets add up.
  let excess = Math.max(0, s.lp_linked_to_visit - s.lp_from_seat_click);
  const take = (n) => { const t = Math.min(n, excess); excess -= t; return n - t; };
  const bounced = take(e.bounced), skimmed = take(e.skimmed), read = take(e.read), start = take(e.start);
  const stages = [
    { key: 'bounced', label: 'Bounced', n: bounced, tone: 'mute' },
    { key: 'skimmed', label: 'Skimmed and left', n: skimmed, tone: 'mute' },
    { key: 'read', label: 'Read and left', n: read, tone: 'mute' },
    { key: 'start', label: 'Took the $0 path', n: start, tone: 'info' },
    { key: 'formdrop', label: 'Left the sign-up form', n: Math.max(0, e.seat - s.lp_from_seat_click), tone: 'warn' },
    { key: 'existing', label: 'Signed up, already had an account', n: j.existing_account, tone: 'info' },
    { key: 'notin', label: 'Signed up, not entered yet', n: Math.max(0, j.new_account - j.entered), tone: 'warn' },
    { key: 'noplay', label: 'Entered, did not press play', n: Math.max(0, j.entered - j.played), tone: 'warn' },
    { key: 'quit', label: 'Played, quit partway', n: Math.max(0, j.played - j.finished), tone: 'warn' },
    { key: 'nocredit', label: 'Watched 75%+, no credit collected', n: Math.max(0, j.finished - credited(j)), tone: 'warn' },
    { key: 'finished', label: 'Collected the credit', n: Math.max(0, credited(j) - j.took_check), tone: 'good' },
    { key: 'checked', label: 'Took the Quick check', n: j.took_check, tone: 'best' },
  ];
  const total = stages.reduce((a, x) => a + x.n, 0);
  return { stages: stages.map((x) => ({ ...x, pct: pct(x.n, total) })), total, untracked };
}

/** Sankey edges [from, to, value], zero edges dropped (Mermaid sankey rejects them). */
function sankey(w) {
  const e = w.engagement, j = w.journey, s = w.signups;
  const edges = [];
  for (const src of w.by_source) edges.push([src.label, 'Landing page', src.visitors]);
  edges.push(['Landing page', 'Bounced', e.bounced], ['Landing page', 'Skimmed and left', e.skimmed],
    ['Landing page', 'Read and left', e.read], ['Landing page', 'Start for $0', e.start],
    ['Landing page', 'Save my seat', e.seat],
    ['Save my seat', 'Signed up', s.lp_from_seat_click], ['Save my seat', 'Left the form', Math.max(0, e.seat - s.lp_from_seat_click)],
    ['Visit not tracked', 'Signed up', Math.max(0, s.landing_page - s.lp_from_seat_click)],
    ['Signed up', 'New account', j.new_account], ['Signed up', 'Had an account', j.existing_account],
    ['New account', 'Entered', j.entered], ['New account', 'Not entered yet', Math.max(0, j.new_account - j.entered)],
    ['Entered', 'Pressed play', j.played], ['Entered', 'Did not press play', Math.max(0, j.entered - j.played)],
    ['Pressed play', 'Finished video', j.finished], ['Pressed play', 'Quit video', Math.max(0, j.played - j.finished)],
    ['Finished video', 'Collected credit', credited(j)], ['Finished video', 'No credit collected', Math.max(0, j.finished - credited(j))],
    ['Collected credit', 'Quick check', Math.min(j.took_check, credited(j))], ['Collected credit', 'Skipped check', Math.max(0, credited(j) - j.took_check)]);
  return edges.filter((x) => x[2] > 0);
}

const EXIT_BINS = [[0, 15, 'First 15 s'], [15, 30, '15–30 s'], [30, 60, '30–60 s'], [60, 90, '1:00–1:30'], [90, Infinity, 'After 1:30']];
function exitBins(exits) {
  return EXIT_BINS.map(([lo, hi, label]) => ({ label, n: exits.filter((s) => s >= lo && s < hi).length }));
}

module.exports = { credited, pct, grade, delta, funnel, forks, people, sankey, exitBins };
