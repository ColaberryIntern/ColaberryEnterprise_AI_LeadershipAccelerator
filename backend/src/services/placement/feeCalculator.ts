/**
 * Career Prep v27, CP10.1 (kit F7, "Offers and fees"): the placement fee, PURE (no I/O, no clock). The kit verbatim:
 *
 *   FEE_RATE = 1.1            110% of first-year salary: one constant, shown everywhere (here: the setting
 *                             `placement_fee_rate`, default 1.1, read by offerService.ts and passed in)
 *   WEEKS = 52
 *   firstYear = basis === 'hourly' ? rate x hours x WEEKS : salary
 *   fee = firstYear x FEE_RATE  "Charged only if the candidate accepts. Bonus and benefits are not included."
 *
 * Money is integer CENTS end to end (never floating dollars). The fee is rounded half up at the half cent:
 * fee_cents = floor((first_year_cents x rate_bp + 5000) / 10000), with the rate in basis points (1.1 = 11000).
 * Limits (D3: base salary only; a value outside them is a typing mistake, refused with a reason, never clamped):
 * yearly salary above $0 and at most $2,000,000; hourly rate above $0 and at most $1,000; 1 to 80 hours a week;
 * the rate itself above 1.0 and at most 3.0 (a setting outside that is ignored by the reader, which uses 1.1).
 */
export const DEFAULT_FEE_RATE = 1.1;
export const WEEKS = 52;
export const MAX_SALARY_CENTS = 2_000_000 * 100;
export const MAX_HOURLY_CENTS = 1_000 * 100;
export const MAX_HOURS = 80;
export const MIN_RATE = 1.0;
export const MAX_RATE = 3.0;

export type Pay = { basis: 'yearly'; salaryCents: number } | { basis: 'hourly'; rateCents: number; hoursPerWeek: number };
export interface Fee { firstYearCents: number; feeCents: number; rateBp: number }
export type FeeResult = { ok: true; fee: Fee } | { ok: false; reason: string };

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/** null = the pay is valid; otherwise the plain reason it is not. */
export function payProblem(p: Pay): string | null {
  if (p.basis === 'yearly') {
    if (!whole(p.salaryCents) || p.salaryCents <= 0) return 'The yearly salary must be more than $0.';
    if (p.salaryCents > MAX_SALARY_CENTS) return 'The yearly salary can be at most $2,000,000.';
    return null;
  }
  if (p.basis !== 'hourly') return 'Pay must be a yearly salary or an hourly rate.';
  if (!whole(p.rateCents) || p.rateCents <= 0) return 'The hourly rate must be more than $0.';
  if (p.rateCents > MAX_HOURLY_CENTS) return 'The hourly rate can be at most $1,000.';
  if (typeof p.hoursPerWeek !== 'number' || !Number.isFinite(p.hoursPerWeek) || p.hoursPerWeek < 1 || p.hoursPerWeek > MAX_HOURS) return 'Hours a week must be 1 to 80.';
  if (Math.round(p.hoursPerWeek * 10) !== p.hoursPerWeek * 10) return 'Hours a week can have at most one decimal place.';
  return null;
}

export const validRate = (rate: unknown): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > MIN_RATE && rate <= MAX_RATE;

/** First-year salary in cents: the salary, or rate x hours x 52 (hours in tenths, so the product stays whole). */
export function firstYearCents(p: Pay): number {
  return p.basis === 'yearly' ? p.salaryCents : (p.rateCents * Math.round(p.hoursPerWeek * 10) * WEEKS) / 10;
}

export function computeFee(p: Pay, rate: number = DEFAULT_FEE_RATE): FeeResult {
  const problem = payProblem(p);
  if (problem) return { ok: false, reason: problem };
  if (!validRate(rate)) return { ok: false, reason: 'The fee rate must be above 1.0 and at most 3.0.' };
  const rateBp = Math.round(rate * 10_000);
  const fy = Math.round(firstYearCents(p));
  return { ok: true, fee: { firstYearCents: fy, feeCents: Math.floor((fy * rateBp + 5_000) / 10_000), rateBp } };
}

/** "$115,500" or "$71,500.50": dollars with cents only when there are any. */
export function money(cents: number): string {
  const d = Math.floor(cents / 100); const c = cents % 100;
  return `$${d.toLocaleString('en-US')}${c ? `.${String(c).padStart(2, '0')}` : ''}`;
}
