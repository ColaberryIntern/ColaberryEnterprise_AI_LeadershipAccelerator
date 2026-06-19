// Launch readiness rollup - the headline "Overall Readiness %".
//
// Pure functions (no I/O) so they unit-test without Basecamp, mirroring
// launchPmoDashboardHtml.js. pullProjectState() in launchPmoDailyUpdate.js
// builds the per-list `areas` (each carrying done/total Basecamp-todo counts)
// and calls computeOverallReadiness(areas) to get the single number rendered as
// the dashboard's "Overall Readiness" KPI, the daily email header/subject, and
// the gpt-4o exec-summary context.
//
// Semantics (confirmed by Ali 2026-06-19): pool done/total across the launch
// WORKSTREAMS only, excluding the PMO's own meta-lists. This is task-weighted
// (a list with more todos moves the number more) and uses the same units as
// every per-area tile (round(done / total * 100)). It deliberately matches the
// "Launch readiness by area" tile grid, which omits the same meta-lists.
//
// House style: no em-dashes.

// PMO meta-lists excluded from the headline rollup. These are process
// bookkeeping, not launch deliverables:
//   - "Launch Readiness Dashboard": the dashboard's own backlog. Counting it
//     would let the dashboard's todos move the readiness number it reports.
//   - "Approval Queues": a standalone approval list that was retired
//     (retireApprovalQueue.js); oversight approvals now live inside each
//     workstream area. Kept here defensively so the list can never reappear and
//     silently dilute the number.
// Matched on the trimmed listName (anchored, case-insensitive) so a real
// workstream whose name merely contains these words is never excluded by
// accident.
const META_LIST_MATCHERS = [
  /^launch readiness dashboard$/i,
  /^approval queues$/i,
];

// True when a Basecamp list is a launch workstream (counts toward readiness),
// false for a PMO meta-list. Denylist by design: any new workstream list counts
// automatically; only the known meta-lists are dropped. (Student Platform Build,
// added after the original 10 lists, flows in with no config change.)
function isLaunchWorkstream(listName) {
  const name = String(listName == null ? '' : listName).trim();
  return !META_LIST_MATCHERS.some((re) => re.test(name));
}

// Headline Overall Readiness over launch workstreams only.
//   pct   = round(sum(done) / sum(total) * 100), or 0 when sum(total) is 0
//   done  = pooled completed todos across workstreams
//   total = pooled todos across workstreams
//   areaCount = number of workstream lists pooled
// Tolerant of missing/malformed area fields (treats absent done/total as 0) so a
// flaky Basecamp pull can never throw here; the divide-by-zero guard returns 0%.
function computeOverallReadiness(areas) {
  const workstreams = (Array.isArray(areas) ? areas : []).filter((a) =>
    isLaunchWorkstream(a && a.listName));
  const total = workstreams.reduce((s, a) => s + (Number(a && a.total) || 0), 0);
  const done = workstreams.reduce((s, a) => s + (Number(a && a.done) || 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { pct, done, total, areaCount: workstreams.length };
}

module.exports = { computeOverallReadiness, isLaunchWorkstream, META_LIST_MATCHERS };
