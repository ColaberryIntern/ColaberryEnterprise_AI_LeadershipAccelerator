/* eslint-disable */
/**
 * Refactored.ai tracking SDK, v2.
 *
 * Extraction-ready successor to frontend/public/v1/track.js. v1 is NOT removed and is
 * NOT modified — live external sites depend on it, and the migration plan is explicit
 * that there is no flag day.
 *
 * What changed from v1, and why:
 *
 *  1. TENANT IS NEVER CLAIMED BY THE BROWSER. The script sends `site_slug` (the value of
 *     data-site) and the server resolves it through lead_sources to a tenant and brand.
 *     There is no field in this payload that a hostile page could set to write into
 *     another tenant's data.
 *
 *  2. IDENTITY TRAVELS AS A SIGNED OPAQUE TOKEN. v1 accepts `?email=` in the URL, which
 *     puts PII into browser history, referrer headers and every analytics tool on the
 *     page, and lets anyone who knows an address bind their browser to that person's
 *     journey. v2 reads `?jx=` — an HMAC-signed token containing identifiers only — and
 *     hands it to the server to verify. It does not read `email` at all.
 *
 *  3. FAIL-SOFT AND NON-BLOCKING. Every send is fire-and-forget with keepalive. A
 *     tracking outage must never degrade the host page.
 *
 * Usage:
 *   <script src="https://track.refactored.ai/v2/track.js" data-site="cpn" defer></script>
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var siteSlug = script.getAttribute('data-site') || '';
  var apiBase = script.getAttribute('data-api') || inferApiBase(script.src);
  if (!siteSlug) return;

  function inferApiBase(src) {
    try {
      return new URL(src).origin;
    } catch (e) {
      return '';
    }
  }

  // --- anonymous browser identity -----------------------------------------------
  var FINGERPRINT_KEY = 'rfx_fp';

  function getFingerprint() {
    try {
      var existing = localStorage.getItem(FINGERPRINT_KEY);
      if (existing) return existing;
      var minted = randomId();
      localStorage.setItem(FINGERPRINT_KEY, minted);
      return minted;
    } catch (e) {
      // Private browsing or blocked storage: fall back to a per-page id so the visit is
      // still recorded. A session that cannot be stitched is better than no data.
      return randomId();
    }
  }

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'fp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // --- request context ------------------------------------------------------------
  function queryParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name);
    } catch (e) {
      return null;
    }
  }

  function basePayload() {
    return {
      fingerprint: getFingerprint(),
      site_slug: siteSlug,
      page_url: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
      referrer_url: document.referrer || undefined,
      utm_source: queryParam('utm_source') || undefined,
      utm_campaign: queryParam('utm_campaign') || undefined,
      utm_medium: queryParam('utm_medium') || undefined,
      campaign_id: queryParam('cid') || undefined,
      // Signed journey token. Identifiers only — no email, ever.
      jx: queryParam('jx') || undefined,
    };
  }

  function send(path, payload) {
    try {
      var body = JSON.stringify(payload);
      // keepalive so an event fired during navigation still leaves the browser.
      fetch(apiBase + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit',
      }).catch(function () {});
    } catch (e) {
      /* never surface a tracking failure to the host page */
    }
  }

  function track(eventType, eventData) {
    var payload = basePayload();
    payload.event_type = eventType;
    if (eventData) payload.event_data = eventData;
    send('/api/t/event', payload);
  }

  // --- automatic instrumentation --------------------------------------------------
  track('pageview');

  // If the visitor arrived through a signed cross-domain link, hand the token to the
  // server to verify and associate. The browser never inspects or trusts it.
  var jx = queryParam('jx');
  if (jx) {
    var identifyPayload = basePayload();
    identifyPayload.jx = jx;
    send('/api/t/identify', identifyPayload);
  }

  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var cta = target.closest('[data-cta]');
      if (cta) track('cta_click', { cta: cta.getAttribute('data-cta') });
    },
    { passive: true, capture: true },
  );

  document.addEventListener(
    'focusin',
    function (event) {
      var form = event.target && event.target.form;
      if (!form || form.__rfxStarted) return;
      form.__rfxStarted = true;
      track('form_start', { form: form.getAttribute('data-form') || form.name || 'unnamed' });
    },
    { passive: true, capture: true },
  );

  // Public surface, so an app can record a submit it handled itself.
  window.rfxTrack = track;
})();
