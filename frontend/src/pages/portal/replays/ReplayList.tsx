import React from 'react';
import type { ReplayBroadcast, ReplayState } from '../../../hooks/useReplayDiscovery';
import { useBroadcastPlayer } from '../../../contexts/BroadcastPlayerContext';
import { fmtCentralDateTime } from '../today/shellUtils';

/**
 * The replay list itself, separated from the page so it can be mounted without the portal
 * shell. The shell fetches settings, points, people and DMs on mount; a test of "does an
 * unwatchable entry offer a button" should not have to stand all of that up, and one that
 * does tends to get written against a hand-built tree instead — which is how the live badge's
 * worst defect hid (see `liveNowBadge.gating.test.tsx`).
 *
 * NOTHING HERE DECIDES WHO MAY SEE WHAT. Every entry is already safe to name: the server omits
 * a private occurrence entirely for a viewer who is not room-eligible, rather than sending a
 * locked shell with the title stripped — the same `mayKnowAbout` rule the live ticker goes
 * through. So there is deliberately no filtering of its own. A client-side filter would be a
 * second, weaker answer to a question the server has already answered, and it would require
 * the private title to be in the payload in order to not draw it.
 */

/** The label for an entry the viewer cannot play. Mirrors the live badge's wording. */
export function lockLabel(r: ReplayBroadcast): string {
  if (r.access_mode === 'preview') return 'Preview only';
  if (r.offer_upgrade) return 'Upgrade to watch';
  return 'Not available to you';
}

export function ReplayCard({ replay }: { replay: ReplayBroadcast }): React.ReactElement {
  const { open, session } = useBroadcastPlayer();
  const playing = session?.occurrenceId === replay.id;

  return (
    <article className="te-card rp-card" data-testid={`replay-${replay.id}`}>
      <div className="rp-card-body">
        <h3 className="rp-title">{replay.title}</h3>
        <p className="rp-when">
          {replay.ended_at === null
            // A recording with no end time is a real row, not a broken one — the column was
            // unwritten before L7.4. Saying so beats printing a 1970 date.
            ? 'Date not recorded'
            : `Ended ${fmtCentralDateTime(new Date(replay.ended_at))}`}
        </p>
      </div>
      {replay.can_watch ? (
        <button
          type="button"
          className="te-btn cherry sm"
          data-testid={`replay-watch-${replay.id}`}
          disabled={playing}
          onClick={() => open({
            occurrenceId: replay.id,
            // The grant is per-asset and the list carries no asset slug, so this is the same
            // contract the live surfaces already assume. Which uid gets signed is the server's
            // decision, and for a finished class it is the recording's (L8.4).
            asset: 'master.m3u8',
            title: replay.title,
          })}
        >
          {playing ? 'Playing' : '▶ Watch'}
        </button>
      ) : (
        // No button at all. A "Watch" that answers 402 is worse than no affordance, which is
        // the rule `BroadcastWatchButton` already follows for the live case.
        <span className="rp-locked" data-testid={`replay-locked-${replay.id}`}>{lockLabel(replay)}</span>
      )}
    </article>
  );
}

export type ReplayListProps =
  Pick<ReplayState, 'replays' | 'disabled' | 'unavailable' | 'loading' | 'retentionDays'>;

/**
 * The retention window, said out loud.
 *
 * A student who cannot find Week 2 will conclude the recording was lost, or ask someone — and
 * both are worse than a sentence setting the expectation before they go looking. The NUMBER
 * comes from the server (see `retention_days` on the route) rather than being written here,
 * because a hardcoded copy is a second source of truth that goes stale the first time the
 * policy moves, leaving the page promising a window nobody enforces.
 *
 * Absent means SILENT. An older backend sends no window, and inventing one would be the exact
 * failure this is arranged to avoid.
 */
function RetentionNote({ days }: { days: number | null }): React.ReactElement | null {
  if (days === null) return null;
  return (
    <p className="rp-retention" data-testid="replays-retention">
      {`Classes stay here for ${days} day${days === 1 ? '' : 's'} after they air.`}
    </p>
  );
}

/**
 * AN EMPTY LIST IS NOT AN ERROR AND AN ERROR IS NOT AN EMPTY LIST. Those are three separate
 * branches on purpose — off, unresolved, and genuinely nothing yet. Telling a student "no
 * recordings yet" while discovery is down is how a passing outage becomes a settled belief
 * that their class was never recorded, and the server refuses to conflate the two (it answers
 * 503 rather than `[]`) specifically so that this layer does not have to guess.
 */
export default function ReplayList({
  replays, disabled, unavailable, loading, retentionDays,
}: ReplayListProps): React.ReactElement {
  return (
    <section className="rp-wrap" aria-labelledby="rp-heading">
      <h2 id="rp-heading" className="rp-heading">Replays</h2>
      {/* Shown whenever the feature is on, including on an empty shelf: "nothing here yet"
          and "this is how long things stay" answer different questions, and a student
          looking for a class that has expired needs the second one. */}
      {!disabled && <RetentionNote days={retentionDays} />}

      {loading && replays.length === 0 && (
        <p className="rp-note" data-testid="replays-loading">Looking for your recordings…</p>
      )}

      {/* The feature is off, or the session is not usable. Nothing to show and nothing to
          retry, so this says so plainly rather than rendering an outage. */}
      {!loading && disabled && (
        <p className="rp-note" data-testid="replays-off">
          Class replays are not switched on yet. Nothing is missing from your account.
        </p>
      )}

      {!loading && !disabled && unavailable && (
        <div className="rp-note rp-warn" role="status" data-testid="replays-unavailable">
          <strong>We could not load your recordings just now.</strong>
          {' '}
          This is a problem on our side, not a sign that the class was not recorded. Please try again shortly.
        </div>
      )}

      {!loading && !disabled && !unavailable && replays.length === 0 && (
        <p className="rp-note" data-testid="replays-empty">
          No recordings are ready yet. A class appears here once its recording has been processed.
        </p>
      )}

      {!disabled && !unavailable && replays.length > 0 && (
        <div className="rp-list" data-testid="replays-list">
          {replays.map((r) => <ReplayCard key={r.id} replay={r} />)}
        </div>
      )}
    </section>
  );
}
