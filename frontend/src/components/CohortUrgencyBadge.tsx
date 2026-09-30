import React, { useState, useEffect } from 'react';
import { computeUrgency, UrgencyResult } from '../services/cohortUrgencyService';
import api from '../utils/api';
import { selectNextCohort } from '../utils/cohortSelection';

interface CohortUrgencyBadgeProps {
  /** Pass directly if cohort data is already loaded (e.g. EnrollPage) */
  startDate?: string;
  seatsRemaining?: number;
  className?: string;
}

/**
 * Displays a scarcity/urgency badge for the nearest open cohort.
 * Self-fetching: if startDate/seatsRemaining are not provided, fetches from /api/cohorts.
 * Renders nothing if no cohorts are available.
 */
function CohortUrgencyBadge({ startDate, seatsRemaining, className = '' }: CohortUrgencyBadgeProps) {
  const [urgency, setUrgency] = useState<UrgencyResult | null>(null);

  useEffect(() => {
    if (startDate !== undefined && seatsRemaining !== undefined) {
      setUrgency(computeUrgency(startDate, seatsRemaining));
      return;
    }

    api.get('/api/cohorts')
      .then((res) => {
        const next = selectNextCohort(res.data.cohorts);
        if (next) {
          setUrgency(computeUrgency(next.start_date, next.max_seats - next.seats_taken));
        }
      })
      .catch(() => {});
  }, [startDate, seatsRemaining]);

  if (!urgency) return null;

  return (
    <span className={`badge rounded-pill px-3 py-2 ${urgency.badgeClass} ${className}`}>
      {urgency.message}
    </span>
  );
}

export default CohortUrgencyBadge;
