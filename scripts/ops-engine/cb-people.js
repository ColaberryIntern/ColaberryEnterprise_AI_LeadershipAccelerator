'use strict';
/**
 * cb-people - resolve a Basecamp person's @-mention SGID and build the mention
 * HTML so CB can @-tag the ACTUAL person.
 *
 * Before this module the dispatcher hardcoded ONE sgid (Ali's) and exposed a
 * zero-arg `mention()` that always emitted it. Every @-tag CB ever produced
 * therefore resolved to Ali: a reply addressed to Aleem rendered as
 * "@Ali Aleem" (Ali tagged via the attachment, "Aleem" left as plain text), so
 * Aleem - and anyone not named Ali - was never actually notified.
 *
 * 2026-07-01: Aleem reopened with "only tags Ali and Karun, not Sohail/Sai."
 * Two more defects surfaced and are fixed here:
 *   - The people cache loaded the 1295-person ACCOUNT list and matched EXACT
 *     full names only, so "sohail" never matched "Sohail Syed" and "sai" was
 *     ambiguous across the account. Resolution is now PROJECT-scoped (you can
 *     only mention a project's members anyway) and does graded fuzzy name
 *     matching (exact full name > first name > any token > first-name prefix),
 *     refusing to guess when a name is ambiguous.
 *   - The LLM reply HTML was posted verbatim, so a plain-text "@Sohail" it wrote
 *     never became a real mention attachment. `injectMentions()` rewrites those
 *     @Name tokens into real mention HTML when (and only when) the name resolves
 *     uniquely to a project member.
 *
 * Resolution paths, cheapest first:
 *   1. The ref object already carries `attachable_sgid` (every recording's
 *      creator/assignee does) - ZERO network.
 *   2. A name / email / numeric id looked up against a per-scope people cache
 *      (project roster preferred; account list as the legacy fallback).
 *
 * Safe by construction: an unresolved ref falls back to the caller-provided
 * fallback sgid (Ali) ONLY for the caller that opts in (the system's no-arg
 * `mention()`). Named @-tokens that miss or are ambiguous are LEFT AS PLAIN TEXT
 * - tagging Ali when someone asked for Sohail is worse than not tagging at all.
 */

const MENTION_CONTENT_TYPE = 'application/vnd.basecamp.mention';

/** Build the Basecamp mention attachment HTML for a resolved sgid. */
function buildMentionTag(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="${MENTION_CONTENT_TYPE}"></bc-attachment>`;
}

function normKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Per-scope people index. `null` = the legacy account/global cache is unloaded;
// a Map (possibly empty) = loaded. Project scopes live in `scopeCaches`, keyed
// by bucket id, so one project's roster never leaks into another's resolution.
let peopleCache = null;
const scopeCaches = new Map();

/** Build a lookup Map from a /people.json array. Pure; exported for tests. */
function indexPeople(people) {
  const map = new Map();
  for (const p of Array.isArray(people) ? people : []) {
    if (!p || !p.attachable_sgid) continue;
    const sgid = p.attachable_sgid;
    if (p.id != null) map.set(`id:${p.id}`, sgid);
    if (p.email_address) map.set(`email:${normKey(p.email_address)}`, sgid);
    if (p.name) map.set(`name:${normKey(p.name)}`, sgid);
  }
  return map;
}

/**
 * Populate a people cache from Basecamp once per process/scope. Pass `bucketId`
 * to load that PROJECT's roster (`/projects/{id}/people.json`) - the correct,
 * unambiguous scope for mentions, since Basecamp only notifies project members.
 * Omit it for the legacy account-wide list. Never throws: on failure it caches
 * an empty map so object-sgid resolution still works and lookups degrade safely.
 * `bcGet` should be a paginated getter so all members are indexed.
 */
async function ensurePeopleLoaded({ bcGet, bucketId } = {}) {
  if (bucketId != null) {
    const key = String(bucketId);
    if (scopeCaches.has(key)) return scopeCaches.get(key);
    let map;
    try { map = indexPeople(await bcGet(`/projects/${key}/people.json`)); }
    catch (_e) { map = new Map(); }
    scopeCaches.set(key, map);
    return map;
  }
  if (peopleCache) return peopleCache;
  try { peopleCache = indexPeople(await bcGet('/people.json')); }
  catch (_e) { peopleCache = new Map(); }
  return peopleCache;
}

/** Pick the cache for a scope: the project roster if loaded, else the global. */
function cacheFor(bucketId) {
  if (bucketId != null && scopeCaches.has(String(bucketId))) return scopeCaches.get(String(bucketId));
  return peopleCache;
}

/** Pull an sgid straight off a person-like object (creator/assignee). */
function sgidFromObject(ref) {
  if (ref && typeof ref === 'object' && ref.attachable_sgid) return ref.attachable_sgid;
  return null;
}

/**
 * Graded fuzzy name -> sgid within one cache. Refuses to guess: a tier that
 * matches more than one distinct person returns null rather than tagging the
 * wrong human. Tiers, strongest first:
 *   1. exact full name
 *   2. first-name token exact ("sohail" -> "Sohail Syed")
 *   3. any-token exact (last / middle name: "syed", "tejesh")
 *   4. first-name prefix ("soh" -> "sohail ...")
 */
function fuzzyNameSgid(map, query) {
  if (!map) return null;
  const q = normKey(query);
  if (!q) return null;
  if (map.has(`name:${q}`)) return map.get(`name:${q}`);

  const firstName = new Set();
  const anyToken = new Set();
  const firstPrefix = new Set();
  for (const [k, sgid] of map) {
    if (!k.startsWith('name:')) continue;
    const toks = k.slice(5).split(' ');
    if (toks[0] === q) firstName.add(sgid);
    if (toks.includes(q)) anyToken.add(sgid);
    if (toks[0] !== q && toks[0].startsWith(q)) firstPrefix.add(sgid);
  }
  for (const set of [firstName, anyToken, firstPrefix]) {
    if (set.size === 1) return [...set][0];
    if (set.size > 1) return null; // ambiguous at this tier - do not guess
  }
  return null;
}

/**
 * Resolve a person ref to an sgid using ONLY already-known data: an sgid carried
 * on the object, a raw sgid string, or the people cache (project scope if a
 * bucketId is given, else the account/global cache). Synchronous so it is safe
 * to call inside HTML template builders. Returns null on a miss.
 *
 * Accepts: a person object ({ attachable_sgid } | { id } | { email_address } |
 * { name }), a raw sgid string (Basecamp sgids start with "BAh"), a numeric id
 * (number or digit string), an email, or a display name (full, first, or last).
 */
function resolveSgidSync(ref, { bucketId } = {}) {
  if (!ref) return null;
  const direct = sgidFromObject(ref);
  if (direct) return direct;

  const cache = cacheFor(bucketId);

  if (typeof ref === 'object') {
    if (!cache) return null;
    if (ref.id != null && cache.has(`id:${ref.id}`)) return cache.get(`id:${ref.id}`);
    if (ref.email_address && cache.has(`email:${normKey(ref.email_address)}`)) return cache.get(`email:${normKey(ref.email_address)}`);
    if (ref.name) return fuzzyNameSgid(cache, ref.name);
    return null;
  }

  const s = String(ref).trim();
  if (s.startsWith('BAh')) return s; // already a Basecamp sgid
  if (!cache) return null;
  if (/^\d+$/.test(s) && cache.has(`id:${s}`)) return cache.get(`id:${s}`);
  if (s.includes('@') && cache.has(`email:${normKey(s)}`)) return cache.get(`email:${normKey(s)}`);
  return fuzzyNameSgid(cache, s);
}

/**
 * Build a mention tag for a person ref, falling back to `fallbackSgid` (Ali) on
 * a miss. Returns '' only when there is nothing to tag with at all. The fallback
 * is for the system's no-arg `mention()` (closure notes, graceful replies); do
 * NOT use it for a named @-token (see injectMentions).
 */
function mentionFor(ref, { fallbackSgid, bucketId } = {}) {
  const sgid = resolveSgidSync(ref, { bucketId }) || fallbackSgid;
  return sgid ? buildMentionTag(sgid) : '';
}

// @Name in reply text: @ that starts a "word" (not part of an email address,
// which is preceded by a word char) followed by 1-3 Capitalized tokens. We over-
// capture then back off to the longest span that actually resolves, so
// "@Sohail please review" tags Sohail and keeps "please review".
const MENTION_TOKEN_RE = /(^|[\s>( ])@([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})/g;

/**
 * Rewrite plain-text @Name mentions in reply HTML into real Basecamp mention
 * attachments, using `resolve(name) -> sgid|null`. Only replaces when a name
 * resolves UNIQUELY (resolve returns null on miss/ambiguous), so an unknown or
 * ambiguous @Name is left as plain text - never mis-tagged, never Ali-defaulted.
 */
function injectMentions(html, resolve) {
  if (!html || typeof html !== 'string' || typeof resolve !== 'function') return html || '';
  return html.replace(MENTION_TOKEN_RE, (match, pre, name) => {
    const parts = name.split(/\s+/);
    for (let take = parts.length; take >= 1; take--) {
      const sgid = resolve(parts.slice(0, take).join(' '));
      if (sgid) {
        const rest = parts.slice(take).join(' ');
        return `${pre}${buildMentionTag(sgid)}${rest ? ` ${rest}` : ''}`;
      }
    }
    return match; // no span resolved -> leave the original text untouched
  });
}

/** Test-only: inject a prebuilt cache so resolution is deterministic offline. */
function __setPeopleCacheForTests(map) { peopleCache = map; }
/** Test-only: seed a project-scoped cache. */
function __setScopeCacheForTests(bucketId, map) { scopeCaches.set(String(bucketId), map); }
/** Test-only: clear every cache so each test starts unloaded. */
function __resetForTests() { peopleCache = null; scopeCaches.clear(); }

module.exports = {
  buildMentionTag,
  indexPeople,
  ensurePeopleLoaded,
  resolveSgidSync,
  fuzzyNameSgid,
  mentionFor,
  injectMentions,
  normKey,
  __setPeopleCacheForTests,
  __setScopeCacheForTests,
  __resetForTests,
};
