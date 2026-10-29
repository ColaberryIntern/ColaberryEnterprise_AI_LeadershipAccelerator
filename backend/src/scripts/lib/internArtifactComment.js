/**
 * AF10.7 — render one document as a Basecamp comment, and fingerprint it so a re-run is silent.
 *
 * ## "An update, not a duplicate" means a NEW comment carrying a fresh fingerprint
 *
 * Nothing in this repo edits a Basecamp comment in place; no caller uses `bcPut` against
 * `comments/{id}.json`. The house meaning of "update" is a new comment whose body embeds a state
 * fingerprint, with the previous one left standing as history. That is also what the ticket asks
 * for when it says the thread should show "how the thinking changed rather than only where it
 * landed". The pattern is `agentTicketDigest.js:34-53`.
 *
 * ## THE FINGERPRINT HASHES STATUS AS WELL AS CONTENT, AND THAT IS NOT BELT-AND-BRACES
 *
 * Hash the content alone and a document that was present, was posted, and is then DELETED or
 * becomes unreadable has no new hash to compare — so nothing posts, and the last comment stands
 * on the thread as the current truth with nothing saying the document is gone. This estate treats
 * exactly that as a defect by name: AF2.7 is "three portal surfaces that tell somebody something
 * untrue" and AF2.9 is the silent stale copy. Including `status` makes present-to-absent a
 * fingerprint CHANGE, so it posts "this document is no longer in the repository."
 *
 * ## One tag per path
 *
 * Six documents share a ticket. A single shared fingerprint would mean one changed document
 * reposts all six, or five changed ones hide behind the sixth.
 *
 * ## Everything interpolated is escaped, and the body is ASCII
 *
 * The excerpt is intern-authored Markdown: untrusted input heading for a rich-HTML comment body.
 * And this route has mangled UTF-8 before, so the body is forced to ASCII rather than hoping.
 */
const { createHash } = require('crypto');

/** Changing this orphans every fingerprint already on a ticket. */
const FINGERPRINT_TAG = 'af107-doc';

/** Longer than this and the comment carries an excerpt plus a link instead of the whole file. */
const INLINE_MAX_CHARS = 4000;

/** How much of a long document to show above the link. */
const EXCERPT_CHARS = 1200;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Force ASCII. Smart quotes, dashes and accented characters all become something a Basecamp
 * comment survives, because the PowerShell-to-ssh path that files these has corrupted UTF-8
 * before and a mangled document reads as a broken document.
 */
function toAscii(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // Anything still outside printable ASCII (plus tab and newline) is dropped rather than
    // guessed at.
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x20-\x7E]/g, '');
}

/**
 * The fingerprint of one document's STATE.
 *
 * Deliberately excludes anything that moves on its own: no timestamp, no run id, no byte count of
 * the comment. `agentTicketDigest.js:39-41` records why — a clock tick that changes the hash makes
 * the job post on every run, which is the failure this whole mechanism exists to avoid.
 */
function fingerprintOf(doc) {
  const material = {
    status: doc.status,
    content: doc.status === 'present'
      ? createHash('sha256').update(String(doc.content || ''), 'utf8').digest('hex')
      : null,
  };
  return createHash('sha256').update(JSON.stringify(material), 'utf8').digest('hex').slice(0, 16);
}

/** The sentinel a later run reads back off the ticket. One per path. */
function sentinelFor(doc, fingerprint) {
  return `${FINGERPRINT_TAG}:${doc.path}:${fingerprint}`;
}

/**
 * Pull the LAST fingerprint recorded for each path out of a ticket's comments.
 *
 * Walks forward and lets later comments overwrite earlier ones, so the newest wins. The caller is
 * responsible for handing over EVERY comment — a partial read is how the 26 Oct duplicate-filing
 * incident happened, when `comments.json` returned only the oldest 15.
 *
 * @param {Array<{content?: string}>} comments
 * @returns {Map<string,string>} path -> fingerprint
 */
function lastFingerprints(comments) {
  const seen = new Map();
  const re = new RegExp(`${FINGERPRINT_TAG}:([^:\\s<]+):([0-9a-f]{16})`, 'g');
  for (const c of comments || []) {
    const text = String((c && c.content) || '');
    let m = re.exec(text);
    while (m) {
      seen.set(m[1], m[2]);
      m = re.exec(text);
    }
    re.lastIndex = 0;
  }
  return seen;
}

/**
 * The comment body for one document.
 *
 * @param {object} args
 * @param {string} args.agent        the agent's name, for the heading
 * @param {object} args.doc          one entry from readDeliverables
 * @param {string} [args.repoUrl]    the repository, for the link
 * @returns {{html: string, fingerprint: string}}
 */
function renderComment({ agent, doc, repoUrl }) {
  const fingerprint = fingerprintOf(doc);
  const sentinel = sentinelFor(doc, fingerprint);
  const label = esc(toAscii(doc.path));
  const who = esc(toAscii(agent || 'this agent'));
  const parts = [];

  if (doc.status === 'present') {
    const content = toAscii(doc.content || '');
    const long = content.length > INLINE_MAX_CHARS;
    const shown = long ? content.slice(0, EXCERPT_CHARS) : content;

    parts.push(`<div><strong>${who} - document update</strong></div>`);
    parts.push(`<div><em>${label}</em></div>`);
    if (long) {
      parts.push(`<div>First ${EXCERPT_CHARS} characters of ${doc.bytes} bytes. `
        + 'The whole document is in the repository.</div>');
    }
    parts.push(`<pre>${esc(shown)}</pre>`);
    if (doc.truncated) {
      parts.push('<div><em>This document exceeds the size this job will read, so the copy above '
        + 'is cut short. The repository holds the whole thing.</em></div>');
    }
    if (long && repoUrl) {
      const link = esc(toAscii(`${String(repoUrl).replace(/\/$/, '')}/blob/HEAD/${doc.path}`));
      parts.push(`<div><a href="${link}">Read it in the repository</a></div>`);
    }
  } else if (doc.status === 'absent') {
    // Only reachable as an UPDATE: a first read of an absent document posts nothing at all.
    // Getting here means it used to be there, which is worth saying out loud.
    parts.push(`<div><strong>${who} - document removed</strong></div>`);
    parts.push(`<div><em>${label}</em></div>`);
    parts.push('<div>This document is no longer in the repository. The excerpt posted earlier on '
      + 'this ticket is history, not the current state.</div>');
  } else {
    parts.push(`<div><strong>${who} - document could not be read</strong></div>`);
    parts.push(`<div><em>${label}</em></div>`);
    parts.push(`<div>${esc(toAscii(doc.reason || 'The platform could not read it.'))}</div>`);
    parts.push(`<div><em>Reason code: ${esc(toAscii(doc.error_class || 'Error'))}. `
      + 'Nothing was posted from the document itself.</em></div>');
  }

  parts.push(`<div><em>${esc(sentinel)}</em></div>`);
  return { html: parts.join('\n'), fingerprint };
}

module.exports = {
  renderComment,
  fingerprintOf,
  lastFingerprints,
  sentinelFor,
  esc,
  toAscii,
  FINGERPRINT_TAG,
  INLINE_MAX_CHARS,
  EXCERPT_CHARS,
};
