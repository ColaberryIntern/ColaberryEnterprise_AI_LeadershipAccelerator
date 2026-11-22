/*
 * hire.refactored.ai - the employer portal's Make an offer dialog (/client/, Career Prep CP10.2, kit "Make an offer").
 * Browser only; the rules (pay checks, the live estimate, when Send may be pressed, the request body) live in
 * client-model.js and are tested there.
 *
 * Yearly salary or hourly rate (hours a week default 40), start date and respond-by date (5:00 PM Central that day),
 * the live calculation by the server's formula and rate, the agreement box (Send stays disabled until it is ticked),
 * and the follow-up box, on by default. One key per draft: any edit makes a new key; a retry of an unchanged draft
 * after a failure reuses it, so the server stores one offer. Send is disabled while one is in flight.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var M = window.HireClientModel;
  var V = window.HireClientViews;
  var P = window.HireClientPortal;
  var S = P.state;
  var doc = document;
  var esc = C.esc;
  var box = doc.getElementById('dialog');
  var opener = null;

  function name() { var c = S.data.candidates.filter(function (x) { return x.enrollmentId === S.form.enrollmentId; })[0]; return c ? c.name : ''; }
  function payHtml() {
    var f = S.form;
    return f.basis === 'hourly'
      ? '<div class="cp-two"><label class="field"><span class="field-label">Hourly rate (USD)</span><input data-of="rate" data-testid="offer-rate" inputmode="decimal" value="' + esc(f.rate) + '"></label>'
        + '<label class="field"><span class="field-label">Hours a week</span><input data-of="hours" data-testid="offer-hours" type="number" min="1" max="80" step="0.5" value="' + esc(f.hours) + '"></label></div>'
      : '<label class="field"><span class="field-label">Yearly salary (USD)</span><input data-of="salary" data-testid="offer-salary" inputmode="decimal" value="' + esc(f.salary) + '"></label>';
  }
  function calcHtml() {
    var f = S.form; var blank = M.payBlank(f);
    var e = blank ? { ok: true, pay: f.basis === 'hourly' ? { basis: 'hourly', rateCents: 0, hoursPerWeek: Number(f.hours) || 0 } : { basis: 'yearly', salaryCents: 0 }, firstYearCents: 0, feeCents: 0 }
      : M.estimate(f, S.data.feeRateBp);
    if (!e.ok) return '<p class="small" data-testid="calc-problem">' + esc(e.problem) + '</p>';
    var first = e.pay.basis === 'hourly' ? '<div class="ln"><span>Hourly rate × hours × weeks</span><b>' + esc(M.money(e.pay.rateCents) + ' × ' + e.pay.hoursPerWeek + ' × ' + M.WEEKS) + '</b></div>'
      : '<div class="ln"><span>Yearly salary</span><b>' + esc(M.money(e.pay.salaryCents)) + '</b></div>';
    return first + '<div class="ln"><span>First-year salary</span><b data-testid="calc-first-year">' + esc(M.money(e.firstYearCents)) + '</b></div>'
      + '<div class="ln tot"><span>Placement fee: ' + esc(M.pct(S.data.feeRateBp)) + ' of first-year salary</span><b data-testid="calc-fee">' + esc(M.money(e.feeCents)) + '</b></div>'
      + '<p class="faint small">Charged only if the candidate accepts. Bonus and benefits are not included. Refactored.ai computes the fee it records from the same figures.</p>';
  }
  function formHtml() {
    var f = S.form;
    var opts = S.data.candidates.map(function (c) { return '<option value="' + esc(c.enrollmentId) + '"' + (c.enrollmentId === f.enrollmentId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    return '<div class="cp-dialog card" role="dialog" aria-modal="true" aria-labelledby="of-h" data-testid="offer-form"><div class="cp-dhead"><div><div class="label">Make an offer · ' + esc(S.session.clientName) + '</div>'
      + '<h2 id="of-h" tabindex="-1">Offer for <span id="of-name">' + esc(name()) + '</span></h2></div><button type="button" class="btn btn-ghost btn-sm" data-act="close" aria-label="Close">Close</button></div>'
      + '<div class="cp-two"><label class="field"><span class="field-label">Candidate</span><select data-of="enrollmentId">' + opts + '</select></label>'
      + '<label class="field"><span class="field-label">Role title</span><input data-of="role" maxlength="200" value="' + esc(f.role) + '"></label></div>'
      + '<div class="field"><span class="field-label" id="basis-l">Pay is</span><div class="seg" role="group" aria-labelledby="basis-l"><button type="button" data-basis="yearly" data-testid="basis-yearly" aria-pressed="' + (f.basis === 'yearly') + '">Yearly salary</button>'
      + '<button type="button" data-basis="hourly" data-testid="basis-hourly" aria-pressed="' + (f.basis === 'hourly') + '">Hourly rate</button></div></div>'
      + '<div id="pay">' + payHtml() + '</div>'
      + '<div class="cp-two"><label class="field"><span class="field-label">Start date</span><input type="date" data-of="startDate" data-testid="offer-start" value="' + esc(f.startDate) + '"></label>'
      + '<label class="field"><span class="field-label">Respond by · 5:00 PM Central</span><input type="date" data-of="respondBy" data-testid="offer-respond" value="' + esc(f.respondBy) + '"></label></div>'
      + '<div class="calc" id="calc" data-testid="offer-calc" aria-live="polite">' + calcHtml() + '</div>'
      + '<label class="cp-check"><input type="checkbox" data-of="agreed" data-testid="offer-agree"' + (f.agreed ? ' checked' : '') + '> <span id="agree-t">' + esc(M.agreementText(name())) + '</span></label>'
      + '<label class="cp-check"><input type="checkbox" data-of="followUp" data-testid="offer-followup"' + (f.followUp ? ' checked' : '') + '> Schedule a follow-up if there is no answer in 3 days</label>'
      + '<p class="notice" role="alert" id="of-msg"' + (S.formMsg ? '' : ' hidden') + '>' + esc(S.formMsg) + '</p>'
      + '<div class="acts start"><button type="button" class="btn btn-primary" id="send" data-testid="offer-send" data-act="send">Send the offer</button><span class="faint small" id="why"></span></div></div>';
  }
  function sync() {
    var st = M.sendState(S.form, S.data.feeRateBp, S.busy);
    var send = doc.getElementById('send');
    send.disabled = !st.can; send.setAttribute('aria-disabled', String(!st.can)); send.textContent = S.busy ? 'Sending...' : 'Send the offer';
    doc.getElementById('why').textContent = st.why;
    doc.getElementById('calc').innerHTML = calcHtml();
    doc.getElementById('of-name').textContent = name();
    doc.getElementById('agree-t').textContent = M.agreementText(name());
    var msg = doc.getElementById('of-msg'); msg.textContent = S.formMsg; msg.hidden = !S.formMsg;
  }

  function open(id) {
    var d = S.data; var c = d.candidates.filter(function (x) { return x.enrollmentId === id; })[0] || d.candidates[0];
    if (!c) return;
    opener = doc.activeElement;
    S.form = { enrollmentId: c.enrollmentId, role: V.roleOf(c, d.interviews, d.offers), basis: 'yearly', salary: '', rate: '', hours: String(M.DEFAULT_HOURS), startDate: '', respondBy: '', agreed: false, followUp: true };
    S.key = P.newKey(); S.formMsg = ''; S.busy = false;
    box.innerHTML = formHtml(); box.hidden = false; doc.body.classList.add('cp-locked');
    sync();
    doc.getElementById('of-h').focus();
  }
  function close() {
    box.hidden = true; box.innerHTML = ''; doc.body.classList.remove('cp-locked'); S.form = null;
    if (opener && opener.focus) opener.focus();
  }
  function send() {
    if (S.busy || !M.sendState(S.form, S.data.feeRateBp, false).can) return;
    S.busy = true; S.formMsg = ''; sync();
    var follow = S.form.followUp;
    P.call('POST', '/offers', M.offerBody(S.form, S.key)).then(function (r) {
      S.busy = false;
      var st = M.offerState(r.status, r.body);
      if (st.kind === 'sent') { close(); S.view = 'offers'; S.notice = st.message + (follow ? ' ' + M.TEXT.followUpsOff : ''); P.load(); return; }
      if (st.kind === 'signed_out') { close(); P.signedOut(st.message); return; }
      S.formMsg = st.message; sync(); // a failed Send keeps its key and its draft, so trying again stores one offer
    });
  }

  box.addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-of');
    if (!k || !S.form) return;
    S.form[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k !== 'agreed' && k !== 'followUp') S.key = P.newKey(); // a changed offer is a new draft
    S.formMsg = ''; sync();
  });
  box.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-basis],[data-act]') : null;
    if (e.target === box) { close(); return; }
    if (!b) return;
    if (b.hasAttribute('data-basis')) {
      S.form.basis = b.getAttribute('data-basis'); S.key = P.newKey();
      box.querySelectorAll('[data-basis]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      doc.getElementById('pay').innerHTML = payHtml(); sync(); return;
    }
    if (b.getAttribute('data-act') === 'close') close();
    else if (b.getAttribute('data-act') === 'send') send();
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
  window.HireClientOffer = { open: open, close: close };
}());
