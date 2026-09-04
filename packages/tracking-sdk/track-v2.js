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

  // Do Not Track, honoured the same way the platform tracker honours it. The brand
  // sites did not check this before, which meant one ecosystem answered the header on
  // some pages and ignored it on others. Consistency here is the whole point of a
  // shared SDK.
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

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

  // --- engagement depth -----------------------------------------------------------
  //
  // Until this existed, a brand site could not produce four of the twenty signals the
  // scorer defines: deep_scroll_program (25), deep_scroll_pricing (30),
  // deep_scroll_case_study (20) and extended_time_on_page (15). Not "produced them
  // rarely" — could not produce them at all, because the events they are derived from
  // were never emitted here.

  var SCROLL_THRESHOLDS = [25, 50, 75, 90, 100];
  var firedThresholds = {};

  function onScroll() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    // A page shorter than the viewport cannot be scrolled, and reporting 100% for it
    // would turn every bounce on a short page into a deep-engagement signal.
    if (scrollable <= 0) return;

    var pct = Math.round((window.pageYOffset / scrollable) * 100);
    for (var i = 0; i < SCROLL_THRESHOLDS.length; i++) {
      var t = SCROLL_THRESHOLDS[i];
      if (pct >= t && !firedThresholds[t]) {
        firedThresholds[t] = true;
        // TWO KEYS FOR ONE NUMBER, deliberately. Two server consumers read this payload
        // under different names, and neither can change without breaking the other's
        // historical rows:
        //   journeyTimelineService   reads event_data.depth          (timeline label)
        //   behavioralSignalService  reads event_data.depth_percent  (the >= 75 test
        //     behind the three deep_scroll_* signals)
        // The platform tracker learned this the hard way: it emitted `depth` alone, so
        // the timeline label worked and the lead signals stayed dead, and the mismatch
        // was invisible because both reads simply returned undefined.
        track('scroll', { depth: t, depth_percent: t });
      }
    }
  }

  // --- time on page ---------------------------------------------------------------
  //
  // Accumulated VISIBLE time, not wall-clock since load. A tab left open in the
  // background for an hour is not three minutes of reading, and counting it as such
  // would make extended_time_on_page (strength 15) mean nothing.
  var visibleStart = Date.now();
  var totalVisibleMs = 0;
  var timeReported = false;

  function reportTimeOnPage() {
    if (document.visibilityState === 'visible') {
      totalVisibleMs += Date.now() - visibleStart;
      visibleStart = Date.now();
    }
    var seconds = Math.round(totalVisibleMs / 1000);
    // Nothing to say about a page that was never actually looked at.
    if (seconds < 1) return;
    // `seconds` is the key behavioralSignalService reads for the >= 180 test. Sending
    // this under any other name is the same class of mistake as `depth` vs
    // `depth_percent`, and would fail just as silently.
    track('time_on_page', { seconds: seconds });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      reportTimeOnPage();
      timeReported = true;
    } else {
      visibleStart = Date.now();
      // A returning reader keeps accumulating, so a later report supersedes the earlier
      // one rather than being suppressed by it.
      timeReported = false;
    }
  });

  // `pagehide` rather than `beforeunload`: mobile Safari and bfcache-restoring browsers
  // frequently skip `beforeunload` entirely, which is exactly where short sessions get
  // lost. The flag stops a hide-then-unload sequence reporting the same page twice.
  window.addEventListener('pagehide', function () {
    if (!timeReported) reportTimeOnPage();
  });

  // DELIBERATELY NOT EMITTED: `heartbeat`. The server accepts the type, but nothing
  // consumes it — `recordPageEvent` does not touch the session row, and the only code
  // that updates `duration_seconds` is `updateHeartbeat`, reachable solely through
  // POST /api/t/heartbeat, which no client in this repository calls. Emitting a
  // heartbeat every 30 seconds would add a row per visitor per half-minute and change
  // no score. If session duration is fixed later, this is the place to add it.
  document.addEventListener('scroll', onScroll, { passive: true });

  // Public surface, so an app can record a submit it handled itself.
  window.rfxTrack = track;
})();
