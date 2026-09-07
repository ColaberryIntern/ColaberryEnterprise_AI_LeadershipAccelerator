/**
 * Free account signup, from OpportunityLift into the Colaberry learning platform.
 *
 * WHY THIS REPLACED THE HAND-OFF TO refactored.ai
 *
 * `/learn-free/` used to send people to `refactored.ai/signup`, on the reasoning
 * that the training was theirs and their Auth0 could send a sign-in email when
 * opportunitylift.org could not. Ali reported the actual behaviour: that signup
 * "goes to refactored.ai but not sending any login emails". So the one thing that
 * justified the hand-off was not happening.
 *
 * The platform's own free-account flow does send. `communication_logs` shows 277
 * "Welcome to Colaberry" magic links with status `sent`, the most recent the same
 * day this was written. So the account moves here, where the email demonstrably
 * arrives.
 *
 * ## TWO CALLS, AND THE ORDER IS THE WHOLE TRICK
 *
 *   1. `POST /api/leads/ingest?source=cpn&entry=free_training_interest`
 *   2. `POST /api/create-free-account`
 *
 * Ali's requirement was that these people "show up as a lead from opportunity
 * lift". Step 2 alone cannot do that: `createExplorerEnrollment` hardcodes
 * `source: 'open_house'` on the lead it captures, so a CPN signup would be filed
 * under Colaberry's open house.
 *
 * But that capture is a `findOrCreate` keyed on email. Running the CPN ingest
 * FIRST means the canonical lead already exists, with its OpportunityLift source
 * and its `LeadTenantContext`, so step 2 finds it and leaves the attribution
 * alone. Reversing these two lines silently misattributes every signup, which is
 * why this comment is longer than the code.
 *
 * ## FAILURE FAVOURS THE PERSON, NOT THE RECORD
 *
 * If the ingest fails we still create the account: somebody who asked to start
 * learning should start learning, and a mis-sourced lead is a reporting problem
 * we can fix later. If the account call fails, the lead survives and a human can
 * pick it up. The only outcome treated as total failure is both.
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-signup-api]');
  if (!script) return;

  var API = script.getAttribute('data-signup-api');
  var SOURCE = script.getAttribute('data-signup-source');

  function bind(form) {
    var entry = form.getAttribute('data-form');
    var status = form.querySelector('.status');
    var button = form.querySelector('button[type="submit"]');
    var done = form.parentElement.querySelector('.signup-done');

    function say(text, state) {
      if (!status) return;
      status.textContent = text;
      if (state) status.setAttribute('data-state', state);
      else status.removeAttribute('data-state');
    }

    function payload() {
      var out = {};
      new FormData(form).forEach(function (v, k) { out[k] = v; });
      var consent = form.querySelector('input[type="checkbox"][name="consent_contact"]');
      out.consent_contact = consent ? consent.checked : false;
      out.page_url = window.location.href;
      try {
        out.visitor_fingerprint = localStorage.getItem('rfx_fp') || undefined;
      } catch (e) { /* blocked storage: signup still works, just unlinked */ }
      return out;
    }

    /** Step 1. Attribution. Never allowed to block the account. */
    function captureLead(data) {
      return fetch(
        API + '/api/leads/ingest?source=' + encodeURIComponent(SOURCE) +
          '&entry=' + encodeURIComponent(entry),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      ).catch(function () { return null; });
    }

    /** Step 2. The account, and the magic link that actually arrives. */
    function createAccount(data) {
      return fetch(API + '/api/create-free-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          marketing_opt_in: data.consent_contact === true,
          page_url: data.page_url,
        }),
      }).then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (button) button.disabled = true;
      say('Creating your account...');

      var data = payload();

      captureLead(data)
        .then(function () { return createAccount(data); })
        .then(function (result) {
          if (!result.ok) {
            throw new Error(
              (result.body && result.body.error) || 'We could not create the account.'
            );
          }
          if (window.rfxTrack) window.rfxTrack('form_submit', { form: entry });

          form.hidden = true;
          if (done) {
            done.hidden = false;
            done.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        })
        .catch(function (err) {
          // The lead was almost certainly captured by step 1, so do not tell
          // somebody their details are lost when they are not.
          say(
            (err.message || 'Something went wrong.') +
              ' Your details are with us and a person will follow up. You can also ' +
              'email scholars@opportunitylift.org.',
            'error'
          );
        })
        .finally(function () {
          if (button) button.disabled = false;
        });
    });
  }

  var forms = document.querySelectorAll('form[data-signup]');
  for (var i = 0; i < forms.length; i += 1) bind(forms[i]);
})();
