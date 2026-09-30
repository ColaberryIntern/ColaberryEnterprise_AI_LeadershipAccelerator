/**
 * The scholarship interview, in the page, straight after the form.
 *
 * Listens for the `cpn:lead-captured` event that `forms.js` dispatches, swaps the
 * form for a conversation, and drives it against
 * `POST /api/cpn/scholarship-interview`.
 *
 * WHY A CONVERSATION AND NOT MORE FIELDS
 *
 * Ali asked for AI Flotation's model applied here: interview people about what
 * they want to build. A form asking "describe your goals (500 words)" gets either
 * a paragraph of what somebody thinks we want to hear, or nothing. A conversation
 * that reflects back what they just said gets the actual answer, and it takes them
 * about four minutes.
 *
 * WHAT THIS IS NOT
 *
 * Not an application, not a test, and not a decision. Applications are not open
 * and the selection process is not written, so nothing here is scored and the copy
 * says so before the first question. A person reads it afterwards. The interviewer
 * is instructed never to imply otherwise, and if somebody asks how they are doing
 * it tells them plainly.
 *
 * LEAVING IS ALWAYS FINE. The lead is already captured before this starts, so
 * somebody who closes the tab mid-sentence has still told us they are interested
 * and has lost nothing. That is said on screen rather than left to be guessed,
 * because an interview you cannot walk out of is an interrogation.
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-interview-api]');
  if (!script) return;

  var API = script.getAttribute('data-interview-api');
  var panel = document.getElementById('interview');
  if (!panel) return;

  var logEl = panel.querySelector('.iv-log');
  var formEl = panel.querySelector('.iv-form');
  var inputEl = panel.querySelector('.iv-input');
  var sendEl = panel.querySelector('.iv-send');
  var noteEl = panel.querySelector('.iv-note');

  var token = null;
  var turns = [];
  var busy = false;

  function bubble(role, text) {
    var row = document.createElement('div');
    row.className = 'iv-turn iv-' + role;
    var who = document.createElement('span');
    who.className = 'iv-who';
    who.textContent = role === 'user' ? 'You' : 'OpportunityLift';
    var body = document.createElement('p');
    body.textContent = text;
    row.appendChild(who);
    row.appendChild(body);
    logEl.appendChild(row);
    // `block: 'nearest'` so the page does not jump the reader to the bottom of the
    // document every time a message lands.
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function thinking(on) {
    busy = on;
    if (sendEl) sendEl.disabled = on;
    if (inputEl) inputEl.disabled = on;
    var existing = logEl.querySelector('.iv-thinking');
    if (on && !existing) {
      var el = document.createElement('div');
      el.className = 'iv-turn iv-assistant iv-thinking';
      el.innerHTML = '<span class="iv-who">OpportunityLift</span><p>Thinking...</p>';
      logEl.appendChild(el);
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (!on && existing) {
      existing.remove();
    }
  }

  function finish(message) {
    bubble('assistant', message);
    if (formEl) formEl.hidden = true;
    if (noteEl) {
      noteEl.textContent =
        'That is everything. A person here will read this. You will not get an ' +
        'automatic email, so there is nothing to wait for in your inbox.';
    }
  }

  function send(text) {
    if (busy || !token) return;
    turns.push({ role: 'user', text: text });
    bubble('user', text);
    thinking(true);

    fetch(API + '/api/cpn/scholarship-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, turns: turns }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        thinking(false);
        if (!result.ok) throw new Error('interview_unavailable');

        var message = result.body.message || '';
        turns.push({ role: 'assistant', text: message });

        if (result.body.done) finish(message);
        else {
          bubble('assistant', message);
          if (inputEl) inputEl.focus();
        }
      })
      .catch(function () {
        thinking(false);
        // The lead is already captured. Say that, rather than implying the whole
        // thing was lost - somebody who has just typed about their life should not
        // be told it went nowhere.
        bubble(
          'assistant',
          'Sorry — I cannot continue the conversation right now. Your details are ' +
            'already with us and a person will follow up, so nothing you have done ' +
            'is lost. You can email scholars@opportunitylift.org if you would rather.'
        );
        if (formEl) formEl.hidden = true;
      });
  }

  document.addEventListener('cpn:lead-captured', function (event) {
    var detail = (event && event.detail) || {};
    if (detail.entry !== 'scholarship_interest' || !detail.token) return;

    token = detail.token;

    // Reveal the conversation and take the form off screen. The intake form has
    // done its job and leaving it there invites somebody to submit twice.
    var intake = document.getElementById('scholarship-interest');
    if (intake) intake.hidden = true;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    var opening = (detail.firstMessage || '').trim();
    if (opening) {
      send(opening);
    } else {
      // No opening message means the optional field was left blank. Ask rather
      // than refuse: the interview still works, it just starts from zero.
      bubble(
        'assistant',
        'Thanks for that. To start — what would you like to be able to build or do? ' +
          'It can be small and specific.'
      );
      turns.push({
        role: 'assistant',
        text: 'What would you like to be able to build or do?',
      });
    }
    if (inputEl) inputEl.focus();
  });

  if (formEl) {
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (inputEl.value || '').trim();
      if (!text) return;
      inputEl.value = '';
      send(text);
    });
  }
})();
