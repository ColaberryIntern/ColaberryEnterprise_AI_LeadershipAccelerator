/**
 * AF10.7 — decide what to post on one agent ticket, and post it only if asked.
 *
 * ## Dedup reads state back from Basecamp, not from a watermark table
 *
 * No state file, no cursor, nothing that can disagree with what was actually filed. The reasoning
 * is `sweepInternMail.js:22-26`. It also means a crashed run is fully recovered by the next one:
 * unlike the mail sweep, which has a 45-minute window and therefore never re-examined mail from a
 * run that died, this job has no window at all. Whatever is on the ticket is the state.
 *
 * ## The comment read MUST be complete, and that is not a theoretical requirement
 *
 * `comments.json` returns the OLDEST 15 and pages from there. On 26 Oct 2026 Ellis's ticket
 * crossed fifteen comments and two jobs that read it unpaginated both broke in opposite
 * directions: the mail sweep's duplicate check fetched a page that could not contain the comment
 * it had just written and filed the same message twice, and the ticket sync scanned backwards for
 * its own fingerprint through a page that could not contain it, concluded it had never posted, and
 * posted on every tick that afternoon. `basecampPaging.js` records it: *"Neither job changed. The
 * data grew into a bug that had been there since both were written."*
 *
 * Ellis's ticket carried 53 comments and Maru's 58 when this was written, so an unpaginated read
 * here would be broken on arrival rather than eventually. `bcGetAll` is injected for exactly this:
 * it follows the `Link` header, and it brings the 401 refresh, the capped 429/503 backoff and the
 * per-attempt timeout with it. Hand-rolling a `fetch` loop would drop all four.
 *
 * ## `send` defaults to false
 *
 * A Basecamp comment cannot be unposted by this code. So the reversible step comes first: without
 * `send` this returns its decisions and writes nothing, and the caller reads them before
 * authorizing anything.
 */
const { readDeliverables, summarize } = require('./internArtifacts');
const { renderComment, fingerprintOf, lastFingerprints } = require('./internArtifactComment');

/** What happened to one document on one ticket. */
const POSTED = 'posted';
const UNCHANGED = 'unchanged';
const SKIPPED_ABSENT = 'skipped_absent';
const WOULD_POST = 'would_post';

/**
 * Sync one agent ticket.
 *
 * @param {object} args
 * @param {{id: number|string, agent?: string, title?: string, project_id?: number|string}} args.ticket
 * @param {{owner: string, name: string, url?: string}|null} args.repo
 * @param {Record<string,string>} args.deliverables
 * @param {Function} args.fetchRepoFile   injected from dist
 * @param {Function} args.bcGetAll        injected from dist
 * @param {Function} args.bcPost          injected from dist
 * @param {boolean} [args.send]           false by default: decide, do not write
 * @param {string} [args.correlationId]
 */
async function syncTicket({
  ticket, repo, deliverables, fetchRepoFile, bcGetAll, bcPost, send = false, correlationId,
}) {
  const bucket = ticket.project_id;
  const docs = await readDeliverables({ repo, deliverables, fetchRepoFile, correlationId });

  // EVERY comment, or the dedup is broken. See the header.
  const comments = await bcGetAll(`/buckets/${bucket}/recordings/${ticket.id}/comments.json`);
  const known = lastFingerprints(comments);

  const decisions = [];
  for (const doc of docs) {
    const fingerprint = fingerprintOf(doc);
    const previous = known.get(doc.path);

    // An absent document that was never posted is simply not news. Only a document that WAS
    // posted and has since gone is worth a comment, and the status-inclusive fingerprint is what
    // makes that case a change rather than a silence.
    if (doc.status === 'absent' && !previous) {
      decisions.push({ path: doc.path, status: doc.status, outcome: SKIPPED_ABSENT, fingerprint });
      continue;
    }

    if (previous === fingerprint) {
      decisions.push({ path: doc.path, status: doc.status, outcome: UNCHANGED, fingerprint });
      continue;
    }

    const { html } = renderComment({ agent: ticket.agent, doc, repoUrl: repo && repo.url });

    if (!send) {
      decisions.push({
        path: doc.path, status: doc.status, outcome: WOULD_POST, fingerprint, previous, html,
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const posted = await bcPost(`/buckets/${bucket}/recordings/${ticket.id}/comments.json`, { content: html });
    decisions.push({
      path: doc.path,
      status: doc.status,
      outcome: POSTED,
      fingerprint,
      previous,
      comment_url: posted && posted.app_url,
    });
  }

  return {
    ticket_id: ticket.id,
    agent: ticket.agent || null,
    repo: repo ? `${repo.owner}/${repo.name}` : null,
    documents: summarize(docs),
    comments_read: Array.isArray(comments) ? comments.length : 0,
    sent: Boolean(send),
    decisions,
  };
}

/** One line per ticket, for a runner that a human reads. */
function formatSummary(result) {
  const counts = result.decisions.reduce((a, d) => {
    a[d.outcome] = (a[d.outcome] || 0) + 1;
    return a;
  }, {});
  const bits = Object.keys(counts).sort().map((k) => `${k}=${counts[k]}`).join(' ');
  return `${result.agent || 'unknown'} (ticket ${result.ticket_id}, repo ${result.repo || 'none'}, `
    + `${result.comments_read} comments read): ${bits || 'nothing to do'}`;
}

module.exports = {
  syncTicket,
  formatSummary,
  POSTED,
  UNCHANGED,
  SKIPPED_ABSENT,
  WOULD_POST,
};
