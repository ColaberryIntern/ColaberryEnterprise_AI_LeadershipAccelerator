import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The four numbers at the top of the Marketing overview.
 *
 * From Ali's prototype (2026-10-07), which opens the section with a row of counts before the
 * worklist. His mock showed "Posts in progress" and "Live landing pages" among them; neither is
 * available from the overview this page already loads, and inventing a number to fill a tile is
 * the exact failure this project keeps finding. So the tiles are the four the page can source
 * honestly from data it already has, and no request was added to produce them.
 *
 * EVERY TILE IS A DOOR. That is an existing property of this page - its suite pins that the
 * overview links to the composer, the calendar, brands and performance even when empty - so a
 * count that cannot be clicked would be a step backwards.
 *
 * A NUMBER THAT IS NOT WORKING IS OMITTED, NOT SOFTENED. When the overview failed to load there
 * is no honest value for any of these, and "0 scheduled" is a confident lie: it is
 * indistinguishable from an empty calendar. The whole row is absent in that case, which the
 * surrounding error message already explains.
 */

export interface MarketingStatTilesProps {
  /** Null while loading or after a failure - the row renders nothing rather than guessing. */
  scheduled: number | null;
  pastDue: number | null;
  publishableChannels: number | null;
  publishedRecently: number | null;
  recentWindowDays: number;
}

interface Tile {
  value: number;
  label: string;
  to: string;
  tone?: 'warn';
  testid: string;
}

export default function MarketingStatTiles(props: MarketingStatTilesProps) {
  const { scheduled, pastDue, publishableChannels, publishedRecently, recentWindowDays } = props;

  // One missing value means the overview did not load, so none of them can be trusted.
  if (scheduled === null || pastDue === null || publishableChannels === null || publishedRecently === null) {
    return null;
  }

  const tiles: Tile[] = [
    { value: scheduled, label: 'Scheduled', to: '/admin/marketing/calendar', testid: 'stat-scheduled' },
    // Only called out when there IS one: a permanent "0 past due" trains people to stop reading
    // the row, and this is the number that should stand out on the day it is not zero.
    ...(pastDue > 0
      ? [{ value: pastDue, label: 'Past due', to: '/admin/marketing/content', tone: 'warn' as const, testid: 'stat-past-due' }]
      : []),
    { value: publishableChannels, label: 'Channels that can publish', to: '/admin/marketing/brands', testid: 'stat-channels' },
    { value: publishedRecently, label: `Published in ${recentWindowDays} days`, to: '/admin/marketing/performance', testid: 'stat-published' },
  ];

  return (
    <div className="row g-2 mb-3" data-testid="marketing-stat-tiles">
      {tiles.map((t) => (
        <div className="col-6 col-lg-3" key={t.testid}>
          <Link
            to={t.to}
            className="d-block text-decoration-none border rounded-3 bg-white p-3 h-100"
            data-testid={t.testid}
          >
            <span
              className={`d-block fw-bold lh-1 ${t.tone === 'warn' ? 'text-danger' : 'text-body'}`}
              style={{ fontSize: '1.6rem', fontVariantNumeric: 'tabular-nums' }}
            >
              {t.value}
            </span>
            <span className="d-block small text-muted mt-1">{t.label}</span>
          </Link>
        </div>
      ))}
    </div>
  );
}

/**
 * How many scheduled posts are already late.
 *
 * COUNTS THE SERVER'S OWN VERDICT rather than recomputing it. `UpcomingPost.late` is decided
 * backend-side and is what the row beneath this tile renders its "Late" badge from; comparing
 * `scheduled_for` to the browser's clock here would be a second, independent answer to the same
 * question, and the two would disagree the moment a laptop's clock drifted or the user sat in
 * another timezone. A tile saying 2 above a list showing 3 badges is worse than no tile.
 */
export function countPastDue(upcoming: Array<{ late: boolean }>): number {
  return upcoming.filter((p) => p.late).length;
}
