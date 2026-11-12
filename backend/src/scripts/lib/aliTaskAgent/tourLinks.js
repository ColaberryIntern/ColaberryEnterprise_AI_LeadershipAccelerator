/**
 * tourLinks - the two kinds of link the Morning Five email carries to its hosted companion page
 * (frontend/public/bt-k7q2xm4p/index.html):
 *
 *   copy link   ?c=<data>  opens one item and puts its Claude Code prompt on the clipboard
 *   tour link   ?t=<data>  the guided tour: all ten items, one stop at a time
 *
 * WHY A PAGE: an email cannot run script, so a button in an email cannot write to the clipboard.
 * One click to a page that copies is the closest thing that works in every mail client.
 *
 * WHERE THE DATA LIVES: in the QUERY STRING, raw-deflated and base64url-encoded. It used to be
 * the fragment (after "#"), which never reaches the server, but Gmail opens links through its
 * own redirect and that drops the fragment: Ali's first click on 2026-11-12 landed on the bare
 * page. A query string survives every redirect. The page is still static, nothing is stored and
 * there is no endpoint; the only trace is the web server's access log line for the request.
 * The content is exactly what the email already holds.
 *
 * SIZE: production nginx answers 414 to a request line over ~8K (probed 2026-11-12: 7,900
 * chars OK, 9,000 refused). Every link is held under MAX_URL by clipping the prompt texts
 * evenly; each prompt starts with its /ata-work-task or /ata-list command, which is enough for
 * a session to fetch the rest from Basecamp, so a clipped tail loses nothing that matters. The page decodes it with the browser's
 * DecompressionStream('deflate-raw') (Chrome/Edge 103+, Safari 16.4+, Firefox 113+).
 *
 * Mandrill click tracking is turned off on these links in the renderer (mc:disable-tracking), so
 * the tracker cannot rewrite or truncate them (see the "(" defect it has on long URLs).
 *
 * Pure: (data) -> string.
 */

const zlib = require('zlib');

const DEFAULT_BASE = 'https://enterprise.colaberry.ai/bt-k7q2xm4p/';

/** The companion page's address; overridable by env so a preview stack can point elsewhere. */
function tourBase() {
  return process.env.MORNING_FIVE_TOUR_BASE || DEFAULT_BASE;
}

function encode(obj) {
  return zlib.deflateRawSync(Buffer.from(JSON.stringify(obj), 'utf8'), { level: 9 }).toString('base64url');
}

function decode(s) {
  return JSON.parse(zlib.inflateRawSync(Buffer.from(s, 'base64url')).toString('utf8'));
}

/** The compact shape the page reads. Short keys keep the links short. */
function pack(item) {
  return {
    n: item.rank, k: item.kind, g: item.golden ? 1 : 0, t: item.title, p: item.path, u: item.url,
    w: item.when, s: item.score, x: item.tag, f: item.facts, r: item.reasons.map((r) => [r.pts, r.why]),
    c: item.copyText,
  };
}

const MAX_URL = 7600;
const MIN_CLIP = 160;
const CLIP_NOTE = '\n\n[Shortened to fit the link. Read the full ticket in Basecamp.]';

function clip(text, n) {
  const t = String(text || '');
  return t.length <= n ? t : t.slice(0, n).trimEnd() + CLIP_NOTE;
}

/**
 * base + "?<key>=" + encoded payload, clipping every prompt to a shrinking cap until the whole
 * URL fits MAX_URL. Deterministic: same items, same link. If even MIN_CLIP will not fit, the
 * smallest link is returned and the caller's size log shows it.
 */
function fitted(base, key, build, packed) {
  const url = (cap) => `${base}?${key}=${encode(build(cap == null ? packed : packed.map((p) => ({ ...p, c: clip(p.c, cap) }))))}`;
  let out = url(null);
  let cap = Math.max(...packed.map((p) => String(p.c || '').length));
  while (out.length > MAX_URL && cap > MIN_CLIP) {
    cap = Math.max(MIN_CLIP, Math.floor(cap * 0.8));
    out = url(cap);
  }
  return out;
}

function copyLink(item, base = tourBase()) {
  return fitted(base, 'c', (ps) => ps[0], [pack(item)]);
}

/** @param {Array} items the feed; @param {string} day e.g. "Thursday, November 12" */
function tourLink(items, day, base = tourBase()) {
  return fitted(base, 't', (ps) => ({ d: day, i: ps }), items.map(pack));
}

/** The encoded payload of a link, whichever form (query or legacy fragment) it uses. */
function payloadOf(link) {
  const m = /[?#][ct]=([A-Za-z0-9_-]+)$/.exec(link);
  return m ? m[1] : null;
}

module.exports = { copyLink, tourLink, encode, decode, pack, payloadOf, tourBase, DEFAULT_BASE, MAX_URL };
