import React from 'react';
import { useCampus } from './CampusContext';
import './campusPageChrome.css';

/**
 * "🗺 Walk the route on the map" under Today's plan (WP-2; the prototype's todayPage button): goes to the campus home and walks to
 * the next step's building. Renders nothing unless the campus is on for this learner and the plan has a next step with a building,
 * so Today is unchanged with the campus off.
 */
export default function CampusWalkRoute(): React.ReactElement | null {
  const { active, planStops, openMap } = useCampus();
  const next = active ? planStops?.find((s) => !s.done && s.buildingId) : undefined;
  if (!next?.buildingId) return null;
  return (
    <button type="button" className="cm-walk-route" onClick={() => openMap(next.buildingId!)} data-testid="cm-walk-route">
      <span aria-hidden="true">🗺 </span>Walk the route on the map
    </button>
  );
}
