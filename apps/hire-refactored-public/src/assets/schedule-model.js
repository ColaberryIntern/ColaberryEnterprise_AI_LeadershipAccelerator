/*
 * hire.refactored.ai - the schedule page's pure logic (/talent/<slug>/schedule/, kit Part 2).
 * No DOM: the week grid, the stepper, the details validation, the summary rows, the employer's
 * own calendar hold and what the URL asks for. schedule.js renders it; node's runner tests it.
 *
 * Times: the API sends UTC instants, each slot already carrying its day in the viewer's zone
 * (`day`, asked for with `?tz=`). Nothing here assumes the browser's zone; it is passed in.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./profile-extras.js') : root.HireProfileExtras);
  if (node) module.exports = api;
  else root.HireScheduleModel = api;
}(typeof self !== 'undefined' ? self : this, function (X) {
  'use strict';
  var arr = function (v) { return Array.isArray(v) ? v : []; };

  var STEPS = ['Format', 'Time', 'Your details', 'Done'];
  var FORMAT_COPY = {
    intro: 'Meet them, hear how they work, decide if there is a fit.',
    walkthrough: 'They present one of their published case studies live and take your questions.',
    working: 'Bring a real problem from your team and work through it together.',
  };
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SLUG = /^[a-z0-9][a-z0-9-]{0,158}$/i;

  function slugFromPath(pathname) {
    var m = /^\/talent\/([a-z0-9][a-z0-9-]{0,158})\/schedule\/?$/i.exec(String(pathname || ''));
    return m && m[1].toLowerCase() !== 'record' ? m[1] : null;
  }

  /* Calendar arithmetic on "YYYY-MM-DD" strings, in UTC so no zone can shift a day. */
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function mondayOf(s) { var d = parse(s); var back = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - back); return ymd(d); }

  /* "Nov 16 – 20", or "Nov 30 – Dec 4" across a month. */
  function weekLabel(monday) {
    var a = parse(monday); var b = parse(addDays(monday, 4));
    return MON[a.getUTCMonth()] + ' ' + a.getUTCDate() + ' – ' + (a.getUTCMonth() === b.getUTCMonth() ? '' : MON[b.getUTCMonth()] + ' ') + b.getUTCDate();
  }

  /*
   * The week's columns: Mon-Fri always (an empty one says "No open times"), and a Saturday or
   * Sunday only when a slot lands there, which happens when the viewer is far from the
   * candidate. Each slot carries its label in the viewer's zone.
   */
  function weekColumns(slots, monday, tz) {
    var days = [];
    for (var i = 0; i < 7; i++) {
      var day = addDays(monday, i);
      var d = parse(day);
      var list = arr(slots).filter(function (s) { return s && s.day === day; }).map(function (s) {
        var p = X.slotParts(s.start, tz);
        return { start: s.start, time: p ? p.time : '' };
      });
      var weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      if (!weekend || list.length) days.push({ day: day, dow: DOW[d.getUTCDay()], label: MON[d.getUTCMonth()] + ' ' + d.getUTCDate(), slots: list });
    }
    return days;
  }

  function stepItems(current) {
    return STEPS.map(function (label, i) {
      var n = i + 1;
      return { n: n, label: label, state: n < current ? 'done' : (n === current ? 'current' : 'todo') };
    });
  }

  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function interviewerList(raw) {
    return String(raw || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* Field-level problems, in form order, so focus can move to the first one. */
  function validateDetails(f) {
    var out = [];
    var need = function (k, msg) { if (!String(f[k] || '').trim()) out.push({ field: k, message: msg }); };
    need('name', 'Add your name.');
    if (!String(f.email || '').trim()) out.push({ field: 'email', message: 'Add your company email.' });
    else if (!EMAIL.test(String(f.email).trim())) out.push({ field: 'email', message: 'That email address doesn’t look right.' });
    need('company', 'Add your company.');
    need('role', 'Add the role you’re hiring for.');
    var more = interviewerList(f.interviewers);
    if (more.length > 5) out.push({ field: 'interviewers', message: 'Invite at most 5 other interviewers.' });
    else if (more.some(function (e) { return !EMAIL.test(e); })) out.push({ field: 'interviewers', message: 'Separate the emails with commas, and check each one.' });
    return out;
  }

  /* The summary card's rows: Format / Length / [Case study] / When / Where. */
  function summaryRows(s, formats, cases, tz) {
    var f = arr(formats).filter(function (x) { return x && x.id === s.format; })[0];
    var cs = s.format === 'walkthrough' ? arr(cases).filter(function (c) { return c && c.slug === s.caseSlug; })[0] : null;
    var p = s.slot ? X.slotParts(s.slot, tz) : null;
    var rows = [
      { k: 'Format', v: f ? f.name : 'Not picked yet' },
      { k: 'Length', v: f ? f.minutes + ' min' : '', mono: true },
    ];
    if (cs) rows.push({ k: 'Case study', v: cs.title });
    rows.push({ k: 'When', v: p ? p.date + ' · ' + p.time : 'Not picked yet' });
    rows.push({ k: 'Where', v: 'Refactored room' });
    return rows.filter(function (r) { return r.v; });
  }

  function icsEscape(t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

  /*
   * The employer's own hold, for "Add to my calendar" on Done. TENTATIVE until the candidate
   * confirms; the confirmed invite with the room link replaces it (same UID would need the
   * interview id, which the page is never given, so this is a separate, clearly-named hold).
   */
  function holdIcs(o) {
    var start = new Date(o.start);
    var end = new Date(start.getTime() + o.minutes * 60000);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Refactored.ai//Hire schedule//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:hold-' + icsStamp(start) + '-' + String(o.slug).replace(/[^a-z0-9-]/gi, '') + '@hire.refactored.ai',
      'DTSTAMP:' + icsStamp(o.now || new Date()), 'DTSTART:' + icsStamp(start), 'DTEND:' + icsStamp(end),
      'SUMMARY:' + icsEscape('Requested: ' + o.formatName + ' with ' + o.name),
      'DESCRIPTION:' + icsEscape('Held while ' + o.name + ' confirms. The calendar invite with the room link follows on confirm.'),
      'LOCATION:Refactored room', 'STATUS:TENTATIVE', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  /* What the address asks for: a returning no-JS post, a preselected slot, or a suggested time. */
  function fromQuery(search) {
    var q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    var slot = q.get('slot');
    var accept = q.get('accept');
    var t = q.get('t');
    return {
      sent: q.get('sent') === '1',
      error: q.get('error') || null,
      slot: slot && !isNaN(Date.parse(slot)) ? new Date(slot).toISOString() : null,
      accept: accept && /^[0-9a-f-]{36}$/i.test(accept) && t && /^[0-9a-f]{64}$/.test(t) ? { id: accept, t: t } : null,
    };
  }

  var ERRORS = {
    unavailable: 'That time was just taken or is no longer open. Please pick another.',
    invalid: 'Please check the details and try again.',
    not_found: 'This person isn’t taking bookings here.',
    failed: 'The request could not be sent just now. Please try again in a moment.',
  };
  function errorText(code) { return ERRORS[code] || ERRORS.failed; }

  return {
    STEPS: STEPS, FORMAT_COPY: FORMAT_COPY, SLUG: SLUG, slugFromPath: slugFromPath, addDays: addDays, mondayOf: mondayOf,
    weekLabel: weekLabel, weekColumns: weekColumns, stepItems: stepItems, interviewerList: interviewerList,
    validateDetails: validateDetails, summaryRows: summaryRows, holdIcs: holdIcs, fromQuery: fromQuery, errorText: errorText,
  };
}));
