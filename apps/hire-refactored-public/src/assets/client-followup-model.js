/*
 * hire.refactored.ai - the employer portal's follow-ups, pure logic (/client/, Career Prep CP10.3, kit F8). No DOM:
 * the templates, the checks the page shows before saving (the server checks them again, backend
 * services/placement/followUpRules.ts, and is the authority), the request body, what an answer means, and the words
 * each Follow-ups row shows. client-followups.js and client-portal.js render it; node's runner tests it.
 *
 * HONEST: a follow-up is only "Sent" when the server says so; a held or cancelled one says why. The email is plain
 * text, and opens of plain-text mail cannot be measured, so the page shows clicks only and says opens are not tracked.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./client-model.js') : root.HireClientModel, node ? require('./client-views.js') : root.HireClientViews);
  if (node) module.exports = api;
  else root.HireFollowUpModel = api;
}(typeof self !== 'undefined' ? self : this, function (M, V) {
  'use strict';
  var DASH = new RegExp('[\\u2013\\u2014]');
  var URLS = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
  var SAFE_LINK = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d{2,5})?(?:[/?#][^\s<>"'`]*)?$/;
  var BOOKING = '{booking link}';
  var HTTPS = new RegExp('^https://', 'i');
  var FIELD = new RegExp('\\{[^{}\\n]{0,40}\\}', 'g'); // anything in braces (a merge field)
  var ORDER = ['thank_you', 'next_steps', 'offer_reminder', 'custom'];
  var TEMPLATES = {
    thank_you: { label: 'Thank you', subject: 'Thank you for your time', body: 'Hi {first},\n\nThanks for your time today. We enjoyed talking with you and will be in touch soon.' },
    next_steps: { label: 'Next steps', subject: 'Next steps', body: 'Hi {first},\n\nWe would like to move you to the next round. Pick a time that works for you here: {booking link}' },
    offer_reminder: { label: 'Offer reminder', subject: 'Checking in on our offer', body: 'Hi {first},\n\nJust checking in on our offer. Happy to answer any questions before you decide.' },
    custom: { label: 'Custom', subject: '', body: '' },
  };
  var TEXT = {
    dashBody: 'Remove the long dash from the message. Use a comma, a colon or a period instead.',
    dashSubject: 'Remove the long dash from the subject. Use a comma, a colon or a period instead.',
    subjectBlank: 'Enter a subject.',
    bodyBlank: 'Write the message.',
    oneLink: 'A follow-up can carry at most one link.',
    needLink: 'Add your booking link, or take {booking link} out of the message.',
    unusedLink: 'Put {booking link} in the message where the link should go, or clear the booking link.',
    badLink: 'The booking link must be a full https:// address.',
    when: 'Pick the day and time to send it.',
    checks: 'Checked before sending: no long dashes, no attachments, one https:// link at most. Clicks on the link show in Follow-ups. Opens cannot be tracked for plain-text email, so they are not shown.',
    httpsOnly: 'Links in the message must start with https://.',
    noOpens: 'Opens cannot be tracked for plain-text email.',
    mailOff: 'Employer email is switched off right now, so follow-ups that come due are held, not sent.',
    none: 'No follow-ups yet.',
    loadFailed: 'Could not load your follow-ups just now. Your offers and candidates are fine; try again in a moment.',
    nowNote: 'It goes out within 5 minutes.',
  };
  var STATUS = { scheduled: ['Scheduled', 'p-info'], sending: ['Sending', 'p-info'], sent: ['Sent', 'p-ok'], clicked: ['Clicked', 'p-ok'],
    replied: ['Replied', 'p-ok'], cancelled: ['Cancelled', 'p-mute'], failed: ['Not sent', 'p-warn'], held: ['Held', 'p-warn'] };
  var REASON = { employer_mail_off: 'Held: employer email is switched off, so it was not sent.', replied: 'Cancelled: they replied before it went.',
    employer: 'Cancelled by your team.', candidate_removed: 'Cancelled: this candidate is no longer put forward to you.',
    sender_removed: 'Cancelled: the person who scheduled it no longer has access.', NoRecipient: 'Not sent: there is no email address on file for this candidate.',
    ContractViolation: 'Not sent: the message no longer passes the checks.', Abandoned: 'Not sent: the send could not be confirmed after 4 tries.' };

  /** A new draft for a candidate, from a template, signed with the company name. */
  function draft(enrollmentId, template, sign, today) {
    var t = TEMPLATES[template] || TEMPLATES.custom;
    return { enrollmentId: enrollmentId, offerId: null, template: template in TEMPLATES ? template : 'custom', subject: t.subject,
      body: t.body ? t.body + '\n\n' + (sign || '') : '', bookingLink: '', date: today || '', time: '09:00', onlyIf: 'no_reply' };
  }
  /** Switch template: the subject and message become the template's (Custom keeps what is there). */
  function applyTemplate(form, template, sign) {
    if (template === 'custom') return Object.assign({}, form, { template: 'custom' });
    var d = draft(form.enrollmentId, template, sign, form.date);
    return Object.assign({}, form, { template: d.template, subject: d.subject, body: d.body });
  }

  /** The first thing to fix before saving (the server's rules, in the same words), or ''. */
  function problem(form, sendNow) {
    var subject = String(form.subject || ''); var body = String(form.body || ''); var link = String(form.bookingLink || '').trim();
    if (!subject.trim()) return TEXT.subjectBlank;
    if (DASH.test(subject)) return TEXT.dashSubject;
    if (!body.trim()) return TEXT.bodyBlank;
    if (DASH.test(body)) return TEXT.dashBody;
    var field = (body.match(FIELD) || []).filter(function (f) { return f !== '{first}' && f !== BOOKING; })[0];
    if (field) return 'Only {first} and {booking link} can be filled in for you. Remove ' + field + '.';
    var uses = body.split(BOOKING).length - 1;
    var typed = body.match(URLS) || [];
    if (typed.length + uses > 1) return TEXT.oneLink;
    if (typed.some(function (u) { return !HTTPS.test(u) || DASH.test(u); })) return TEXT.httpsOnly;
    if (uses && !link) return TEXT.needLink;
    if (link && !uses) return TEXT.unusedLink;
    if (link && (link.length > 500 || !SAFE_LINK.test(link) || DASH.test(link))) return TEXT.badLink;
    if (!sendNow && !M.centralAt(form.date, form.time)) return TEXT.when;
    return '';
  }

  /** The schedule request (backend routes/hireClientFollowUpRoutes.ts ScheduleBody). key = one per Schedule click. */
  function requestBody(form, key, sendNow) {
    var b = { id: key, enrollmentId: form.enrollmentId, offerId: form.offerId || null, template: form.template, subject: String(form.subject).trim(), body: String(form.body),
      bookingLink: String(form.bookingLink || '').trim() || null, onlyIf: form.onlyIf === 'always' ? 'always' : 'no_reply' };
    if (sendNow) b.sendNow = true; else b.sendOn = M.centralAt(form.date, form.time);
    return b;
  }

  /** What a schedule answer means. noteMailOff: say it will be held (where the page shows no switched-off banner). */
  function saveState(status, body, noteMailOff) {
    var b = body || {};
    if ((status === 201 || status === 200) && b.followUp) {
      var f = b.followUp; var due = new Date(f.sendOn).getTime() <= Date.now() + 60000;
      var msg = (due ? 'Follow-up to ' + f.candidateName + ' saved. ' + TEXT.nowNote : 'Follow-up to ' + f.candidateName + ' scheduled for ' + V.central(f.sendOn) + ' Central.')
        + (f.onlyIf === 'no_reply' ? ' It is skipped if they reply first.' : '') + (noteMailOff && b.mailOn === false ? ' ' + TEXT.mailOff : '');
      return { kind: 'saved', message: msg, followUp: f };
    }
    if (status === 400) return { kind: 'fix', message: b.error || M.TEXT.failed };
    if (status === 401) return { kind: 'signed_out', message: M.TEXT.signedOut };
    if (status === 404) return { kind: 'fix', message: 'That candidate or offer is not one of yours.' };
    return { kind: 'failed', message: M.TEXT.failed };
  }

  /** "YYYY-MM-DD" in Central, n days after the instant `ms`. */
  function centralDay(ms, n) {
    var p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))
      .reduce(function (o, x) { o[x.type] = x.value; return o; }, {});
    var d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + (n || 0), 12));
    return d.toISOString().slice(0, 10);
  }

  /** The offer dialog's "follow-up if there is no answer in 3 days": the Offer reminder, 9:00 AM Central 3 days on. */
  function offerReminder(offer, sign, nowMs) {
    var f = draft(offer.enrollmentId, 'offer_reminder', sign, centralDay(nowMs, 3));
    f.offerId = offer.id;
    return f;
  }

  /** One Follow-ups row's words. */
  function row(f) {
    var s = STATUS[f.status] || [f.status, 'p-mute'];
    var gone = f.sentAt && ['sent', 'opened', 'clicked', 'replied'].indexOf(f.status) >= 0;
    // Clicks only: the mail is plain text, and opens of plain-text mail cannot be measured, so no open count is shown.
    var clicks = [f.clicks.link ? 'Clicked the link ' + f.clicks.link : '', f.clicks.other ? 'other links ' + f.clicks.other : ''].filter(Boolean).join(' · ');
    var tracking = gone ? (clicks || 'No clicks yet') + '. ' + TEXT.noOpens
      : REASON[f.reason] || (f.status === 'failed' ? 'Not sent after 4 tries.' : f.retrying ? 'Trying again after a delivery problem.' : '');
    return { id: f.id, to: f.candidateName, subject: f.subject, when: gone ? 'Sent ' + V.central(f.sentAt) : V.central(f.sendOn),
      status: { text: s[0], tone: s[1] }, tracking: tracking, canCancel: f.status === 'scheduled' };
  }

  return { TEXT: TEXT, TEMPLATES: TEMPLATES, ORDER: ORDER, draft: draft, applyTemplate: applyTemplate, problem: problem, requestBody: requestBody, saveState: saveState,
    centralDay: centralDay, offerReminder: offerReminder, row: row };
}));
