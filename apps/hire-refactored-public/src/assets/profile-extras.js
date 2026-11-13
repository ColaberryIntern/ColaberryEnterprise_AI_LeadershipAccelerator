/*
 * hire.refactored.ai - the two profile pieces the candidate writes for themselves
 * (profile upgrade, docs/hire-refactored/profile-upgrade-demo/PROMPT.md §1.4 and §1.5):
 *
 *   inTheirWords(intro, api)       "In their words": intro video, up to 3 answers, Looking for.
 *   bookCard(booking, slug, tz)    "Book an interview": the next 3 open times, See all times.
 *
 * Pure markup from `hire.intro` / `hire.booking`, exported for node's test runner. EACH PIECE
 * COLLAPSES WHEN ITS DATA IS ABSENT: no video means no video box, no answers no Q&A, nothing at
 * all means no card; booking off or no open time means no booking card, and the page keeps
 * today's Request intro. Times show in the VIEWER's zone (kit non-negotiable); the API sends UTC.
 */
(function (root, factory) {
  var common = typeof module === 'object' && module.exports ? require('./common.js') : root.HireCommon;
  var api = factory(common);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireProfileExtras = api;
}(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  var esc = C.esc;
  var arr = function (v) { return Array.isArray(v) ? v : []; };

  var ZONES = {
    'America/New_York': 'Eastern (ET)', 'America/Chicago': 'Central (CT)', 'America/Denver': 'Mountain (MT)',
    'America/Phoenix': 'Arizona (MST)', 'America/Los_Angeles': 'Pacific (PT)', 'America/Anchorage': 'Alaska (AKT)',
    'Pacific/Honolulu': 'Hawaii (HT)', 'UTC': 'UTC',
  };

  function isZone(tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length > 0; } catch (e) { return false; }
  }
  /* The viewer's zone, or Central when the browser will not say (the kit's prose default). */
  function viewerZone() {
    try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone; return isZone(z) ? z : 'America/Chicago'; } catch (e) { return 'America/Chicago'; }
  }
  function zoneName(tz) { return ZONES[tz] || String(tz || '').replace(/_/g, ' '); }

  /* An ISO instant as the viewer reads it: { date: "Mon, Nov 16", time: "9:00 AM", day: "2026-11-16" }. */
  function slotParts(iso, tz) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return {
      date: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d),
      time: new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d),
      day: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    };
  }

  var SETUP = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };

  function startLabel(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return 'Can start ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  function video(v, api) {
    var src = v && C.mediaUrl(api, v.streamUrl);
    if (!src) return '';
    var poster = C.mediaUrl(api, v.posterUrl);
    var captions = C.mediaUrl(api, v.captionsUrl);
    var len = C.duration(v.seconds);
    return '<div class="video-box"><video controls playsinline preload="none"' + (poster ? ' poster="' + esc(poster) + '"' : '')
      + ' aria-label="Intro video' + (len ? ', ' + esc(len) : '') + '"><source src="' + esc(src) + '">'
      + (captions ? '<track kind="captions" src="' + esc(captions) + '" srclang="en" label="English" default>' : '')
      + '</video>' + (len ? '<span class="len">Intro · ' + esc(len) + '</span>' : '') + '</div>';
  }

  function inTheirWords(intro, api) {
    if (!intro || typeof intro !== 'object') return '';
    var vid = video(intro.video, api);
    var qa = arr(intro.answers).filter(function (a) { return a && a.question && a.text; }).slice(0, 3);
    var chips = arr(intro.roles).filter(Boolean).map(function (r) { return String(r); })
      .concat(arr(intro.setups).map(function (s) { return SETUP[s] || ''; }).filter(Boolean))
      .concat(startLabel(intro.earliestStart) ? [startLabel(intro.earliestStart)] : []);
    if (!vid && !qa.length && !chips.length) return '';
    var right = (qa.length ? '<div class="qa">' + qa.map(function (a) {
      return '<div><b>' + esc(a.question) + '</b><p>' + esc(a.text) + '</p></div>';
    }).join('') + '</div>' : '')
      + (chips.length ? '<div class="looking"><div class="legend">Looking for</div><div class="look-chips">'
        + chips.map(function (c) { return '<span class="look-chip">' + esc(c) + '</span>'; }).join('') + '</div></div>' : '');
    return '<div class="card"><div class="label">In their words <span class="src">written by the candidate</span></div>'
      + '<div class="words' + (vid ? '' : ' one') + '">' + vid + (right ? '<div>' + right + '</div>' : '') + '</div></div>';
  }

  function scheduleHref(slug, iso) {
    return '/talent/' + encodeURIComponent(slug) + '/schedule/' + (iso ? '?slot=' + encodeURIComponent(iso) : '');
  }

  /* Bookable = opted in AND at least one open time; anything else keeps Request intro. */
  function bookable(booking) {
    return !!(booking && booking.enabled === true && arr(booking.nextSlots).length);
  }

  function bookCard(booking, slug, tz) {
    if (!bookable(booking)) return '';
    var rows = arr(booking.nextSlots).slice(0, 3).map(function (iso) {
      var p = slotParts(iso, tz);
      return p ? '<a class="slot-link" href="' + esc(scheduleHref(slug, iso)) + '" data-book="' + esc(slug) + '"><span>' + esc(p.date) + '</span><b>' + esc(p.time) + '</b></a>' : '';
    }).join('');
    return '<div class="card book"><div class="label">Book an interview</div>'
      + '<p class="muted" style="font-size:.86rem;margin:8px 0 4px">Next open times in your time zone (' + esc(zoneName(tz)) + '). Held in Refactored, with the Colaberry team copied.</p>'
      + rows
      + '<a class="btn btn-primary btn-block" style="margin-top:14px" href="' + esc(scheduleHref(slug)) + '" data-book="' + esc(slug) + '">See all times</a>'
      + '<a class="btn btn-text btn-block" href="/intro/?talent=' + encodeURIComponent(slug) + '" data-intro="' + esc(slug) + '">Or request an intro</a></div>';
  }

  return {
    viewerZone: viewerZone, isZone: isZone, zoneName: zoneName, slotParts: slotParts, startLabel: startLabel,
    inTheirWords: inTheirWords, bookable: bookable, bookCard: bookCard, scheduleHref: scheduleHref,
  };
}));
