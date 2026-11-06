/*
 * hire.refactored.ai - helpers shared by every page.
 *
 * Pure functions (escaping, the seeded art, the avatar, query-string state) are exported
 * for node's test runner through the UMD wrapper; the browser gets them as
 * `window.HireCommon`. No dependencies, no build step: this file is served as written.
 *
 * NEVER FABRICATES. Nothing here invents a person, a number or a case study. Every value
 * rendered comes from the API payload; a missing field renders nothing.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireCommon = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  /* FNV-1a seed into a small xorshift-style stream: the same slug always gives the same
     sequence, so the same record draws the same picture on every page and theme. */
  function rnd(seed) {
    var h = 2166136261;
    var s = String(seed);
    for (var i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function hueOf(seed) { return Math.floor(rnd(seed)() * 360); }

  var instance = 0;
  /* Deterministic "architecture" art: nodes, faint edges, and the evidence path flowing to
     a gold terminal node (MOTION.md §7). Ids are unique PER INSTANCE so many SVGs on one
     page never share a gradient; the picture itself depends only on the seed. */
  function art(seed, opts) {
    var o = opts || {};
    var n = Math.max(2, Math.min(12, o.n || 9));
    var hue = typeof o.hue === 'number' ? o.hue : hueOf(seed);
    var r = rnd(seed);
    var W = 600; var H = 300; var nodes = [];
    for (var i = 0; i < n; i += 1) {
      nodes.push([Math.round(40 + (i / (n - 1)) * (W - 80) + (r() - 0.5) * 40), Math.round(40 + r() * (H - 80))]);
    }
    instance += 1;
    var uid = 'a' + hueOf(seed + ':id') + '-' + instance;
    var c1 = 'hsl(' + hue + ' 70% 58%)';
    var c2 = 'hsl(' + ((hue + 40) % 360) + ' 75% 62%)';
    var gold = '#F2C14E';
    var edges = '';
    for (var a = 0; a < n; a += 1) {
      for (var b = a + 1; b < Math.min(n, a + 3); b += 1) {
        var p = nodes[a]; var q = nodes[b]; var mx = (p[0] + q[0]) / 2;
        edges += '<path d="M' + p[0] + ' ' + p[1] + ' C ' + mx + ' ' + p[1] + ', ' + mx + ' ' + q[1] + ', ' + q[0] + ' ' + q[1] + '" stroke="' + c1 + '" stroke-opacity=".28" fill="none"/>';
      }
    }
    var d = 'M' + nodes[0][0] + ' ' + nodes[0][1];
    for (var k = 1; k < n; k += 1) {
      var u = nodes[k - 1]; var v = nodes[k]; var m = (u[0] + v[0]) / 2;
      d += ' C ' + m + ' ' + u[1] + ', ' + m + ' ' + v[1] + ', ' + v[0] + ' ' + v[1];
    }
    var path = '<path class="evidence" d="' + d + '" stroke="url(#g' + uid + ')" stroke-width="2.5" fill="none" stroke-dasharray="6 8">'
      + '<animate attributeName="stroke-dashoffset" from="140" to="0" dur="4s" repeatCount="indefinite"/></path>';
    var dots = nodes.map(function (pt, idx) {
      var last = idx === n - 1;
      return '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="' + (last ? 9 : 5) + '" fill="' + (last ? gold : c2) + '"' + (last ? '' : ' fill-opacity=".9"') + '/>'
        + (last ? '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="18" fill="' + gold + '" fill-opacity=".18"/>' : '');
    }).join('');
    return '<svg class="hire-art" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
      + '<defs><linearGradient id="bg' + uid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + hue + ' 45% 14%)"/><stop offset="1" stop-color="hsl(' + ((hue + 30) % 360) + ' 50% 9%)"/></linearGradient>'
      + '<linearGradient id="g' + uid + '" x1="0" x2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + gold + '"/></linearGradient>'
      + '<pattern id="p' + uid + '" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#fff" stroke-opacity=".05"/></pattern></defs>'
      + '<rect width="' + W + '" height="' + H + '" fill="url(#bg' + uid + ')"/><rect width="' + W + '" height="' + H + '" fill="url(#p' + uid + ')"/>'
      + edges + path + dots + '</svg>';
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }

  /* Only http(s) and data:image URLs are rendered as an <img>; anything else falls back to
     initials rather than being trusted into a src attribute. */
  function safeImageUrl(url) {
    var s = String(url || '');
    return /^https?:\/\//i.test(s) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s) ? s : '';
  }

  /* The avatar: photo or initials on a slug-derived gradient; gold ring + star when listed. */
  function avatar(person, size, ring) {
    var withRing = ring !== false;
    var h = hueOf(person.slug || person.name || '');
    var img = safeImageUrl(person.avatarUrl);
    return '<span class="ava-wrap" style="width:' + size + 'px;height:' + size + 'px">'
      + '<span class="ava" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.36) + 'px;--g:linear-gradient(135deg,hsl(' + h + ' 55% 42%),hsl(' + ((h + 50) % 360) + ' 60% 30%))">'
      + (withRing ? '<span class="ring"></span><span class="inner"></span>' : '')
      + (img ? '<img src="' + esc(img) + '" alt="' + esc(person.name) + '">' : '<span aria-hidden="true">' + esc(initials(person.name)) + '</span>')
      + (withRing ? '<span class="badge" title="Case-study verified" aria-hidden="true">★</span>' : '')
      + '</span></span>';
  }

  var ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  function plural(n, one, many) { return n === 1 ? one : many; }

  /* GET JSON with a hard timeout. Resolves to { ok, status, body } and NEVER throws, so a
     caller can always fall back to the honest state already in the page. */
  function fetchJson(url, timeoutMs) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 10000) : null;
    return fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        return res.json().catch(function () { return null; })
          .then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
      })
      .catch(function () { return { ok: false, status: 0, body: null }; })
      .then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  function reducedMotion(win) {
    try { return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  /* Shortlist: a per-viewer convenience in localStorage, never a server write. */
  var SHORT_KEY = 'hr-short';
  function readShortlist(storage) {
    try { var v = JSON.parse(storage.getItem(SHORT_KEY) || '[]'); return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : []; } catch (e) { return []; }
  }
  function writeShortlist(storage, slugs) {
    try { storage.setItem(SHORT_KEY, JSON.stringify(slugs)); return true; } catch (e) { return false; }
  }
  function toggleShortlist(list, slug) {
    return list.indexOf(slug) >= 0 ? list.filter(function (s) { return s !== slug; }) : list.concat([slug]);
  }

  function track(win, event, props) {
    try { if (win && typeof win.rfxTrack === 'function') win.rfxTrack(event, props || {}); } catch (e) { /* tracking never breaks the page */ }
  }

  return {
    esc: esc, rnd: rnd, hueOf: hueOf, art: art, initials: initials, safeImageUrl: safeImageUrl,
    avatar: avatar, ARROW: ARROW, plural: plural, fetchJson: fetchJson, reducedMotion: reducedMotion,
    readShortlist: readShortlist, writeShortlist: writeShortlist, toggleShortlist: toggleShortlist,
    track: track, SHORT_KEY: SHORT_KEY,
  };
}));
