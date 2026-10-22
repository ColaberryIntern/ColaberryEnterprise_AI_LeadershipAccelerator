/**
 * Build the Basecamp digest for one agent, from platform state. PURE.
 *
 * ## The rule this module exists to obey
 *
 * AF10.3 names its own failure mode: "A sync that posts 'story complete' when a story was ticked
 * rather than verified." Laundering a tick into an achievement would make every number on every
 * ticket untrustworthy, and the ticket would then be worse than no ticket, because somebody
 * would act on it.
 *
 * So VERIFIED and TICKED are counted separately and never added together. A story is verified
 * only when `verified_at` is set by `build_pipeline:repo_verification`, which means every
 * acceptance criterion passed AND a commit named the story. A story the intern marked complete
 * with no verification is reported as exactly that, in those words.
 *
 * ## Every claim names its source
 *
 * Each figure carries the column it came from. A number on a Basecamp ticket that cannot be
 * traced back to a row is a rumour with formatting, and this programme has already been bitten
 * by a dashboard publishing a keyword-matched count as a conversation count.
 *
 * ## The fingerprint is what makes re-running a no-op
 *
 * The digest carries a hash of the state it describes. The runner reads the last fingerprint
 * off the ticket's own comments and posts only when it differs. No watermark table, no state
 * file, nothing that can disagree with what was actually posted.
 */
const { createHash } = require('crypto');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Marker the runner greps for. Changing it orphans every previous fingerprint. */
const FINGERPRINT_TAG = 'af103-state';

/**
 * The state worth reporting, reduced to the fields that decide whether anything changed.
 *
 * Deliberately NOT the whole state object: `last_sync_at` moves every half hour whether or not
 * anything happened, and including it would post an identical digest forever.
 */
function fingerprintOf(s) {
  const material = {
    verified: s.verified,
    ticked: s.tickedNotVerified,
    verdicts: s.withVerdict,
    stories: s.stories,
    repo: s.repoUrl || '',
    commits: (s.commits || []).map((c) => c.sha).join(','),
    due: s.ticketDueOn || '',
  };
  return createHash('sha256').update(JSON.stringify(material), 'utf8').digest('hex').slice(0, 16);
}

/** One commit line. Bot commits are labelled, because they are not the intern's work. */
function commitLine(c) {
  const bot = /build bot|colaberry/i.test(c.author || '') || /^chore\(colaberry\)/.test(c.message || '');
  return `<tr>
    <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap"><code>${esc(String(c.sha).slice(0, 8))}</code></td>
    <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${esc(String(c.date || '').slice(0, 16).replace('T', ' '))}</td>
    <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0">${esc(c.message || '')}${bot ? ' <em style="color:#718096">(platform, not the intern)</em>' : ''}</td>
  </tr>`;
}

/**
 * @param {object} s platform state for one agent
 * @returns {{fingerprint: string, html: string, headline: string}}
 */
function buildDigest(s) {
  const fingerprint = fingerprintOf(s);
  const commits = (s.commits || []).slice(0, 6);

  // The headline is the one line Ali reads if he reads nothing else.
  const headline = s.verified > 0
    ? `${s.verified} of ${s.stories} stories verified from ${s.intern}'s own commits`
    : s.commits && s.commits.length
      ? `${s.intern} has pushed ${s.commits.length} commit${s.commits.length === 1 ? '' : 's'}, nothing verified yet`
      : `No commits from ${s.intern} yet`;

  const tickedWarning = s.tickedNotVerified > 0
    ? `<div class="x"><strong>${s.tickedNotVerified} marked complete but NOT verified.</strong> That is the intern's own tick with no passing criteria behind it, so it is reported separately and is not counted above. <em>(student_tasks.status = 'complete' AND verified_at IS NULL)</em></div>`
    : '';

  const html = `<div><strong>PLATFORM STATE FOR ${esc(String(s.agent).toUpperCase())} &middot; ${esc(s.intern)}</strong></div>
<div style="color:#475569">${esc(headline)}</div>
<div><br></div>
<table style="border-collapse:collapse;font-size:13px">
<tr><td style="padding:3px 8px"><strong>Verified</strong></td>
    <td style="padding:3px 8px"><strong>${s.verified} of ${s.stories}</strong></td>
    <td style="padding:3px 8px;color:#718096">every criterion passed AND a commit named the story &middot; <em>student_tasks.verified_at, verified_by=build_pipeline:repo_verification</em></td></tr>
<tr><td style="padding:3px 8px">Judged</td><td style="padding:3px 8px">${s.withVerdict}</td>
    <td style="padding:3px 8px;color:#718096">the verifier has read these and written a verdict &middot; <em>student_tasks.verification_json</em></td></tr>
<tr><td style="padding:3px 8px">Repository</td>
    <td style="padding:3px 8px">${s.repoUrl ? `<a href="${esc(s.repoUrl)}">connected</a>` : 'NOT CONNECTED'}</td>
    <td style="padding:3px 8px;color:#718096">${s.fileCount == null ? '' : `${s.fileCount} files &middot; `}<em>github_connections.repo_url</em></td></tr>
<tr><td style="padding:3px 8px">Stories with a due date</td><td style="padding:3px 8px">${s.dated} of ${s.stories}</td>
    <td style="padding:3px 8px;color:#718096"><em>student_tasks.due_on</em></td></tr>
</table>
${tickedWarning}
${commits.length ? `<div><br></div><div><strong>Recent commits</strong> <em style="color:#718096">(github_connections.commit_summary_json)</em></div>
<table style="border-collapse:collapse;font-size:12px">${commits.map(commitLine).join('')}</table>` : ''}
${s.verifiedStories && s.verifiedStories.length ? `<div><br></div><div><strong>Verified stories</strong></div>
<ul>${s.verifiedStories.map((v) => `<li><code>${esc(v.storyId)}</code> &middot; ${v.passed} of ${v.total} criteria &middot; commit <code>${esc(String(v.sha || '').slice(0, 8))}</code></li>`).join('')}</ul>` : ''}
<div><br></div>
<div style="font-size:11px;color:#718096">Posted by the AF10.3 sync. Nothing here was typed by hand, and a Basecamp comment never changes platform state. <!--${FINGERPRINT_TAG}:${fingerprint}--></div>
<div style="font-size:11px;color:#718096">state ${FINGERPRINT_TAG}:${fingerprint}</div>`;

  return { fingerprint, html, headline };
}

/**
 * How far to move a project's stories when Ali moves the ticket's due date.
 *
 * Returns a DELTA IN DAYS, not an absolute date. Shifting preserves the relative order the
 * programme already set across 60 dated stories; stamping one date over all of them would
 * flatten that into a single deadline and silently destroy the sequencing.
 *
 * Returns 0 when there is nothing to do, so the caller never writes without a reason.
 */
function dueDateShiftDays(previousDue, currentDue) {
  if (!previousDue || !currentDue) return 0;
  const a = Date.parse(`${previousDue}T00:00:00Z`);
  const b = Date.parse(`${currentDue}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

module.exports = { buildDigest, fingerprintOf, dueDateShiftDays, FINGERPRINT_TAG };
