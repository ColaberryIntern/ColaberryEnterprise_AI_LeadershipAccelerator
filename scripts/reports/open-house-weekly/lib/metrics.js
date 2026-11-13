/**
 * C124: one place that turns a rate key (targets.js) into its numerator and denominator for a window, so the funnel,
 * the recommendation engine, the hypothesis board and the prompt can never disagree about what a rate means.
 */
'use strict';
const { credited } = require('./model');

function rateOf(key, w, email) {
  const e = w.engagement, j = w.journey, s = w.signups;
  switch (key) {
    case 'bounce': return { n: e.bounced, d: w.visitors };
    case 'seatClick': return { n: e.seat, d: w.visitors };
    case 'formFinish': return { n: s.lp_from_seat_click, d: e.seat };
    case 'signup': return { n: s.landing_page, d: w.visitors };
    case 'enter': return { n: j.entered, d: j.new_account };
    case 'play': return { n: j.played, d: j.entered };
    case 'finish': return { n: j.finished, d: j.played };
    case 'credit': return { n: credited(j), d: j.finished };
    case 'check': return { n: Math.min(j.took_check, credited(j)), d: credited(j) };
    case 'ace': return { n: j.aced, d: j.took_check };
    case 'keepGoing': return { n: j.kept_going, d: j.entered };
    case 'emailOpen': return email ? { n: email.opened, d: email.emails } : null;
    case 'emailClick': return email ? { n: email.clicked, d: email.emails } : null;
    default: return null;
  }
}

module.exports = { rateOf };
