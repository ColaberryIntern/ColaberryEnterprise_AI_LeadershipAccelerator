/*
 * hire.refactored.ai - the intro form. Progressive: without this script the form still
 * POSTs to the API and comes back to /intro/?sent=1 or ?error=1. With it, the same fields
 * go as JSON and the outcome is reported in place. Never reveals a candidate's contact.
 *
 * `introStatus` is pure and exported so every response class has a tested message.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireIntro = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function introStatus(status) {
    if (status === 200 || status === 201 || status === 202) return { ok: true, text: '✓ Request sent. The Colaberry team will be in touch.' };
    if (status === 400) return { ok: false, text: 'Please check the fields and try again.' };
    if (status === 429) return { ok: false, text: 'Too many requests from here just now. Please try again later.' };
    return { ok: false, text: 'The request could not be sent just now. Please try again in a moment.' };
  }

  function talentFrom(search) {
    var t = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('talent') || '';
    return /^[a-z0-9][a-z0-9-]{0,158}$/i.test(t) ? t : '';
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { introStatus: introStatus, talentFrom: talentFrom };
  }

  var doc = document;
  var C = window.HireCommon;
  var form = doc.getElementById('intro-form');
  var status = doc.getElementById('intro-status');
  var params = new URLSearchParams(window.location.search);
  var talent = talentFrom(window.location.search);
  var busy = false;

  function say(s) {
    if (!status) return;
    status.textContent = s.text;
    status.className = 'form-status ' + (s.ok ? 'ok' : 'err');
  }

  if (form) {
    doc.getElementById('talentSlug').value = talent;
    if (params.get('sent') === '1') say(introStatus(201));
    if (params.get('error') === '1') say(introStatus(400));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return; // one request in flight; the server dedupes repeats on the same day
      if (!form.checkValidity()) { say(introStatus(400)); return; }
      busy = true;
      var fields = {};
      ['talentSlug', 'name', 'email', 'company', 'role', 'message'].forEach(function (k) {
        fields[k] = String((form.elements[k] && form.elements[k].value) || '').trim();
      });
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
      fetch(form.getAttribute('action'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(fields), signal: ctrl ? ctrl.signal : undefined,
      }).then(function (r) { return r.status; }, function () { return 0; }).then(function (code) {
        if (timer) clearTimeout(timer);
        busy = false;
        var s = introStatus(code);
        say(s);
        if (s.ok) { form.reset(); doc.getElementById('talentSlug').value = talent; }
        C.track(window, 'intro_submit', { talentSlug: talent, ok: s.ok });
      });
    });
  }

  return { introStatus: introStatus, talentFrom: talentFrom };
}));
