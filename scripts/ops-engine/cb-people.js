'use strict';
/**
 * cb-people - resolve a Basecamp person's @-mention SGID and build the mention
 * HTML so CB can @-tag the ACTUAL person.
 *
 * Before this module the dispatcher hardcoded ONE sgid (Ali's) and exposed a
 * zero-arg `mention()` that always emitted it. Every @-tag CB ever produced
 * therefore resolved to Ali: a reply addressed to Aleem rendered as
 * "@Ali Aleem" (Ali tagged via the attachment, "Aleem" left as plain text), so
 * Aleem - and anyone not named Ali - was never actually notified. This module
 * makes the tag resolve to the real person.
 *
 * Two resolution paths, cheapest first:
 *   1. The person object already carries `attachable_sgid`. Every Basecamp
 *      recording's `creator` / `assignee` does, so the requester case needs
 *      ZERO network - we read the sgid straight off the comment's creator.
 *   2. A bare name / email / numeric id is looked up against the account people
 *      list (/people.json), cached once per process. Used when only a name is
 *      known (e.g. tagging a third party).
 *
 * Safe by construction: an unresolved ref falls back to the caller-provided
 * fallback sgid (Ali), so a lookup miss degrades to the OLD behavior instead of
 * throwing or dropping the tag. The people fetch swallows its own errors and
 * caches the empty result, so it can never break a dispatcher tick.
 */

const MENTION_CONTENT_TYPE = 'application/vnd.basecamp.mention';

/** Build the Basecamp mention attachment HTML for a resolved sgid. */
function buildMentionTag(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="${MENTION_CONTENT_TYPE}"></bc-attachment>`;
}

function normKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// In-process people index: "id:N" / "email:x" / "name:y" -> attachable_sgid.
// null = not loaded yet; a Map (possibly empty) = loaded.
let peopleCache = null;

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
 * Populate the people cache from Basecamp once per process. `bcGet` should be a
 * paginated getter (the dispatcher's bcGetAll) so all people are indexed, not
 * just the first page. Never throws: on failure it caches an empty map so the
 * requester (object-sgid) path still works and lookups fall back to Ali.
 */
async function ensurePeopleLoaded({ bcGet }) {
  if (peopleCache) return peopleCache;
  try {
    const people = await bcGet('/people.json');
    peopleCache = indexPeople(people);
  } catch (_e) {
    peopleCache = new Map();
  }
  return peopleCache;
}

/** Pull an sgid straight off a person-like object (creator/assignee). */
function sgidFromObject(ref) {
  if (ref && typeof ref === 'object' && ref.attachable_sgid) return ref.attachable_sgid;
  return null;
}

/**
 * Resolve a person ref to an sgid using ONLY already-known data: an sgid carried
 * on the object, a raw sgid string, or the in-process people cache. Synchronous
 * so it is safe to call inside HTML template builders. Returns null on a miss.
 *
 * Accepts: a person object ({ attachable_sgid } | { id } | { email_address } |
 * { name }), a raw sgid string (Basecamp sgids start with "BAh"), a numeric id
 * (number or digit string), an email, or a display name.
 */
function resolveSgidSync(ref) {
  if (!ref) return null;
  const direct = sgidFromObject(ref);
  if (direct) return direct;

  if (typeof ref === 'object') {
    if (!peopleCache) return null;
    if (ref.id != null && peopleCache.has(`id:${ref.id}`)) return peopleCache.get(`id:${ref.id}`);
    if (ref.email_address && peopleCache.has(`email:${normKey(ref.email_address)}`)) return peopleCache.get(`email:${normKey(ref.email_address)}`);
    if (ref.name && peopleCache.has(`name:${normKey(ref.name)}`)) return peopleCache.get(`name:${normKey(ref.name)}`);
    return null;
  }

  const s = String(ref).trim();
  if (s.startsWith('BAh')) return s; // already a Basecamp sgid
  if (!peopleCache) return null;
  if (/^\d+$/.test(s) && peopleCache.has(`id:${s}`)) return peopleCache.get(`id:${s}`);
  if (s.includes('@') && peopleCache.has(`email:${normKey(s)}`)) return peopleCache.get(`email:${normKey(s)}`);
  if (peopleCache.has(`name:${normKey(s)}`)) return peopleCache.get(`name:${normKey(s)}`);
  return null;
}

/**
 * Build a mention tag for a person ref, falling back to `fallbackSgid` (Ali) on
 * a miss. Returns '' only when there is nothing to tag with at all.
 */
function mentionFor(ref, { fallbackSgid } = {}) {
  const sgid = resolveSgidSync(ref) || fallbackSgid;
  return sgid ? buildMentionTag(sgid) : '';
}

/** Test-only: inject a prebuilt cache so resolution is deterministic offline. */
function __setPeopleCacheForTests(map) { peopleCache = map; }
/** Test-only: clear the cache so each test starts unloaded. */
function __resetForTests() { peopleCache = null; }

module.exports = {
  buildMentionTag,
  indexPeople,
  ensurePeopleLoaded,
  resolveSgidSync,
  mentionFor,
  normKey,
  __setPeopleCacheForTests,
  __resetForTests,
};
