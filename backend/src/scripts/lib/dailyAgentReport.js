/**
 * AF10.4 - the daily report, assembled. PURE.
 *
 * "This process should allow me to stay on top of everything that is going on, dates and
 * deadlines, activity and progress." One report instead of seven tickets and three admin pages.
 *
 * ## Three rules the ticket sets, and they shape everything here
 *
 *   1. **Every number traces to a query**, and the report says which.
 *   2. **A quiet day reads as a quiet day**, not as an empty report. An email with nothing in it
 *      is indistinguishable from a broken job, and the second one it looks like is the one that
 *      matters.
 *   3. **It states what it could NOT determine** rather than omitting it. An omission reads as a
 *      zero, and a zero is a claim.
 *
 * ## The stale-sync watch is the subtle one
 *
 * A repository that goes private stops producing work **with no error at all**. Measured 17 Oct.
 * Its only tell is `last_sync_at` drifting behind its siblings while every other signal looks
 * healthy. So this compares each repo against the MEDIAN of the others rather than against a
 * fixed age: if every repo is a day stale the platform has a problem, and if one is a day stale
 * while six synced an hour ago, that one repo has a problem. A fixed threshold cannot tell those
 * apart and would cry wolf on the first and stay silent on the second.
 *
 * ## The activity bands are PORTED, and pinned
 *
 * `services/internship/internConsoleActivity.ts` already owns this and says in its own docblock
 * that two implementations disagreeing would be the worst bug here. It is TypeScript and this is
 * a `.js` operational script that runs from the host, so it cannot be imported. The port is
 * therefore pinned by a test that asserts identical output across the whole range, including the
 * grace rule and its deliberate refusal to soften `unknown`.
 */

/** Ported from internConsoleActivity.NEW_INTERN_GRACE_DAYS. */
const NEW_INTERN_GRACE_DAYS = 30;

/** Ported from internConsoleActivity.bandFor. Boundaries inclusive of the lower number. */
function bandFor(daysSince) {
  if (daysSince === null || daysSince === undefined) return 'unknown';
  if (daysSince <= 0) return 'green';
  if (daysSince <= 3) return 'yellow';
  if (daysSince <= 6) return 'orange';
  if (daysSince <= 9) return 'red';
  return 'black';
}

/** The bands that mean MEASURED silence. `unknown` is deliberately absent; see withGrace. */
const SOFTENABLE = ['orange', 'red', 'black'];

/**
 * Ported from internConsoleActivity.withGrace.
 *
 * `unknown` is NOT softened, and that is the point rather than an oversight: an intern who has
 * done nothing at all is the one group always worth acting on, in week one as much as week six.
 */
function withGrace(level, daysSinceJoined) {
  const isNew = daysSinceJoined !== null && daysSinceJoined !== undefined
    && daysSinceJoined <= NEW_INTERN_GRACE_DAYS;
  if (isNew && SOFTENABLE.includes(level)) return { level: 'yellow', graced: true };
  return { level, graced: false };
}

/** Whole days between two instants, or null when either is missing. */
function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = from instanceof Date ? from.getTime() : Date.parse(from);
  const b = to instanceof Date ? to.getTime() : Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}

const median = (ns) => {
  const s = ns.slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Repositories whose sync has drifted behind the pack.
 *
 * RELATIVE, not absolute. See the header: a repo that went private looks healthy by every other
 * measure, and the only evidence is that it stopped keeping up with its siblings.
 *
 * `thresholdHours` is the drift past the median that counts as suspicious. Needs at least three
 * repos to have a meaningful median, and says so rather than guessing from two.
 */
function staleSyncWatch(repos, now, thresholdHours = 6) {
  const withSync = repos.filter((r) => r.lastSyncAt);
  if (withSync.length < 3) {
    return {
      determinable: false,
      reason: `only ${withSync.length} repo(s) have ever synced, which is too few for a median to mean anything`,
      flagged: [],
      neverSynced: repos.filter((r) => !r.lastSyncAt).map((r) => r.domain),
    };
  }
  const ages = withSync.map((r) => (Date.parse(now) - Date.parse(r.lastSyncAt)) / 3600000);
  const med = median(ages);
  const flagged = withSync
    .map((r, i) => ({ domain: r.domain, intern: r.intern, ageHours: ages[i], repoUrl: r.repoUrl }))
    .filter((r) => r.ageHours - med >= thresholdHours)
    .sort((a, b) => b.ageHours - a.ageHours);
  return {
    determinable: true,
    medianAgeHours: med,
    thresholdHours,
    flagged,
    neverSynced: repos.filter((r) => !r.lastSyncAt).map((r) => r.domain),
  };
}

/**
 * Assemble the report.
 *
 * Returns a structure, not markup, so the same assembly can be rendered as email, posted to
 * Basecamp, or asserted against in a test without going through HTML.
 */
function buildReport({ agents, now, dueSoonDays = 2 }) {
  const today = String(now).slice(0, 10);

  const rows = agents.map((a) => {
    const daysSinceCommit = daysBetween(a.lastCommitAt, now);
    const raw = bandFor(daysSinceCommit);
    const { level, graced } = withGrace(raw, daysBetween(a.joinedAt, now));
    return {
      domain: a.domain,
      agent: a.agent,
      intern: a.intern,
      verified: a.verified,
      stories: a.stories,
      movedSinceYesterday: a.movedSinceYesterday || [],
      lastCommitAt: a.lastCommitAt || null,
      daysSinceCommit,
      activity: level,
      graced,
      repoUrl: a.repoUrl || null,
      lastSyncAt: a.lastSyncAt || null,
      overdue: (a.dueDates || []).filter((d) => d < today).length,
      dueSoon: (a.dueDates || []).filter((d) => {
        const days = daysBetween(today, d);
        return days !== null && days >= 0 && days <= dueSoonDays;
      }).length,
    };
  });

  const moved = rows.filter((r) => r.movedSinceYesterday.length > 0);
  const quiet = rows.filter((r) => ['orange', 'red', 'black'].includes(r.activity));
  const never = rows.filter((r) => r.activity === 'unknown');
  const stale = staleSyncWatch(
    agents.map((a) => ({ domain: a.domain, intern: a.intern, lastSyncAt: a.lastSyncAt, repoUrl: a.repoUrl })),
    now,
  );

  // Anything the report could not establish. Carried explicitly: an omission reads as a zero.
  const undetermined = [];
  if (!stale.determinable) undetermined.push(`Stale-sync watch: ${stale.reason}`);
  for (const r of rows) {
    if (!r.repoUrl) undetermined.push(`${r.domain}: no repository connected, so no commit activity can be read`);
    else if (r.daysSinceCommit === null) undetermined.push(`${r.domain}: repository connected but no commit date recorded`);
  }

  const totals = {
    agents: rows.length,
    verified: rows.reduce((n, r) => n + r.verified, 0),
    stories: rows.reduce((n, r) => n + r.stories, 0),
    overdue: rows.reduce((n, r) => n + r.overdue, 0),
    dueSoon: rows.reduce((n, r) => n + r.dueSoon, 0),
    movedCount: moved.reduce((n, r) => n + r.movedSinceYesterday.length, 0),
  };

  // Rule 2: a quiet day must READ as a quiet day.
  const headline = totals.movedCount > 0
    ? `${totals.movedCount} thing${totals.movedCount === 1 ? '' : 's'} moved since yesterday across ${moved.length} agent${moved.length === 1 ? '' : 's'}`
    : 'Nothing moved since yesterday. That is a measured quiet day, not a missing report.';

  return { today, headline, rows, moved, quiet, never, stale, undetermined, totals };
}

/**
 * A commit the platform made on the intern's behalf, which is not the intern working.
 *
 * Author and message are matched SEPARATELY and that is the whole point. The first version of
 * this was one pattern, `/build bot|^chore\(colaberry\)/i`, tested against `author + ' ' +
 * message` - so the `^` anchored to the start of the AUTHOR and the provisioner-chore half could
 * never match anything. Only the author half was ever doing work, and a provisioner commit
 * authored under any other name counted as the intern working. Pinned by a test.
 */
const PLATFORM_AUTHOR = /build bot/i;
const PLATFORM_MESSAGE = /^chore\(colaberry\)/i;
const isPlatformCommit = (c) => PLATFORM_AUTHOR.test(String(c.author == null ? '' : c.author))
  || PLATFORM_MESSAGE.test(String(c.message == null ? '' : c.message).trim());

/**
 * Shorten a commit subject to fit the report's column, cutting at a word boundary.
 *
 * A hard `slice(0, 60)` left lines reading "document the rol" and "map the nine anatomy elem" in
 * the first real report. Three characters of a word carry no meaning and read as a rendering
 * fault, so the cut falls back to the last space and says it was cut.
 */
function clip(s, max) {
  const text = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  // Only respect the word boundary if it is not so early that it throws most of the line away.
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, '')}...`;
}

/**
 * Turn the query's rows into `buildReport` input. PURE, and here rather than in the sender
 * because the bot filter is load-bearing: the provisioner commits into every one of these
 * repositories, so counting its commits as movement would show seven busy interns on a day
 * nobody touched anything. That is the exact failure this whole report exists to prevent, so
 * it belongs somewhere a test can hold it.
 */
function shapeAgentRows(rows, now) {
  const cutoff = Date.parse(now) - 86400000;
  return (rows || []).map((a) => {
    const commits = Array.isArray(a.commits) ? a.commits : [];
    const latest = commits.map((c) => c.date).filter(Boolean).sort().pop() || null;
    const recentCommits = commits
      .filter((c) => c.date && Date.parse(c.date) > cutoff)
      .filter((c) => !isPlatformCommit(c))
      .map((c) => `commit: ${clip(c.message, 60)}`);
    return {
      domain: a.domain,
      agent: a.domain,
      intern: a.intern,
      stories: a.stories,
      verified: a.verified,
      joinedAt: a.joined_at,
      lastCommitAt: latest,
      lastSyncAt: a.last_sync_at,
      repoUrl: a.repo_url,
      dueDates: a.due_dates || [],
      movedSinceYesterday: [...(a.moved || []), ...recentCommits],
    };
  });
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Color for an activity band. Matches the Intern Console's own reading of these words. */
const BAND_COLOR = {
  green: '#2f7d32', yellow: '#b26a00', orange: '#c2410c', red: '#b3261e',
  black: '#1f2937', unknown: '#718096',
};

/**
 * The report as the email body. Lives here rather than in the sender for one reason: the
 * ticket artifact has to show the REPORT ALI ACTUALLY RECEIVES, and a second renderer written
 * for the artifact would be free to drift into showing something nicer than the real thing.
 * One definition means the picture on the ticket cannot flatter the email.
 */
function renderHtml(r, generatedAt) {
  const row = (x) => `<tr>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0"><strong>${esc(x.agent)}</strong><br>
      <span style="color:#718096;font-size:12px">${esc(x.intern)}</span></td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:right">
      <strong>${x.verified}</strong> <span style="color:#718096">of ${x.stories}</span></td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0">
      <span style="color:${BAND_COLOR[x.activity]};font-weight:700">${esc(x.activity)}</span>
      ${x.graced ? '<span style="color:#718096;font-size:11px"> (new, capped)</span>' : ''}
      <br><span style="color:#718096;font-size:11px">${x.daysSinceCommit === null ? 'no commit recorded'
    : x.daysSinceCommit === 0 ? 'committed today' : `${x.daysSinceCommit}d since last commit`}</span></td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;font-size:12px">
      ${x.movedSinceYesterday.length ? x.movedSinceYesterday.map(esc).join('<br>') : '<span style="color:#718096">nothing</span>'}</td>
    <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px">
      ${x.overdue ? `<strong style="color:#b3261e">${x.overdue} overdue</strong><br>` : ''}
      ${x.dueSoon ? `${x.dueSoon} due soon` : (x.overdue ? '' : '<span style="color:#718096">-</span>')}</td>
  </tr>`;

  const staleBlock = !r.stale.determinable
    ? `<p style="color:#718096">Stale-sync watch could not run: ${esc(r.stale.reason)}</p>`
    : r.stale.flagged.length
      ? `<p><strong style="color:#b3261e">${r.stale.flagged.length} repository drifting behind the others.</strong>
         A repository that goes private stops producing work with no error at all, and this drift is its only tell.</p>
         <ul>${r.stale.flagged.map((f) => `<li><strong>${esc(f.domain)}</strong> (${esc(f.intern)}): last synced
           <strong>${f.ageHours.toFixed(1)}h</strong> ago against a median of ${r.stale.medianAgeHours.toFixed(1)}h
           &mdash; <a href="${esc(f.repoUrl)}">${esc(String(f.repoUrl).replace('https://github.com/', ''))}</a></li>`).join('')}</ul>`
      : `<p style="color:#2f7d32">All repositories are syncing together. Median age
         ${r.stale.medianAgeHours.toFixed(1)}h, nothing drifting more than ${r.stale.thresholdHours}h behind.</p>`;

  return `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.55">
<h2 style="color:#C20E1E;margin:0 0 4px">Agent Factory, ${esc(r.today)}</h2>
<p style="font-size:15px;margin:0 0 14px"><strong>${esc(r.headline)}</strong></p>

<p style="margin:0 0 4px"><strong>${r.totals.verified}</strong> stories verified of ${r.totals.stories} across
${r.totals.agents} agents &middot; <strong>${r.totals.overdue}</strong> overdue &middot;
<strong>${r.totals.dueSoon}</strong> due in the next two days</p>

<table style="border-collapse:collapse;font-size:13px;margin-top:10px;width:100%">
<tr style="text-align:left">
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0">Agent</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0;text-align:right">Verified</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0">Activity</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0">Moved since yesterday</th>
  <th style="padding:5px 9px;border-bottom:2px solid #cbd5e0;text-align:right">Dates</th>
</tr>
${r.rows.map(row).join('')}
</table>

<h3 style="color:#C20E1E;margin:16px 0 4px">Repository sync</h3>
${staleBlock}

${r.quiet.length ? `<h3 style="color:#C20E1E;margin:16px 0 4px">Gone quiet</h3>
<ul>${r.quiet.map((x) => `<li><strong>${esc(x.intern)}</strong> (${esc(x.domain)}):
  <span style="color:${BAND_COLOR[x.activity]}">${esc(x.activity)}</span>,
  ${x.daysSinceCommit}d since their last commit</li>`).join('')}</ul>` : ''}

${r.never.length ? `<h3 style="color:#C20E1E;margin:16px 0 4px">Never committed</h3>
<ul>${r.never.map((x) => `<li><strong>${esc(x.intern)}</strong> (${esc(x.domain)}) has no recorded commit at all.
  This is not softened by the new-intern grace, because it is the group always worth acting on.</li>`).join('')}</ul>` : ''}

${r.undetermined.length ? `<h3 style="color:#C20E1E;margin:16px 0 4px">What this report could not determine</h3>
<ul>${r.undetermined.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
<p style="font-size:12px;color:#718096">Stated rather than omitted, because an omission reads as a zero.</p>` : ''}

<h3 style="color:#C20E1E;margin:16px 0 4px">Where these numbers come from</h3>
<ul style="font-size:12px;color:#718096">
<li>Verified: <code>student_tasks.verified_at</code>, set by <code>build_pipeline:repo_verification</code></li>
<li>Activity bands: last commit in <code>github_connections.commit_summary_json</code>, banded by the same rule the Intern Console uses</li>
<li>Moved since yesterday: <code>verified_at</code> within 24h, and commits dated within 24h</li>
<li>Dates: <code>student_tasks.due_on</code></li>
<li>Sync drift: <code>github_connections.last_sync_at</code>, compared against the median of the others</li>
</ul>
<p style="font-size:11px;color:#718096">Generated ${esc(generatedAt)}. Sent every day, including quiet ones, so a
silent day and a broken job cannot look the same.</p>
</div>`;
}

module.exports = {
  buildReport, bandFor, withGrace, staleSyncWatch, daysBetween,
  shapeAgentRows, renderHtml, BAND_COLOR,
  NEW_INTERN_GRACE_DAYS, SOFTENABLE,
};
