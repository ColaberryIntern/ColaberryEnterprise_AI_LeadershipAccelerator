/**
 * Fix British spellings in Basecamp comments that are ALREADY POSTED, in place.
 *
 * Runs ON THE PROD BACKEND, because that is where a live Basecamp token can be minted.
 *
 * ## Why in place rather than trash-and-repost
 *
 * The comment carries the artifact PDF inline as a resolved <figure>. The obvious fix is to
 * trash the comment and post a corrected one, which is what was done when a batch of
 * comments cited the wrong PR number. That costs two uploads per comment, puts a trashed
 * entry in the history of a ticket somebody is actively reviewing, and re-notifies everyone
 * subscribed. For a handful of words it is the wrong trade.
 *
 * A PUT to the comment keeps the position, the history and the attachment. What is NOT
 * known in advance is whether Basecamp preserves the resolved <figure> through a PUT, or
 * re-parses the content and drops it. So this script does not trust it:
 *
 *   1. read the comment and record its exact current content,
 *   2. rewrite only the text between tags, never inside a tag, so sgids, filenames, URLs
 *      and captions are untouchable,
 *   3. PUT, then read back,
 *   4. require the <figure> and previewable="true" to still be there AND the British word
 *      to be gone. If either check fails, PUT the original content back and stop.
 *
 * The rollback is the point. A comment left without its visible artifact is worse than a
 * comment with "authorisation" in it.
 *
 * ## What it does NOT fix
 *
 * The attached PDF itself. The bytes on the ticket were rendered before the spelling sweep,
 * so the document still reads "authorisation" even once the comment above it does not.
 * Replacing the PDF means replacing the comment, which is the churn this script avoids.
 * Run `attachArtifactToTicket.js` for that, deliberately, when a ticket is next touched.
 *
 * Usage:
 *   TICKETS=10379236982 node /tmp/reviseCommentSpelling.js          # one ticket
 *   TICKETS=all DRY=1 node /tmp/reviseCommentSpelling.js            # report, change nothing
 */
const fs = require('fs');
const { findAllBritishSpellings } = require('./britishSpellings');

const ACCOUNT = '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT}`;
const UA = 'Colaberry Accelerator (ali@colaberry.com)';
const BUCKET = Number(process.env.BUCKET || 7463955);
const LIST = Number(process.env.LIST || 10406233777);
const DRY = process.env.DRY === '1';
const BACKUP = process.env.BACKUP || '/tmp/comment-backups';

let TOKEN = null;
async function tok() {
  if (!TOKEN) {
    TOKEN = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  }
  return TOKEN;
}

async function api(method, p, body) {
  const r = await fetch(API + p, {
    method,
    headers: {
      Authorization: `Bearer ${await tok()}`, 'User-Agent': UA, 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? {} : r.json();
}

async function listAll(p) {
  const out = [];
  for (let i = 1; i <= 30; i++) {
    const j = await api('GET', `${p}${p.includes('?') ? '&' : '?'}page=${i}`);
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j);
  }
  return out;
}

/** Match the replacement to the casing of what was found. */
function recase(found, american) {
  if (found === found.toUpperCase()) return american.toUpperCase();
  if (found[0] === found[0].toUpperCase()) return american[0].toUpperCase() + american.slice(1);
  return american;
}

/**
 * Rewrite British spellings in the TEXT of an HTML fragment, never inside a tag.
 *
 * Splitting on tags rather than parsing is enough here and is the conservative choice: an
 * attachment sgid, a filename, a URL and a caption attribute all live inside a tag, and
 * none of them may be touched. Returns { html, changed: [...] }.
 */
function reviseHtml(html) {
  const changed = [];
  const out = String(html).split(/(<[^>]*>)/).map((part) => {
    if (part.startsWith('<')) return part;
    let text = part;
    for (const hit of findAllBritishSpellings(text)) {
      const re = new RegExp(`(?<![A-Za-z])${hit.word}(?![A-Za-z])`, 'g');
      if (re.test(text)) {
        text = text.replace(re, (m) => recase(m, hit.american));
        changed.push(`${hit.word} -> ${hit.american}`);
      }
    }
    return text;
  }).join('');
  return { html: out, changed: [...new Set(changed)] };
}

/** Did the comment keep its visible artifact? */
function hasLiveAttachment(html) {
  const s = String(html || '');
  // A comment with no attachment at all is fine; one that HAD a figure must still have it.
  return /previewable="true"/.test(s) && s.includes('<figure>');
}

async function ticketIds() {
  const raw = String(process.env.TICKETS || '').trim();
  if (raw && raw !== 'all') return raw.split(',').map((s) => Number(s.trim()));
  const groups = await listAll(`/buckets/${BUCKET}/todolists/${LIST}/groups.json`);
  const todos = [];
  for (const g of (groups.length ? groups : [{ id: LIST }])) {
    todos.push(...await listAll(`/buckets/${BUCKET}/todolists/${g.id}/todos.json`));
    todos.push(...await listAll(`/buckets/${BUCKET}/todolists/${g.id}/todos.json?completed=true`));
  }
  return todos.map((t) => t.id);
}

async function main() {
  const me = await api('GET', '/my/profile.json');
  if (!/ali@colaberry\.com/i.test(me.email_address || '')) throw new Error('not acting as Ali');
  if (!DRY) fs.mkdirSync(BACKUP, { recursive: true });

  let scanned = 0;
  let revised = 0;
  let rolledBack = 0;

  for (const ticketId of await ticketIds()) {
    let comments;
    try {
      comments = await listAll(`/buckets/${BUCKET}/recordings/${ticketId}/comments.json`);
    } catch (e) {
      console.log(`  ticket ${ticketId}: comments unreadable (${e.message.slice(0, 60)})`);
      continue;
    }

    for (const c of comments) {
      scanned += 1;
      const original = String(c.content || '');
      const { html, changed } = reviseHtml(original);
      if (!changed.length) continue;

      const hadAttachment = hasLiveAttachment(original);
      console.log(`\nticket ${ticketId} comment ${c.id}: ${changed.join(', ')}`);
      if (DRY) { revised += 1; continue; }

      fs.writeFileSync(`${BACKUP}/${ticketId}-${c.id}.html`, original);
      await api('PUT', `/buckets/${BUCKET}/comments/${c.id}.json`, { content: html });

      const back = await api('GET', `/buckets/${BUCKET}/comments/${c.id}.json`);
      const after = String(back.content || '');
      const lostAttachment = hadAttachment && !hasLiveAttachment(after);
      const stillBritish = findAllBritishSpellings(
        after.split(/(<[^>]*>)/).filter((p) => !p.startsWith('<')).join(''),
      ).length > 0;

      if (lostAttachment || stillBritish) {
        await api('PUT', `/buckets/${BUCKET}/comments/${c.id}.json`, { content: original });
        rolledBack += 1;
        console.log(`  ROLLED BACK: ${lostAttachment ? 'the PUT dropped the attachment' : 'the words did not change'}`);
        console.log('  Stopping rather than doing this to the rest.');
        console.log(`\n${scanned} scanned, ${revised} revised, ${rolledBack} rolled back`);
        process.exit(1);
      }
      revised += 1;
      console.log('  revised, attachment intact');
    }
  }

  console.log(`\n${scanned} comments scanned, ${revised} revised, ${rolledBack} rolled back`);
  if (!DRY) console.log(`originals saved under ${BACKUP}`);
}

if (require.main === module) {
  main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
}

// Exported so the rewrite can be tested without a Basecamp token. The pure part is the
// part that can quietly corrupt a comment, so it is the part that gets a test.
module.exports = { reviseHtml, hasLiveAttachment, recase };
