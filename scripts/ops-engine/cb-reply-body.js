'use strict';

// cb-reply-body: compose the final Basecamp comment HTML for a CB reply.
//
// Extracted from cb-system-handler.js so the reply-composition contract is a
// pure function with no network/OpenAI deps and can be unit-tested directly
// (the handler module cannot load without node_modules/openai). Also trims the
// oversize handler toward the CLAUDE.md 500-line ceiling.

const { sanitizeReplyHtml } = require('./cb-reply-sanitizer');
const cbPeople = require('./cb-people');

// True when the HTML already carries a real Basecamp mention attachment.
const MENTION_RE = /content-type="application\/vnd\.basecamp\.mention"/;

function firstNameOf(ref) {
  const name = ref && typeof ref === 'object' && ref.name ? String(ref.name) : '';
  return name.trim().split(/\s+/)[0] || '';
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compose the final Basecamp comment HTML for a CB reply. Pure: no network, no
 * side effects. Returns { body, wasLeak }.
 *
 * Pipeline:
 *  1. sanitize   - strip any leaked tool-call scaffolding (wasLeak flags it).
 *  2. <br> fixup - plain text (no markup) keeps its paragraph breaks.
 *  3. injectMentions - rewrite any @Name the model wrote into a REAL mention so
 *     that teammate (Sohail, Sai, ...) is actually notified. Unresolved/ambiguous
 *     names stay plain text; never mis-tagged, never Ali-defaulted.
 *  4. requester notification - ensure the requester is @-mentioned EXACTLY ONCE:
 *       a. body already carries a mention  -> leave it (never add a second tag).
 *       b. body OPENS by addressing the requester by first name in prose
 *          ("Aleem, ...") -> PROMOTE that leading name to the mention tag in
 *          place. Prepending a tag on top of the prose name was the "Aleem
 *          Aleem" doubling defect (BC todo 10048624254): the tag renders the
 *          name AND the prose repeated it.
 *       c. otherwise -> prepend the requester's mention tag.
 *
 * @param {string} content_html   raw model output (may contain @Name, leaks).
 * @param {object} opts
 * @param {(name:string)=>(string|null)} opts.resolveMention  @Name -> sgid|null.
 * @param {(ref:any)=>string} opts.mention   ref -> requester mention tag (may
 *   fall back to Ali); returns '' when nothing is taggable.
 * @param {any} opts.requesterRef  the person CB is replying to (creator object).
 */
function composeReplyBody(content_html, { resolveMention, mention, requesterRef } = {}) {
  const { html: cleaned, wasLeak } = sanitizeReplyHtml(content_html);
  let body = cleaned;
  if (!/<[a-z][\s\S]*>/i.test(body)) body = body.replace(/\n/g, '<br>');
  body = cbPeople.injectMentions(body, typeof resolveMention === 'function' ? resolveMention : () => null);

  // (a) something is already tagged (a resolved @Name) -> do not add another.
  if (MENTION_RE.test(body)) return { body, wasLeak };

  const tag = typeof mention === 'function' ? mention(requesterRef) : '';
  if (!tag) return { body, wasLeak };

  // (b) body opens by addressing the requester by first name (optionally after
  // one opening block tag) -> swap that leading name for the mention tag so the
  // name is not rendered twice. Keeps the trailing punctuation/space intact so
  // "Aleem, I ..." becomes "<@Aleem>, I ..." (reads naturally, single name).
  const first = firstNameOf(requesterRef);
  if (first) {
    const lead = new RegExp(`^(\\s*(?:<(?:div|p)\\b[^>]*>\\s*)?)${escapeRe(first)}\\b(\\s*[,:]?\\s+)`, 'i');
    if (lead.test(body)) {
      return { body: body.replace(lead, `$1${tag}$2`), wasLeak };
    }
  }

  // (c) no name in the body -> prepend the requester's tag.
  return { body: `<div>${tag} ${body}</div>`, wasLeak };
}

module.exports = { composeReplyBody, MENTION_RE };
