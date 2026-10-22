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

module.exports = {
  buildReport, bandFor, withGrace, staleSyncWatch, daysBetween,
  NEW_INTERN_GRACE_DAYS, SOFTENABLE,
};
