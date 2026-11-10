/*
 * Colaberry hosted-landing-page Open House filler (OH-3).
 *
 * Fills `{{open_house_*}}` tokens in a hosted landing page's copy with the REAL
 * next Open House, read from GET /api/v1/open-house/event.
 *
 * WHY A SCRIPT AND NOT STORED TEXT. A hosted `/lp/` page is rendered by a pure
 * synchronous function from stored, escaped operator copy. The only
 * server-computed value in its body is the copyright year. So a date written
 * into the copy is a date somebody has to remember to rewrite — and the one that
 * was there on 2026-11-10 was for an event in July. A page that advertises a
 * date nobody is keeping current is worse than one that gives no date at all.
 *
 * WHY A FILE AND NOT INLINE. Same reason as snackbar.js: the landing-page CSP is
 * `script-src 'self'` with no inline script, deliberately, because operator copy
 * is rendered on that page. A same-origin file is the only way in that does not
 * weaken that policy.
 *
 * THE SERVER DECIDES WHAT IS SAID. Every value written here is a finished string
 * the endpoint already composed (`date_label`, `time_label`, `format_label`) or a
 * single integer (`seats_remaining`). This script does no date arithmetic and
 * owns no timezone: getting Central right is the backend's job, and the reason
 * OH-1 exists is that two services had each tried to own it separately. Nothing
 * is written with innerHTML — only `nodeValue` on an existing text node — so
 * neither a hostile response nor a bug here can turn copy into markup.
 *
 * NO EVENT, NO TEXT. If the fetch fails, times out, or the endpoint says no
 * event is announced, every token is replaced with the empty string and any
 * element it emptied is removed. A visitor must never see `{{open_house_when}}`,
 * and must never see an invented date. An Open House page with no date still
 * reads correctly ("Sign up for our Open House"); one showing a wrong date does
 * not. Same doctrine as snackbar.js's "no feed, no bar".
 *
 * NO TOKENS, NO REQUEST. The renderer emits this tag on every hosted page, like
 * welcome-back.js, so no operator has to remember to switch it on. A page whose
 * copy carries no token returns before issuing the fetch, so pages that do not
 * mention the Open House pay nothing for it.
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/v1/open-house/event';
  var FETCH_TIMEOUT_MS = 5000;
  /* Defensive cap on anything the server sends us before it reaches the page. */
  var MAX_LABEL = 120;

  /**
   * The tokens an operator may type into landing-page copy, and what each one
   * becomes. Deliberately a fixed table rather than "any field of the response":
   * the set of things this may write onto a public page is a decision, not a
   * consequence of whatever shape the endpoint grows next.
   */
  var FILLERS = {
    open_house_when: function (ev) {
      var d = label(ev.date_label);
      var t = label(ev.time_label);
      if (d && t) return d + ' · ' + t;
      return d || t;
    },
    open_house_date: function (ev) { return label(ev.date_label); },
    open_house_time: function (ev) { return label(ev.time_label); },
    open_house_format: function (ev) { return label(ev.format_label); },
    open_house_seats: function (ev) {
      var n = ev.seats_remaining;
      /* 0, null and a capacity-less event all mean "do not claim a number". */
      if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '';
      return n === 1 ? '1 seat left' : n + ' seats left';
    }
  };

  /* Built fresh on every use: a shared /g/ regex carries lastIndex between calls,
   * which makes `test` and `replace` interfere in ways that read as "sometimes it
   * skips one". */
  function tokenRe() {
    return /\{\{\s*(open_house_[a-z_]{1,32})\s*\}\}/g;
  }

  function label(value) {
    if (typeof value !== 'string') return '';
    var s = value.trim();
    return s && s.length <= MAX_LABEL ? s : '';
  }

  /** Every text node holding at least one token. */
  function tokenNodes() {
    if (!document.body || !document.createTreeWalker) return [];
    var found = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node = walker.nextNode();
    while (node) {
      var text = node.nodeValue;
      if (text && text.indexOf('{{') !== -1 && tokenRe().test(text)) found.push(node);
      node = walker.nextNode();
    }
    return found;
  }

  /**
   * Remove a wrapper this fill emptied, and any wrapper that emptying it emptied
   * in turn — so "Thu, Nov 19 · 6:30 PM CT" on its own line leaves no blank gap
   * when there is no event.
   *
   * Stops at anything that still shows something: text elsewhere in the element,
   * or an image, control or link that was never ours to remove. Never climbs past
   * <main>, so a page cannot delete its own body.
   */
  function pruneEmptied(node) {
    var el = node.parentElement;
    while (el && el !== document.body && el.tagName !== 'MAIN' && el !== document.documentElement) {
      if (el.textContent.trim() !== '') return;
      if (el.querySelector('img,svg,video,iframe,input,button,a,picture')) return;
      var parent = el.parentElement;
      el.parentNode.removeChild(el);
      el = parent;
    }
  }

  /** `ev` null means "no event known": every token is removed rather than left showing. */
  function fill(nodes, ev) {
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var before = node.nodeValue;
      var after = before.replace(tokenRe(), function (_match, name) {
        var filler = FILLERS[name];
        /* An unknown open_house_* token is a typo in the copy. Removed, never shown. */
        if (!filler || !ev) return '';
        try {
          return filler(ev) || '';
        } catch (e) {
          return '';
        }
      });
      if (after === before) continue;
      /* Text, not markup. This is the whole XSS argument for this script. */
      node.nodeValue = after;
      pruneEmptied(node);
    }
  }

  /** Resolves to the event, or to null. Never rejects: a failed fetch is "no event". */
  function loadEvent() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    var controller = null;
    var timer = null;
    try {
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
      }
    } catch (e) {
      controller = null;
    }
    var options = { credentials: 'omit' };
    if (controller) options.signal = controller.signal;

    return fetch(ENDPOINT, options)
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (data) {
        /* `announced` is the endpoint's own "there is a next one" flag. Anything
         * else — a 404 shape, an error body, a future field rename — is no event. */
        if (!data || data.announced !== true) return null;
        return data;
      })
      .catch(function () { return null; })
      .then(function (ev) {
        if (timer) clearTimeout(timer);
        return ev;
      });
  }

  function run() {
    var nodes = tokenNodes();
    if (!nodes.length) return;
    loadEvent().then(function (ev) { fill(nodes, ev); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}());
