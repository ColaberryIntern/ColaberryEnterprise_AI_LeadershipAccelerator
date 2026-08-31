/**
 * repoTreeStaleness — which student repositories are due for a re-read.
 *
 * ## Why this exists
 *
 * `github_connections.file_tree_json` is the platform's only view of what a student
 * has built. `githubService.syncFileTree` is the ONLY thing that writes it, and every
 * one of its callers is a one-time setup flow: kickoff, brownfield discovery, the
 * reconciliation engine. Nothing re-reads a repository on push, and nothing re-reads it
 * on a schedule.
 *
 * Measured in production 2026-08-30: of 33 connections, **0 had synced in the previous
 * 24 hours**, 8 had never synced at all, and the oldest was four months stale. One
 * student had committed a completed Week 10 governance engine that the platform could
 * not see, because it was still holding a snapshot taken six days earlier. Her portfolio
 * credited her with 2 capabilities; her repository contained 7.
 *
 * ## Why a scheduled sweep, and not a webhook
 *
 * A webhook is the better mechanism and cannot be used here. Creating one requires admin
 * rights on the student's repository, and the platform does not even have PUSH rights on
 * most of them (62 of 78 uploaded artifacts never reached a repo for exactly that
 * reason). Reading a tree needs only read access, which the platform does have. So the
 * sweep is deliberately built on the weakest permission that suffices.
 *
 * PURE. No I/O, no clock -- `now` is passed in so the selection is testable and the
 * scheduler stays deterministic.
 */

/** The only fields selection needs. Deliberately not the whole model. */
export interface RefreshCandidate {
  enrollmentId: string;
  lastSyncAt: Date | null;
}

export interface SelectOptions {
  /** A tree older than this is due. */
  maxAgeHours: number;
  /** Hard cap per sweep, so one run cannot exhaust the GitHub rate limit. */
  limit: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Pick the connections due for a re-read, oldest first.
 *
 * NEVER-SYNCED COMES FIRST, and that ordering is deliberate rather than incidental: a
 * connection with no tree at all renders as a student who has built nothing, which is
 * the worst thing this system can say about someone. A merely stale tree at least shows
 * their earlier work.
 *
 * The cap is a rate-limit guard, not a quality filter. Because selection is oldest-first
 * and a successful sync stamps `last_sync_at`, a capped sweep advances through the
 * backlog on each run instead of re-reading the same head of the queue forever.
 */
export function selectStale(
  candidates: RefreshCandidate[],
  now: Date,
  opts: SelectOptions,
): string[] {
  if (!Array.isArray(candidates)) return [];
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 0;
  if (limit === 0) return [];

  const cutoff = now.getTime() - Math.max(0, opts.maxAgeHours) * HOUR_MS;

  const due = candidates.filter((c) => {
    if (!c || typeof c.enrollmentId !== 'string' || !c.enrollmentId) return false;
    if (c.lastSyncAt === null || c.lastSyncAt === undefined) return true;
    const t = c.lastSyncAt instanceof Date ? c.lastSyncAt.getTime() : NaN;
    // An unparseable timestamp is treated as never-synced: acting on it re-reads a repo
    // unnecessarily at worst, whereas skipping it hides a student indefinitely.
    if (!Number.isFinite(t)) return true;
    return t <= cutoff;
  });

  due.sort((a, b) => {
    const at = a.lastSyncAt instanceof Date ? a.lastSyncAt.getTime() : NaN;
    const bt = b.lastSyncAt instanceof Date ? b.lastSyncAt.getTime() : NaN;
    const aNever = !Number.isFinite(at);
    const bNever = !Number.isFinite(bt);
    if (aNever !== bNever) return aNever ? -1 : 1;   // never-synced first
    if (aNever && bNever) return a.enrollmentId.localeCompare(b.enrollmentId); // stable
    return at - bt;                                   // then oldest first
  });

  return due.slice(0, limit).map((c) => c.enrollmentId);
}
