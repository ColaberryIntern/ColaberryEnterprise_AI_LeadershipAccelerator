/**
 * Enrollment target planning math (kit SPEC 4.11). Pure. It is a planning scenario, not a forecast, and the assumed
 * conversion rate is always shown next to it.
 *   remaining        = max(0, target - confirmed paid)
 *   daily required   = ceil(remaining / days left)
 *   prospects needed = ceil(remaining / assumed rate)
 * Invalid inputs throw ValidationError rather than producing a number nobody can trust.
 */
export class ValidationError extends Error {
  readonly error_class = 'ValidationError';
}

export interface TargetPlan { remaining: number; daily_required: number; prospects_needed: number }

export function planTarget(target: number, confirmedPaid: number, daysLeft: number, assumedRate: number): TargetPlan {
  if (!Number.isInteger(target) || target <= 0) throw new ValidationError('target must be a positive whole number');
  if (!Number.isInteger(confirmedPaid) || confirmedPaid < 0) throw new ValidationError('confirmed paid must be zero or more');
  if (!Number.isInteger(daysLeft) || daysLeft < 1) throw new ValidationError('days left must be at least 1');
  if (!(assumedRate > 0 && assumedRate <= 1)) throw new ValidationError('assumed conversion rate must be above 0 and at most 1');
  const remaining = Math.max(0, target - confirmedPaid);
  // Round before ceil so binary fractions (148 / 0.08 = 1849.9999999999998) do not lose a whole prospect.
  const ceil = (x: number) => Math.ceil(Math.round(x * 1e9) / 1e9);
  return { remaining, daily_required: ceil(remaining / daysLeft), prospects_needed: ceil(remaining / assumedRate) };
}
