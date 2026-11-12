/**
 * tourLinks - the two kinds of link the Morning Five email carries to its hosted companion page
 * (frontend/public/bt-k7q2xm4p/index.html):
 *
 *   copy link   #c=<data>  opens one item and puts its Claude Code prompt on the clipboard
 *   tour link   #t=<data>  the guided tour: all ten items, one stop at a time
 *
 * WHY A PAGE: an email cannot run script, so a button in an email cannot write to the clipboard.
 * One click to a page that copies is the closest thing that works in every mail client.
 *
 * WHERE THE DATA LIVES: in the URL FRAGMENT (after "#"), raw-deflated and base64url-encoded.
 * Browsers never send the fragment to the server, so the page is static, nothing about the
 * backlog is stored or logged on the web server, and there is no database or endpoint to secure.
 * The content is exactly what the email already holds. The page decodes it with the browser's
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

function copyLink(item, base = tourBase()) {
  return `${base}#c=${encode(pack(item))}`;
}

/** @param {Array} items the feed; @param {string} day e.g. "Thursday, November 12" */
function tourLink(items, day, base = tourBase()) {
  return `${base}#t=${encode({ d: day, i: items.map(pack) })}`;
}

module.exports = { copyLink, tourLink, encode, decode, pack, tourBase, DEFAULT_BASE };
