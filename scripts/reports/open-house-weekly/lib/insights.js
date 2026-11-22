/**
 * C123: KPI tiles, plain-English findings, and the "what we cannot see yet" list. Pure: snapshot in, strings out.
 * Every sentence is built from numbers in the snapshot, never written by hand, so a finding cannot outlive its data.
 */
'use strict';
const { pct, grade, delta, funnel, ATTEND_FLOOR } = require('./model');

/** Where a payer came from, in words (collect.sql payers.origin). Exported for the report and the email. */
const ORIGIN = {
  ad_signup: 'from an ad sign-up', ad_visit: 'visited the ad page without signing up', oh_other_door: 'Open House registrants from another door',
  winback: 'from a win-back or alumni campaign', earlier_oh_lead: 'earlier Open House leads (before the ads)', other: 'from elsewhere',
};

function kpis(cur, prev, targets) {
  const j = cur.journey, pj = prev && prev.journey;
  const tile = (icon, label, value, sub, g, prevValue, unit) => ({
    icon, label, value, sub, status: g ? g.status : 'none', delta: delta(value, prevValue), unit: unit || '' });
  const signupRate = grade('signup', cur.signups.landing_page, cur.visitors, targets);
  const enter = grade('enter', j.entered, j.new_account, targets);
  const finish = grade('finish', j.finished, j.played, targets);
  return [
    tile('👀', 'Landing page visitors', cur.visitors, 'people from the ads', null, prev && prev.visitors),
    tile('📝', 'Open House sign-ups', cur.signups.landing_page, `${signupRate.pct ?? 0}% of visitors`, signupRate,
      prev && prev.signups.landing_page),
    tile('📈', 'Sign-up rate', signupRate.pct ?? 0, `target ${targets.rates.signup.good}%`, signupRate,
      prev && pct(prev.signups.landing_page, prev.visitors), '%'),
    tile('🚪', 'Entered the account', j.entered, `${enter.pct ?? 0}% of ${j.new_account} new accounts`, enter, pj && pj.entered),
    tile('🏁', 'Finished the video', j.finished, j.played ? `${finish.pct}% of ${j.played} who pressed play` : 'nobody has pressed play yet',
      finish, pj && pj.finished),
    tile('🏆', 'Aced the Quick check', j.aced, `${j.took_check} took it`, null, pj && pj.aced),
    ...(j.oh_held === undefined ? [] : [(() => {
      const g = grade('attend', j.attended, j.oh_held, targets);
      return tile('🎤', 'Came to the Open House', j.attended, j.oh_held ? `${g.pct}% of ${j.oh_held} whose session happened (a floor)` : 'no Open House has happened yet',
        g, pj && pj.attended);
    })()]),
    ...(cur.payers === undefined ? [] : [tile('💳', 'Paid to enroll, every source', cur.payers.total,
      `${j.paid ?? 0} of them came from the ads`, null, prev && prev.payers && prev.payers.total)]),
  ];
}

/** Ranked findings: the biggest leak first, then where people come from and how they browse. */
function findings(cur, targets) {
  const out = [];
  const steps = funnel(cur, targets).slice(1).filter((s) => s.prevN >= targets.minSample);
  if (steps.length) {
    // Below-target steps outrank everything; among equals the lowest pass-through wins (later step breaks a tie).
    const rank = (s) => (s.status === 'bad' ? 0 : s.status === 'ok' ? 1 : 2);
    const worst = steps.reduce((a, b) => (rank(b) < rank(a) || (rank(b) === rank(a) && b.pctPrev <= a.pctPrev) ? b : a));
    out.push({ tone: 'bad', icon: '🚨', text: `Biggest leak: ${worst.step}. Only ${worst.n} of ${worst.prevN} (${worst.pctPrev}%) made it past the step before.${worst.note ? ' ' + worst.note : ''}` });
  }
  const j = cur.journey;
  out.push(...attendanceFindings(j, targets));
  if (cur.payers && cur.payers.total) {
    const p = cur.payers, top = p.by_origin.map((o) => `${o.n} ${ORIGIN[o.origin] || o.origin}`).join(', ');
    out.push({ tone: 'good', icon: '💰', text: `${p.total} people paid to enroll this week (${p.monthly} monthly, ${p.annual} annual): ${top}. ${p.came_before_paying} had come to an Open House before paying.` });
  }
  if (j.entered > 0 && j.played === 0) {
    out.push({ tone: 'bad', icon: '⏸️', text: `${j.entered} people reached the welcome video and none pressed play. The step between “in the account” and “watching” is the one to fix first.` });
  }
  const notIn = j.new_account - j.entered;
  if (j.new_account >= targets.minSample && notIn > 0) {
    out.push({ tone: 'warn', icon: '📭', text: `${notIn} of ${j.new_account} new accounts (${pct(notIn, j.new_account)}%) have not gone in yet. The welcome email is their way back.` });
  }
  const src = cur.by_source.filter((s) => s.visitors >= targets.minSample);
  if (src.length >= 2) {
    const r = src.map((s) => ({ ...s, rate: pct(s.signups, s.visitors) })).sort((a, b) => b.rate - a.rate);
    const lo = r[r.length - 1], hi = r[0];
    out.push({ tone: 'info', icon: '📣', text: `${hi.label} converts best: ${hi.rate}% of its ${hi.visitors} visitors signed up, vs ${lo.rate}% for ${lo.label} (${lo.visitors} visitors).` });
  }
  const mobile = cur.by_device.find((d) => d.label === 'mobile');
  if (mobile && cur.visitors) out.push({ tone: 'info', icon: '📱', text: `${pct(mobile.visitors, cur.visitors)}% of visitors are on a phone. Judge every page change on a phone first.` });
  const e = cur.engagement;
  if (cur.visitors >= targets.minSample) {
    out.push({ tone: e.bounced / cur.visitors > 0.5 ? 'warn' : 'info', icon: '📜',
      text: `${e.bounced} of ${cur.visitors} visitors (${pct(e.bounced, cur.visitors)}%) left before a quarter of the page. Median visit: ${cur.median_visit_s ?? 'n/a'} s.` });
  }
  if (e.seat >= targets.minSample) {
    const drop = e.seat - cur.signups.lp_from_seat_click;
    out.push({ tone: drop > 0 ? 'warn' : 'good', icon: '🧾', text: `${cur.signups.lp_from_seat_click} of ${e.seat} who clicked Save my seat finished the form (${pct(cur.signups.lp_from_seat_click, e.seat)}%).` });
  }
  return out;
}

/**
 * OH1y: the Open House itself. How many came, and whether finishing the welcome video before the session goes with
 * showing up. The video comparison is only stated when both groups have minSample people; otherwise it says too few.
 */
function attendanceFindings(j, targets) {
  if (j.oh_held === undefined || !j.oh_held) return [];
  const out = [];
  const g = grade('attend', j.attended, j.oh_held, targets);
  out.push({ tone: g.status === 'good' ? 'good' : g.status === 'low' ? 'info' : 'warn', icon: '🎤',
    text: `${j.attended} of ${j.oh_held} sign-ups whose Open House has happened came (${g.pct}%). ${ATTEND_FLOOR}` });
  if (j.interacted !== undefined && j.attended > 0) {
    out.push({ tone: 'info', icon: '🙋', text: `${j.interacted} of the ${j.attended} who came took part: answered a poll, asked a question or set a status (${pct(j.interacted, j.attended)}%).` });
  }
  if (j.paid !== undefined) {
    const started = Math.max(0, (j.checkout ?? j.checkout_held ?? 0) - j.paid);
    out.push({ tone: j.paid ? 'good' : 'warn', icon: '💳', text: j.paid
      ? `${j.paid} of ${j.signups} ad sign-ups paid to enroll (${pct(j.paid, j.signups)}%): ${j.paid_interacted} took part at the Open House, ${Math.max(0, j.paid_attended - j.paid_interacted)} came and watched, ${Math.max(0, j.paid - j.paid_attended)} paid without coming.${started ? ` ${started} more started checkout and did not pay.` : ''}`
      : `No ad sign-up has paid to enroll yet (0 of ${j.signups}).${started ? ` ${started} started checkout and did not pay.` : ''}` });
  }
  const notWatched = j.oh_held - j.held_watched, attNotWatched = j.attended - j.attended_watched;
  if (j.held_watched >= targets.minSample && notWatched >= targets.minSample) {
    const a = pct(j.attended_watched, j.held_watched), b = pct(attNotWatched, notWatched);
    out.push({ tone: 'info', icon: '🎬', text: `Finished the welcome video before the session: ${a}% checked in (${j.attended_watched} of ${j.held_watched}). Did not: ${b}% (${attNotWatched} of ${notWatched}). ${Math.abs(a - b) < 5 ? 'No real difference yet.' : a > b ? 'Video finishers show up more.' : 'Video finishers do not show up more.'}` });
  } else if (j.held_watched > 0) {
    out.push({ tone: 'info', icon: '🎬', text: `${j.held_watched} finished the welcome video before their Open House; too few to say yet whether that makes them more likely to come.` });
  }
  if (j.oh_upcoming) out.push({ tone: 'info', icon: '📆', text: `${j.oh_upcoming} more sign-ups are waiting for an Open House that has not happened yet.` });
  return out;
}

/** What the report cannot measure yet, so nobody reads silence as zero. */
function blindSpots(snap) {
  const list = [
    { icon: '📬', what: 'Opens and clicks on every message except the welcome email', why: 'The message list shows what was sent; only the welcome email is read back from Mandrill, and texts report delivery only.', next: 'Read Mandrill opens and clicks for the countdown and reminder emails too.' },
    { icon: '🎟️', what: 'Open House: people who joined Zoom directly', why: 'Attendance counts platform check-ins only. Anyone who went straight to Zoom is not counted, so the attendance rate is a floor.', next: 'Read the Zoom participant report for each Open House and join it by email (needs the Zoom participant scope).' },
    { icon: '💵', what: 'Ad spend, cost per sign-up', why: 'Meta spend is not in our database.', next: 'Add weekly spend by campaign, then cost per sign-up and per finished video.' },
    { icon: '📄', what: 'The /open-house form page itself', why: 'It records no page views, so "opened the form, did not submit" is inferred from the button click.', next: 'Add page tracking to the form page.' },
    { icon: '🔗', what: 'Which email a sign-in link came from', why: 'Every link sign-in looks the same.', next: 'Tag the welcome email link so its sign-ins are counted separately.' },
  ];
  const em = snap.email;
  if (!em) list.push({ icon: '✉️', what: 'Welcome email opens and clicks', why: 'Mandrill was not read for this run.', next: 'Run with Mandrill (run.sh does by default).' });
  else if (em.found < em.emails) list.push({ icon: '✉️', what: `${em.emails - em.found} of ${em.emails} welcome emails not found in Mandrill`, why: 'Mandrill search lags and misses some sends.', next: 'Treat opens and clicks as a floor.' });
  return list;
}

module.exports = { kpis, findings, blindSpots, ORIGIN };
