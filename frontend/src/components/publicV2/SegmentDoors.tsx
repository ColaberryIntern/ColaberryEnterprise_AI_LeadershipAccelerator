import React from 'react';
import { Link } from 'react-router-dom';
import { readySegments } from '../../config/v2Segments';
import { trackEvent } from '../../utils/tracker';
import './segmentDoors.css';

/**
 * SegmentDoors — the C5.1 information architecture, on the homepage (C5.2).
 *
 * ## What this replaced, and why
 *
 * It replaces the goal picker, which asked "what are you trying to accomplish?" and routed
 * the visitor by GOAL. The IA says SEGMENT. The picker was doing the right job on the wrong
 * axis, and the homepage section budget has a standing rule that the next section added
 * must replace one rather than extend the count again. So this is a swap, not an addition,
 * and the budget stays at twelve.
 *
 * ## It is generated, and that is the safety property
 *
 * The doors come from `readySegments()`, which is the SAME source `App.tsx` maps to routes.
 * A door therefore cannot point at a page that is not mounted: if a segment is not ready it
 * has no route and no door, and both facts come from one line of content. Government is
 * currently `ready: false`, so it has neither, which is deliberate - a half-written segment
 * page should not be reachable from the homepage.
 *
 * Listing a fifth door for a page that does not exist would be the obvious way to "complete"
 * the five-door IA and the wrong one.
 */
export default function SegmentDoors(): React.ReactElement {
  const segments = readySegments();

  return (
    <div className="cbv2-doors" role="list">
      {segments.map((s) => (
        <Link
          key={s.slug}
          to={`/${s.slug}`}
          role="listitem"
          className="cbv2-door"
          data-track={`home_door_${s.slug}`}
          onClick={() => trackEvent('cta_click', {
            cta_name: 'home_segment_door',
            segment: s.slug,
            page: '/',
          })}
        >
          <span className="cbv2-door__name">{s.name}</span>
          <span className="cbv2-door__noun">{s.noun}</span>
          <span className="cbv2-door__go" aria-hidden="true">&rarr;</span>
        </Link>
      ))}
    </div>
  );
}
