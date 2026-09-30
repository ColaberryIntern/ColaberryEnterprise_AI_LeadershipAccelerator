import React, { useEffect, useState } from 'react';
import ClassroomRails from '../../../components/timeline/ClassroomRails';
import { fetchEventsRail, type Rail } from '../classroomRailsApi';

/**
 * Upcoming events on Today — the Classroom's events rail, rendered in the slot
 * the old 3-row text strip occupied, showing the next seven.
 *
 * Ali, 2026-09-11: "instead of showing upcoming events the way it is now, add
 * it how it is in the Classroom, in the same place, with the next 7 events."
 * This is deliberately the SAME component the Classroom renders, fed by the
 * same backend rail, so the two surfaces cannot drift apart in look or data.
 *
 * Renders nothing when there are no events or the fetch fails — Today has
 * plenty of surfaces, and an empty box on the main page is worse than absence.
 */
const NEXT = 7;

const TodayEventsRail: React.FC = () => {
  const [rail, setRail] = useState<Rail | null>(null);

  useEffect(() => {
    let alive = true;
    fetchEventsRail(NEXT).then((r) => { if (alive) setRail(r); });
    return () => { alive = false; };
  }, []);

  if (!rail || !rail.tiles?.length) return null;
  return <ClassroomRails rail={rail} />;
};

export default TodayEventsRail;
