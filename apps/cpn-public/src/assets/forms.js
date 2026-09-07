/**
 * Lead capture for every OpportunityLift form.
 *
 * WHY THIS IS ONE FILE AND NOT THREE COPIES
 *
 * The skeleton carried its submit handler inline in the one page that had a form. Three
 * pages now capture leads (scholarship interest, community partner interest, supporter
 * interest) and the handler is identical apart from the entry slug. Copying it three
 * times means a fix to the error path lands on one page and silently misses the others,
 * which is the failure mode where a form looks fine and drops submissions.
 *
 * So the differences are declared in markup, on the <form> itself:
 *
 *   data-form   the entry point slug. It is ALSO the `entry=` query parameter, because
 *               these are the same identifier and giving them two spellings is how they
 *               drift. The slug must exist in `lead_entry_points` (seeded by
 *               backend/src/seeds/seedLeadSources.ts) or ingest answers "Unknown or
 *               inactive entry point" and the submission is lost.
 *   data-thanks the confirmation sentence. Each form promises something slightly
 *               different, and a generic "thank you" would be the wrong promise on at
 *               least one of them.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not promise a confirmation email. Sending from opportunitylift.org is blocked:
 * Mandrill rejects the domain as `unsigned` pending ownership verification, which is
 * itself blocked behind a Mailchimp 2FA recovery case. Receiving works through the
 * Cloudflare catch-all, so a human can reply, but nothing automatic will arrive. A form
 * that says "check your inbox" would be describing an email that never sends, and the
 * person would sit waiting for it. Every `data-thanks` string says a person will follow
 * up, and none of them mention an inbox.
 *
 * TRACKING
 *
 * `track-v2.js` already fires `cta_click` (any `[data-cta]`) and `form_start` (first
 * interaction with any `[data-form]`) on its own. `form_submit` is the one event it
 * cannot infer, because only this code knows whether ingest accepted the lead. It fires
 * after a confirmed 2xx, so the funnel counts submissions that landed rather than
 * button presses that failed.
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-api]');
  if (!script) return;

  var API = script.getAttribute('data-api');
  var SOURCE = script.getAttribute('data-source');

  /** Turn a form into the flat payload `/api/leads/ingest` expects. */
  function payloadFor(form) {
    var payload = {};
    new FormData(form).forEach(function (value, key) {
      payload[key] = value;
    });

    // A checkbox is absent from FormData when unchecked, which would read server-side as
    // "not supplied" rather than "declined". Consent has to be an explicit boolean.
    var consent = form.querySelector('input[type="checkbox"][name="consent_contact"]');
    payload.consent_contact = consent ? consent.checked : false;

    // Attribution the server cannot infer from the request alone.
    payload.page_url = window.location.href;
    try {
      payload.visitor_fingerprint = localStorage.getItem('rfx_fp') || undefined;
    } catch (e) {
      /* blocked storage: ingest still works, the lead is just not linked to the session */
    }

    return payload;
  }

  function bind(form) {
    var entry = form.getAttribute('data-form');
    var status = form.querySelector('.status');
    var button = form.querySelector('button[type="submit"]');
    var thanks = form.getAttribute('data-thanks') || 'Thank you. We have your details.';

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      // `novalidate` is not set, so the browser has already enforced required fields and
      // email shape by the time this runs.
      if (button) button.disabled = true;
      if (status) {
        status.textContent = 'Sending...';
        status.removeAttribute('data-state');
      }

      var url = API + '/api/leads/ingest?source=' + encodeURIComponent(SOURCE) +
        '&entry=' + encodeURIComponent(entry);

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFor(form)),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            throw new Error(
              result.body && result.body.error ? result.body.error : 'Submission failed'
            );
          }
          if (window.rfxTrack) window.rfxTrack('form_submit', { form: entry });

          /*
            HAND OFF TO THE INTERVIEW, IF THIS FORM OPENS ONE.

            `/api/leads/ingest` returns `raw_payload_id`, and that is the token the
            interview is keyed on - so the form, the conversation and the stored
            record all hang off one identity for one person, with no second session.

            Dispatched as an event rather than called directly: this file's job is
            capturing a lead, and it should not know what happens next. A page with
            no interview script listening simply shows the thank-you, which is what
            every other form on the site does.
          */
          var opensInterview = form.hasAttribute('data-interview');
          var token = result.body && result.body.raw_payload_id;
          if (opensInterview && token) {
            document.dispatchEvent(new CustomEvent('cpn:lead-captured', {
              detail: {
                entry: entry,
                token: token,
                // Their own words, which become the interview's opening turn.
                firstMessage: (form.querySelector('[name="message"]') || {}).value || '',
              },
            }));
            return;
          }

          if (status) {
            status.textContent = thanks;
            status.setAttribute('data-state', 'ok');
          }
          form.reset();
        })
        .catch(function (err) {
          if (status) {
            // The message names a way to reach a human, because the alternative is a
            // dead end on the one page where somebody was trying to reach us.
            status.textContent =
              (err.message || 'Something went wrong.') +
              ' You can email scholars@opportunitylift.org instead.';
            status.setAttribute('data-state', 'error');
          }
        })
        .finally(function () {
          if (button) button.disabled = false;
        });
    });
  }

  var forms = document.querySelectorAll('form[data-form]');
  for (var i = 0; i < forms.length; i += 1) bind(forms[i]);
})();
