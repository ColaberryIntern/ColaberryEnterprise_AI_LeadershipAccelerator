import React, { useState, useEffect } from 'react';
import { computeUrgency, UrgencyResult } from '../services/cohortUrgencyService';
import { Cohort } from '../models/Cohort';
import api from '../utils/api';

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
        const today = new Date().toISOString().split('T')[0];
        const open = (res.data.cohorts || [])
          .filter((c: Cohort) => c.seats_taken < c.max_seats && c.start_date >= today)
          .sort((a: Cohort, b: Cohort) => a.start_date.localeCompare(b.start_date));

        if (open.length > 0) {
          const next = open[0];
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
