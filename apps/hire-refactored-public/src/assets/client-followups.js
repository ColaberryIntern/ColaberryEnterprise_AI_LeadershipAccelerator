/*
 * hire.refactored.ai - the employer portal's Schedule a follow-up dialog (/client/, Career Prep CP10.3, kit F8).
 * Browser only; the rules (templates, the checks, the request body, what an answer means) live in
 * client-followup-model.js and are tested there.
 *
 * Template (Thank you, Next steps, Offer reminder, Custom) with {first} and {booking link}; the message; the booking
 * link for {booking link}; send on (Central); only if they have not replied, or always; Schedule it or Send now. The
 * buttons stay disabled while the message fails a check, and say why. One key per draft: any edit makes a new key; a
 * retry of an unchanged draft reuses it, so the server stores one. It shares the page's dialog box with Make an offer
 * (client-offer.js closes it, and refuses to while a request is in flight).
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var M = window.HireClientModel;
  var F = window.HireFollowUpModel;
  var P = window.HireClientPortal;
  var S = P.state;
  var doc = document;
  var esc = C.esc;
  var box = doc.getElementById('dialog');

  function sign() { return S.session ? S.session.clientName : ''; }
  function who() { var c = S.data.candidates.filter(function (x) { return x.enrollmentId === S.fu.enrollmentId; })[0]; return c ? c.name : ''; }
  function formHtml() {
    var f = S.fu;
    var opts = S.data.candidates.map(function (c) { return '<option value="' + esc(c.enrollmentId) + '"' + (c.enrollmentId === f.enrollmentId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    var chips = F.ORDER.map(function (k) { return '<button type="button" data-tpl="' + k + '" aria-pressed="' + (f.template === k) + '">' + esc(F.TEMPLATES[k].label) + '</button>'; }).join('');
    return '<div class="cp-dialog card" role="dialog" aria-modal="true" aria-labelledby="fu-h" data-testid="followup-form"><div class="cp-dhead"><div><div class="label">Follow-up · sent through Refactored.ai</div>'
      + '<h2 id="fu-h" tabindex="-1">Email <span id="fu-name">' + esc(who()) + '</span></h2></div><button type="button" class="btn btn-ghost btn-sm" data-act="close" id="of-close" aria-label="Close">Close</button></div>'
      + '<label class="field"><span class="field-label">Candidate</span><select data-fu="enrollmentId">' + opts + '</select></label>'
      + '<div class="field"><span class="field-label" id="tpl-l">Template</span><div class="seg cp-wrap" role="group" aria-labelledby="tpl-l">' + chips + '</div></div>'
      + '<label class="field"><span class="field-label">Subject</span><input data-fu="subject" data-testid="fu-subject" maxlength="150" value="' + esc(f.subject) + '"></label>'
      + '<label class="field"><span class="field-label">Message · {first} and {booking link} are filled in for you</span><textarea data-fu="body" data-testid="fu-body" rows="7" maxlength="5000">' + esc(f.body) + '</textarea></label>'
      + '<label class="field"><span class="field-label">Your booking link, for {booking link} (optional)</span><input data-fu="bookingLink" data-testid="fu-link" inputmode="url" maxlength="500" placeholder="https://" value="' + esc(f.bookingLink) + '"></label>'
      + '<div class="cp-two"><label class="field"><span class="field-label">Send on · Central</span><input type="date" data-fu="date" data-testid="fu-date" value="' + esc(f.date) + '"></label>'
      + '<label class="field"><span class="field-label">Time · Central</span><input type="time" data-fu="time" data-testid="fu-time" value="' + esc(f.time) + '"></label></div>'
      + '<label class="field"><span class="field-label">Only if</span><select data-fu="onlyIf" data-testid="fu-onlyif"><option value="no_reply"' + (f.onlyIf === 'no_reply' ? ' selected' : '') + '>They have not replied</option>'
      + '<option value="always"' + (f.onlyIf === 'always' ? ' selected' : '') + '>Always</option></select></label>'
      + '<div class="callout">' + esc(F.TEXT.checks) + (S.data.mailOn === false ? ' ' + esc(F.TEXT.mailOff) : '') + '</div>'
      + '<p class="notice" role="alert" id="of-msg"' + (S.formMsg ? '' : ' hidden') + '>' + esc(S.formMsg) + '</p>'
      + '<div class="acts start"><button type="button" class="btn btn-primary" data-fact="save" data-testid="fu-save">Schedule it</button>'
      + '<button type="button" class="btn btn-ghost" data-fact="now" data-testid="fu-now">Send now</button><span class="faint small" id="fu-why" data-testid="fu-why"></span></div></div>';
  }
  function sync() {
    var why = S.busy ? 'Saving...' : F.problem(S.fu, false);
    var nowWhy = S.busy ? why : F.problem(S.fu, true);
    doc.querySelector('[data-fact="save"]').disabled = !!why;
    doc.querySelector('[data-fact="now"]').disabled = !!nowWhy;
    doc.getElementById('fu-why').textContent = why || '';
    doc.getElementById('of-close').disabled = S.busy;
    box.setAttribute('aria-busy', String(S.busy));
    doc.getElementById('fu-name').textContent = who();
    var msg = doc.getElementById('of-msg'); msg.textContent = S.formMsg; msg.hidden = !S.formMsg;
  }
  function show() { box.innerHTML = formHtml(); box.hidden = false; doc.body.classList.add('cp-locked'); sync(); }

  function open(enrollmentId) {
    var d = S.data; var c = d.candidates.filter(function (x) { return x.enrollmentId === enrollmentId; })[0] || d.candidates[0];
    if (!c) { S.notice = M.TEXT.noCandidates; P.render(); return; }
    window.HireClientOffer.remember(doc.activeElement);
    S.fu = F.draft(c.enrollmentId, 'offer_reminder', sign(), F.centralDay(Date.now(), 1));
    S.fuKey = P.newKey(); S.formMsg = ''; S.busy = false;
    show();
    doc.getElementById('fu-h').focus();
  }
  function submit(sendNow) {
    if (S.busy || F.problem(S.fu, sendNow)) return;
    S.busy = true; S.formMsg = ''; sync();
    P.call('POST', '/follow-ups', F.requestBody(S.fu, S.fuKey, sendNow)).then(function (r) {
      S.busy = false;
      var st = F.saveState(r.status, r.body);
      if (st.kind === 'saved') { window.HireClientOffer.close(true); S.fu = null; S.view = 'followups'; S.notice = st.message; P.load(); return; }
      if (st.kind === 'signed_out') { window.HireClientOffer.close(true); P.signedOut(st.message); return; }
      if (!S.fu || box.hidden) { S.notice = 'The follow-up was not saved. ' + st.message; P.render(); return; }
      S.formMsg = st.message; sync(); // the key and the draft stay, so trying again stores one
    });
  }
  function cancel(id) {
    P.call('POST', '/follow-ups/' + encodeURIComponent(id) + '/cancel').then(function (r) {
      if (r.status === 401) { P.signedOut(M.TEXT.signedOut); return; }
      S.notice = r.status === 200 ? 'Follow-up cancelled. Nothing will be sent.' : (r.status === 409 && r.body && r.body.error) || M.TEXT.failed;
      P.load();
    });
  }
  /** After an offer is sent with the follow-up box ticked: schedule the Offer reminder. Resolves to the words to show. */
  function afterOffer(offer, key) {
    return P.call('POST', '/follow-ups', F.requestBody(F.offerReminder(offer, sign(), Date.now()), key, false)).then(function (r) {
      var st = F.saveState(r.status, r.body, true); // the Offers page has no switched-off banner, so the notice says it
      return st.kind === 'saved' ? st.message : 'The follow-up was not scheduled: ' + st.message + ' You can schedule one from Follow-ups.';
    });
  }

  box.addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-fu');
    if (!k || !S.fu) return;
    S.fu[k] = e.target.value; S.fuKey = P.newKey(); S.formMsg = ''; sync();
  });
  box.addEventListener('change', function (e) { if (S.fu && e.target.getAttribute && e.target.getAttribute('data-fu')) { S.fu[e.target.getAttribute('data-fu')] = e.target.value; sync(); } });
  box.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-tpl],[data-fact]') : null;
    if (!b || !S.fu || S.busy) return;
    if (b.hasAttribute('data-tpl')) { S.fu = F.applyTemplate(S.fu, b.getAttribute('data-tpl'), sign()); S.fuKey = P.newKey(); S.formMsg = ''; show(); return; }
    submit(b.getAttribute('data-fact') === 'now');
  });
  window.HireClientFollowUps = { open: open, cancel: cancel, afterOffer: afterOffer };
}());
