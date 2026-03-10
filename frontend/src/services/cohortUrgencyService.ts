export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface UrgencyResult {
  level: UrgencyLevel;
  message: string;
  badgeClass: string;
}

export function computeUrgency(startDate: string, seatsRemaining: number): UrgencyResult {
  const daysUntilStart = Math.ceil(
    (new Date(startDate + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (seatsRemaining < 5) {
    return {
      level: 'HIGH',
      message: `Only ${seatsRemaining} seat${seatsRemaining !== 1 ? 's' : ''} remaining`,
      badgeClass: 'bg-danger',
    };
  }

  if (daysUntilStart < 14) {
    return {
      level: 'MEDIUM',
      message: `Starts in ${daysUntilStart} day${daysUntilStart !== 1 ? 's' : ''}`,
      badgeClass: 'bg-warning text-dark',
    };
  }

  return {
    level: 'LOW',
    message: `Next cohort: ${new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    badgeClass: 'bg-info',
  };
}
