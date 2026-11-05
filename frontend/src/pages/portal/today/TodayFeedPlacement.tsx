import React from 'react';

/**
 * Where the timeline sits in Today's main column (C110).
 *
 * Before an Explorer's first win the server sends a five-item starter feed (C107). At the bottom of Today it started
 * about 5,100px down an 8,500px page, and none of the first 19 ad Explorers ever scrolled to it (0 "seen" events),
 * so the test could not be read. Until the first win it goes first in the column, directly under the first-lesson
 * banner; afterwards it returns to the bottom, where it always was.
 *
 * Only one copy ever renders, so the `te-timeline-anchor` scroll target stays unique.
 */
export interface TodayFeedPlacementProps {
  /** True only for an Explorer the server says has no first win yet (`needsFirstWin`). */
  starterFirst: boolean;
  timeline: React.ReactNode;
  children: React.ReactNode;
}

const TodayFeedPlacement: React.FC<TodayFeedPlacementProps> = ({ starterFirst, timeline, children }) => (
  <>
    {starterFirst && timeline}
    {children}
    {!starterFirst && timeline}
  </>
);

export default TodayFeedPlacement;
