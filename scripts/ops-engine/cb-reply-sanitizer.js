/**
 * CB reply sanitizer + mention resolver.
 *
 * Two production bugs this module exists to kill:
 *
 *  1. RAW TOOL-CALL LEAK. gpt-4o sometimes emits its tool call as plain TEXT
 *     in message.content instead of as a real tool_call. The handler's
 *     no-tool-call fallback used to dump that text verbatim, so a Basecamp
 *     comment ended up reading:
 *
 *         functions.basecamp_reply({
 *         content_html: "
 *         Ram, the 12-week structure ...
 *         "
 *         });
 *         functions.finish();
 *
 *     `extractLeakedReply` recovers the real content_html payload from that
 *     pseudo-code; `sanitizeReplyHtml` is the deterministic backstop that runs
 *     on EVERY outgoing comment so leaked scaffolding can never reach Basecamp.
 *
 *  2. WRONG @-MENTION. The dispatcher's mention() was hardcoded to Ali's SGID,
 *     so every reply tagged Ali even when someone else (e.g. Ram) asked the
 *     question. `buildMention` resolves the actual person's attachable_sgid.
 *
 * Pure logic, no network, no side effects -> unit-testable offline.
 */

const MENTION_CONTENT_TYPE = 'application/vnd.basecamp.mention';

// Tool names the model might leak as text. Keep in sync with the TOOLS list in
// cb-system-handler.js (only the names matter here).
const TOOL_NAMES = [
  'basecamp_reply', 'email_ali', 'queue_followup', 'create_task', 'complete_todo',
  'set_intern_nudge_mode', 'scrap_gov_bid', 'add_gov_bid', 'add_gov_bid_by_number',
  'post_gov_bid_download_instructions', 'finalize_gov_bids_from_reply', 'vip_list',
  'set_vip_sms_mode', 'exit_intern_preview', 'create_pdf', 'create_xlsx',
  'create_image', 'suggest_prompt', 'finish',
];

const LEAK_RE = new RegExp(
  '\\bfunctions?\\.\\w+\\s*\\(' +                       // functions.basecamp_reply(  /  functions.finish()
  '|\\b(?:' + TOOL_NAMES.join('|') + ')\\s*\\(' +       // basecamp_reply(  /  finish(
  '|\\bcontent_html\\s*:' +                             // content_html:
  '|\\bbody_html\\s*:',
  'i'
);

function stripEmDashes(s) {
  return String(s == null ? '' : s).replace(/—/g, '-').replace(/–/g, '-');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** True when the text smells like a model that wrote its tool call as prose. */
function looksLikeToolCallLeak(text) {
  return LEAK_RE.test(String(text == null ? '' : text));
}

/** Undo the common JS string escapes a leaked literal carries. */
function unescapeJsString(s) {
  return String(s == null ? '' : s)
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\`/g, '`')
    .replace(/\\\\/g, '\\');
}

/**
 * Recover the real reply text from a leaked tool-call literal.
 * Returns the inner content_html/body_html/content string, or null if the text
 * doesn't carry one.
 */
function extractLeakedReply(text) {
  const t = String(text == null ? '' : text);
  if (!t) return null;
  const km = t.match(/(?:content_html|body_html|content)\s*:\s*(["'`])/i);
  if (!km) return null;
  const quote = km[1];
  const start = km.index + km[0].length; // first char of the string value
  let i = start;
  let closeIdx = -1;
  while (i < t.length) {
    const ch = t[i];
    if (ch === '\\') { i += 2; continue; } // skip escaped char
    if (ch === quote) {
      // Treat as the closer only if what follows looks like the end of the
      // argument literal (handles HTML that contains internal quotes).
      const rest = t.slice(i + 1).replace(/^\s+/, '');
      closeIdx = i;
      if (rest === '' || /^[,}\);]/.test(rest)) break;
    }
    i += 1;
  }
  if (closeIdx <= start) return null;
  const inner = unescapeJsString(t.slice(start, closeIdx)).trim();
  return inner || null;
}

/** Remove any residual function-call scaffolding tokens from a blob of text. */
function stripToolCallScaffolding(text) {
  return String(text == null ? '' : text)
    // functions.basecamp_reply({  /  functions.finish(  /  basecamp_reply({
    .replace(new RegExp('\\bfunctions?\\.(?:' + TOOL_NAMES.join('|') + ')\\s*\\(\\s*\\{?', 'gi'), '')
    .replace(new RegExp('\\b(?:' + TOOL_NAMES.join('|') + ')\\s*\\(\\s*\\{?', 'gi'), '')
    .replace(/^\s*(?:content_html|body_html|content)\s*:\s*["'`]?/gim, '')
    .replace(/["'`]?\s*\}\s*\)\s*;?/g, '')   // "});  /  });
    .replace(/^\s*\)\s*;?\s*$/gm, '')         // lone );
    .replace(/^\s*\}\s*\)?\s*;?\s*$/gm, '')   // lone }  /  });
    .replace(/^\s*["'`]\s*$/gm, '')           // lone dangling quote line
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The deterministic guard run on EVERY outgoing comment body.
 * - Clean replies pass through untouched (apart from em-dash normalization).
 * - Leaked tool-call text is converted back into the real reply.
 * Returns { html, wasLeak }.
 */
function sanitizeReplyHtml(html) {
  const raw = String(html == null ? '' : html);
  if (!looksLikeToolCallLeak(raw)) {
    return { html: stripEmDashes(raw), wasLeak: false };
  }
  const recovered = extractLeakedReply(raw);
  if (recovered) {
    return { html: stripEmDashes(recovered), wasLeak: true };
  }
  const stripped = stripToolCallScaffolding(raw);
  return { html: stripEmDashes(stripped), wasLeak: true };
}

/**
 * Build a Basecamp @-mention attachment for a person.
 *   person  - BC person object (needs attachable_sgid to actually notify)
 *   opts.fallbackSgid - sgid to use if the person has none (e.g. Ali)
 * Falls back to the plain (non-notifying) name only when no sgid is available.
 */
function buildMention(person, opts = {}) {
  const sgid = (person && person.attachable_sgid) || opts.fallbackSgid || null;
  if (sgid) {
    return `<bc-attachment sgid="${sgid}" content-type="${MENTION_CONTENT_TYPE}"></bc-attachment>`;
  }
  const name = (person && person.name) ? person.name : 'there';
  return escapeHtml(name);
}

module.exports = {
  MENTION_CONTENT_TYPE,
  stripEmDashes,
  escapeHtml,
  looksLikeToolCallLeak,
  unescapeJsString,
  extractLeakedReply,
  stripToolCallScaffolding,
  sanitizeReplyHtml,
  buildMention,
};
