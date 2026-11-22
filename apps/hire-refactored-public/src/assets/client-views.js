/*
 * hire.refactored.ai - the employer portal's pure view mappers (/client/, Career Prep CP10.2): API rows in, the words
 * and numbers each card, table row and KPI shows out. No DOM, no HTML (client-portal.js escapes everything it renders).
 * A candidate's role and status come from THIS client's own interviews and offers (the API scoped them); a fact the
 * API does not give is shown as absent in words, never guessed.
 */
(function (root, factory) {
  var model = typeof module === 'object' && module.exports ? require('./client-model.js') : root.HireClientModel;
  var api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireClientViews = api;
}(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  var T = M.TEXT;
  var newest = function (a, b, key) { return String(b[key] || '').localeCompare(String(a[key] || '')); };

  /** "Mon, Nov 23, 9:00 AM" in Central, whatever the viewer's zone; '' for no time. */
  function central(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  /** "Mon, Jan 4, 2027" for a calendar date ("2027-01-04"), read as that day, not shifted by a zone. */
  function day(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  var OFFER_STATUS = { sent: ['Offer out', 'p-info'], talk_first: ['Wants to talk first', 'p-warn'], accepted: ['Accepted', 'p-ok'], declined: ['Declined', 'p-mute'], withdrawn: ['Withdrawn', 'p-mute'] };
  var IV_STATUS = { booked: ['Interview booked', 'p-ok'], held: ['Interviewed', 'p-mute'], not_booked: ['Interview not booked yet', 'p-warn'], cancelled: ['Interview cancelled', 'p-mute'] };

  /** The status pill: the latest offer wins, then the latest interview, else "Put forward". */
  function statusOf(c, interviews, offers) {
    var o = offers.filter(function (x) { return x.enrollmentId === c.enrollmentId; }).sort(function (a, b) { return newest(a, b, 'sentAt'); })[0];
    if (o && OFFER_STATUS[o.status]) return { text: OFFER_STATUS[o.status][0], tone: OFFER_STATUS[o.status][1] };
    var i = interviews.filter(function (x) { return x.enrollmentId === c.enrollmentId && x.status !== 'cancelled'; })[0];
    if (i) return { text: IV_STATUS[i.status][0], tone: IV_STATUS[i.status][1] };
    return { text: 'Put forward', tone: 'p-info' };
  }
  /** The role: this client's latest offer, else its latest interview, else the headline on the reviewed Hire profile. */
  function roleOf(c, interviews, offers) {
    var o = offers.filter(function (x) { return x.enrollmentId === c.enrollmentId; }).sort(function (a, b) { return newest(a, b, 'sentAt'); })[0];
    var i = interviews.filter(function (x) { return x.enrollmentId === c.enrollmentId && x.role; })[0];
    return (o && o.role) || (i && i.role) || (c.profile && c.profile.role) || '';
  }

  /** One candidate card's words. */
  function card(c, ctx) {
    var p = c.profile && M.PROFILE.test(String(c.profile.url || '')) ? c.profile : null;
    var projects = ctx.profilesUnavailable ? T.projectsFailed : p && p.verifiedProjects.length
      ? p.verifiedProjects.join(', ') + (p.verifiedCount > p.verifiedProjects.length ? ' and ' + (p.verifiedCount - p.verifiedProjects.length) + ' more' : '') : T.projectsNone;
    return {
      id: c.enrollmentId, initials: c.initials, name: c.name, role: roleOf(c, ctx.interviews, ctx.offers) || 'Role not set yet',
      status: statusOf(c, ctx.interviews, ctx.offers),
      readiness: typeof c.readiness === 'number' ? { value: String(c.readiness), text: 'Interview readiness, of 100' } : { value: null, text: T.readinessNone },
      projects: projects, resume: p ? p.url : null, resumeNote: ctx.profilesUnavailable ? T.projectsFailed : T.resumeNone, bestAnswer: T.bestAnswer,
      putForward: 'Put forward ' + central(c.putForwardAt).replace(/,[^,]*$/, ''),
    };
  }

  /** One Interviews row. Join only when the API gave the signed room page (an https /room/ link of our shape). */
  function interviewRow(i) {
    var s = IV_STATUS[i.status] || IV_STATUS.not_booked;
    return { id: i.id, candidate: i.candidateName, when: i.startsAt ? central(i.startsAt) + ' Central' : 'Not booked',
      what: [i.role, i.minutes ? i.minutes + ' min' : ''].filter(Boolean).join(' · '), status: { text: s[0] + (i.recorded ? ' · recorded' : ''), tone: s[1] },
      join: M.ROOM.test(String(i.joinPage || '')) ? i.joinPage : null };
  }

  var INVOICE = { not_invoiced: 'Not invoiced yet', invoiced: 'Invoiced', paid: 'Paid' };
  /** One Offers and fees row: the 7 columns. */
  function offerRow(o) {
    var s = OFFER_STATUS[o.status] || [o.status, 'p-mute'];
    var basis = o.payBasis === 'hourly' ? M.money(o.hourlyRateCents) + '/hr × ' + o.hoursPerWeek + ' h × ' + M.WEEKS + ' wk' : M.money(o.salaryCents) + ' a year';
    return { id: o.id, candidate: o.candidateName, role: o.role, basis: basis, firstYear: M.money(o.firstYearCents), fee: M.money(o.feeCents),
      start: o.startDate ? day(o.startDate) : 'Not set', status: { text: s[0], tone: s[1] },
      invoice: o.invoiceStatus ? INVOICE[o.invoiceStatus] : o.status === 'accepted' ? 'Not invoiced yet' : 'Fee applies on acceptance' };
  }

  /** The 3 KPIs: offers out (sent or talking), accepted, fees on accepted offers. */
  function kpis(offers) {
    var acc = offers.filter(function (o) { return o.status === 'accepted'; });
    return { out: offers.filter(function (o) { return o.status === 'sent' || o.status === 'talk_first'; }).length, accepted: acc.length,
      fees: M.money(acc.reduce(function (n, o) { return n + o.feeCents; }, 0)) };
  }

  /** The fee callout under the table, with the rate in force. */
  function feeCallout(rateBp) {
    return 'The placement fee is ' + M.pct(rateBp) + ' of the first-year salary. For hourly roles we use hourly rate × hours a week × ' + M.WEEKS
      + ' weeks. It applies only when the candidate accepts.';
  }

  return { central: central, day: day, statusOf: statusOf, roleOf: roleOf, card: card, interviewRow: interviewRow, offerRow: offerRow, kpis: kpis, feeCallout: feeCallout };
}));
