import { z } from 'zod';

/**
 * The one shape every spend writer produces - a typed entry, a CSV line, a Marketing API row -
 * validated by one schema, so the three writers cannot drift into three meanings of "spend".
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const PLATFORMS = ['meta', 'google', 'linkedin', 'tiktok', 'other'] as const;
export type Platform = typeof PLATFORMS[number];

export const SpendInputSchema = z.object({
  platform: z.enum(PLATFORMS),
  accountId: z.string().trim().max(40).nullable().optional(),
  // The value that appears in the ad's utm_campaign: the platform campaign id, or its name.
  campaignRef: z.string().trim().min(1, 'Campaign id or name is required').max(120),
  campaignName: z.string().trim().max(255).nullable().optional(),
  placement: z.string().trim().toLowerCase().max(30).regex(/^[a-z_]*$/, 'Placement must be a word like facebook or instagram').default(''),
  periodStart: z.string().regex(ISO_DAY, 'Start date must be YYYY-MM-DD'),
  periodEnd: z.string().regex(ISO_DAY, 'End date must be YYYY-MM-DD'),
  // Cents, so $1,234.56 is 123456. Capped at $10M per row: a typo of three extra zeros should fail.
  amountCents: z.number().int().min(0).max(1_000_000_000),
  impressions: z.number().int().min(0).nullable().optional(),
  clicks: z.number().int().min(0).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((v, ctx) => {
  // A real calendar day, not just the right shape: "2026-02-30" would otherwise reach Postgres and 500.
  if (parseDay(v.periodStart) !== v.periodStart) ctx.addIssue({ code: 'custom', path: ['periodStart'], message: 'Start date is not a real date' });
  if (parseDay(v.periodEnd) !== v.periodEnd) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'End date is not a real date' });
  const start = Date.parse(`${v.periodStart}T00:00:00Z`);
  const end = Date.parse(`${v.periodEnd}T00:00:00Z`);
  if (end < start) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'End date is before start date' });
  if (end - start > 366 * 86_400_000) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'A single entry can cover at most a year' });
  // Spend is recorded after it happens. A future day is a typo, and would inflate this week's cost.
  if (start > Date.now() + 86_400_000) ctx.addIssue({ code: 'custom', path: ['periodStart'], message: 'Start date is in the future' });
});

export type SpendInput = z.infer<typeof SpendInputSchema>;

/** "$1,234.56" -> 123456. null when it is not a money amount. */
export function parseMoneyToCents(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}

/** 2026-10-31, 10/31/2026 or 10/31/26 -> '2026-10-31'. null for anything else. */
export function parseDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (us) { m = +us[1]; d = +us[2]; y = us[3].length === 2 ? 2000 + +us[3] : +us[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** "Audience Network" -> 'audience_network'. */
export const normalisePlacement = (raw: string | null | undefined): string =>
  (raw ?? '').trim().toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
