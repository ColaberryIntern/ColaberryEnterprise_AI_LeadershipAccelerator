/*!
 * Colaberry Visitor Tracker — standalone v1
 * Drop-in script for any external Colaberry-owned site.
 *
 * Install:
 *   <script src="https://enterprise.colaberry.ai/v1/track.js" data-site="<slug>" defer></script>
 *
 * `data-site` must match the lead_sources.slug for the originating site
 * (e.g. "trust-before-intelligence", "world-of-taxonomy", "colaberry",
 * "ai-workforce-designer").
 *
 * Sends events to enterprise.colaberry.ai /api/t/{event,batch}. No external
 * deps. Honors navigator.doNotTrack. Skips /admin paths. No PII captured
 * unless the page surfaces an email in the ?email= query string.
 */
(function () {
  'use strict';

  // ---- Config: pull data-site off our own script tag --------------------
  var ENDPOINT = 'https://enterprise.colaberry.ai';
  var scriptTag = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i].src || '';
      if (s.indexOf('/v1/track.js') !== -1) return scripts[i];
    }
    return null;
  })();
  var SITE_SLUG = scriptTag ? scriptTag.getAttribute('data-site') || '' : '';

  if (!SITE_SLUG) {
    // Surface a clear console error so the operator's Claude Code can paste it back.
    if (window && window.console) {
      console.error(
        '[colaberry-track] FATAL: missing data-site attribute on the <script> tag. ' +
          'Add data-site="<slug>" matching the lead_sources.slug for this site. ' +
          'Example: <script src="https://enterprise.colaberry.ai/v1/track.js" ' +
          'data-site="trust-before-intelligence" defer></script>',
      );
    }
    return;
  }

  // ---- State ------------------------------------------------------------
  var FP_KEY = 'cb_visitor_fp';
  var LEAD_KEY = 'cb_lead_id';
  var initialized = false;
  var buffer = [];
  var visibleStart = Date.now();
  var totalVisibleMs = 0;
  var firedThresholds = {};
  var lastScrollTime = 0;

  // ---- Fingerprint ------------------------------------------------------
  function djb2(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    var hex = h.toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }
  function fingerprint() {
    var raw =
      navigator.userAgent +
      screen.width +
      screen.height +
      (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') +
      (navigator.language || '');
    return (djb2(raw) + djb2(raw + 'x') + djb2(raw + 'y') + djb2(raw + 'z')).slice(0, 64);
  }
  function ensureFingerprint() {
    var fp = null;
    try { fp = localStorage.getItem(FP_KEY); } catch (e) {}
    if (!fp) {
      fp = fingerprint();
      try { localStorage.setItem(FP_KEY, fp); } catch (e) {}
    }
    return fp;
  }

  // ---- Browser info -----------------------------------------------------
  function deviceType() {
    var w = screen.width;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }
  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Chrome/i.test(ua)) return 'Chrome';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Safari/i.test(ua)) return 'Safari';
    return 'Other';
  }
  function detectOS() {
    var ua = navigator.userAgent;
    if (/Windows/i.test(ua)) return 'Windows';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Android/i.test(ua)) return 'Android';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Other';
  }
  function browserInfo() {
    return {
      user_agent: navigator.userAgent,
      device_type: deviceType(),
      browser: detectBrowser(),
      os: detectOS(),
    };
  }

  // ---- UTM + identity helpers ------------------------------------------
  function getParam(name) {
    try {
      var sp = new URLSearchParams(location.search);
      return sp.get(name);
    } catch (e) {
      return null;
    }
  }
  function getEmail() {
    var e = getParam('email');
    if (e && e.indexOf('@') !== -1) return e;
    return undefined;
  }
  function getLeadId() {
    try {
      return localStorage.getItem(LEAD_KEY) || localStorage.getItem('cb_lid') || undefined;
    } catch (err) {
      return undefined;
    }
  }

  function push(event_type, props) {
    props = props || {};
    buffer.push(
      Object.assign(
        {
          event_type: event_type,
          timestamp: new Date().toISOString(),
          page_url: location.href,
          page_path: location.pathname,
        },
        props,
      ),
    );
  }

  // ---- Flush ------------------------------------------------------------
  function flush(useBeacon) {
    if (!buffer.length) return;
    var fp = ensureFingerprint();
    var info = browserInfo();
    var events = buffer.splice(0);
    var email = getEmail();
    var lead_id = getLeadId();
    var utm_source = getParam('utm_source') || undefined;
    var utm_campaign = getParam('utm_campaign') || undefined;
    var utm_medium = getParam('utm_medium') || undefined;
    var referrer_url = document.referrer || undefined;

    var common = {
      fingerprint: fp,
      site_slug: SITE_SLUG,
      user_agent: info.user_agent,
      device_type: info.device_type,
      browser: info.browser,
      os: info.os,
      utm_source: utm_source,
      utm_campaign: utm_campaign,
      utm_medium: utm_medium,
      referrer_url: referrer_url,
      email: email,
      lid: lead_id,
    };

    if (useBeacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(
          ENDPOINT + '/api/t/batch',
          new Blob([JSON.stringify(Object.assign({}, common, { events: events }))], {
            type: 'application/json',
          }),
        );
      } catch (e) {}
      return;
    }

    var url = events.length === 1 ? ENDPOINT + '/api/t/event' : ENDPOINT + '/api/t/batch';
    var body =
      events.length === 1
        ? Object.assign({}, common, events[0])
        : Object.assign({}, common, { events: events });

    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
      }).catch(function (err) {
        // Surface failures so an operator/Claude can paste them back verbatim.
        if (window && window.console) {
          console.warn('[colaberry-track] flush failed:', err && err.message);
        }
      });
    } catch (e) {
      if (window && window.console) {
        console.warn('[colaberry-track] flush threw:', e && e.message);
      }
    }
  }

  // ---- Scroll tracking --------------------------------------------------
  function onScroll() {
    var now = Date.now();
    if (now - lastScrollTime < 500) return;
    lastScrollTime = now;
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    if (scrollable <= 0) return;
    var pct = Math.round((window.scrollY / scrollable) * 100);
    var thresholds = [25, 50, 75, 90, 100];
    for (var i = 0; i < thresholds.length; i++) {
      var t = thresholds[i];
      if (pct >= t && !firedThresholds[t]) {
        firedThresholds[t] = true;
        push('scroll', { depth: t, url: location.href });
      }
    }
  }

  // ---- Click tracking ---------------------------------------------------
  function onClick(e) {
    var target = e.target;
    if (!target) return;
    var ctaSelectors =
      '.btn-primary, .btn-secondary, .btn-outline-primary, .cta, [data-track-cta], [data-track]';
    var interactiveSelectors = 'a[href], button, [role="button"]';
    var el = target;
    for (var i = 0; i < 4 && el; i++) {
      if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || (el.closest && el.closest('video, audio, [data-track="media"]'))) {
        push('media_play', {
          element_tag: (el.tagName || '').toLowerCase(),
          element_text:
            el.getAttribute('title') ||
            el.getAttribute('aria-label') ||
            (el.closest && el.closest('[data-track-label]') ? el.closest('[data-track-label]').getAttribute('data-track-label') : '') ||
            'media',
          url: el.src || el.currentSrc || location.href,
        });
        return;
      }
      if (el.tagName === 'IFRAME' || (el.closest && el.closest('iframe'))) {
        push('embed_click', {
          element_text: el.getAttribute('title') || 'embedded content',
          src: el.src || '',
        });
        return;
      }
      if (el.matches && el.matches(ctaSelectors)) {
        push('cta_click', {
          element_text: (el.textContent || '').trim().slice(0, 120),
          href: el.href || (el.closest && el.closest('a') ? el.closest('a').href : null),
          data_track: el.getAttribute('data-track') || el.getAttribute('data-track-cta') || null,
          is_cta: true,
        });
        return;
      }
      if (el.matches && el.matches(interactiveSelectors)) {
        push('click', {
          element_text: (el.textContent || '').trim().slice(0, 120),
          element_tag: (el.tagName || '').toLowerCase(),
          href: el.href || null,
          data_track: el.getAttribute('data-track') || null,
        });
        return;
      }
      el = el.parentElement;
    }
  }

  // ---- Visibility + heartbeat ------------------------------------------
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      totalVisibleMs += Date.now() - visibleStart;
      push('time_on_page', {
        seconds: Math.round(totalVisibleMs / 1000),
        url: location.href,
      });
      flush(true);
    } else {
      visibleStart = Date.now();
    }
  }
  function heartbeat() {
    if (document.visibilityState === 'visible') push('heartbeat', { url: location.href });
  }

  function shouldTrack() {
    if (typeof window === 'undefined') return false;
    if (navigator.doNotTrack === '1') return false;
    if (location.pathname.indexOf('/admin') === 0) return false;
    return true;
  }

  function init() {
    if (initialized || !shouldTrack()) return;
    initialized = true;
    ensureFingerprint();

    push('pageview', {
      url: location.href,
      path: location.pathname,
      title: document.title,
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', function () { flush(true); });

    setInterval(function () { flush(false); }, 5000);
    setInterval(heartbeat, 60000);
  }

  // Expose a minimal global so SPAs can call trackEvent() / re-init after route changes.
  window.ColaberryTrack = {
    version: '1.0.0',
    site: SITE_SLUG,
    trackEvent: function (eventType, props) {
      if (!shouldTrack()) return;
      push(eventType, props || {});
    },
    flush: function () { flush(false); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
