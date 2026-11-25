/**
 * The one query behind the brand headings: what each brand is actually called.
 *
 * ── WHY THIS READS THE DATABASE FOR WHAT LOOKS LIKE A CONSTANT ───────────────────────────
 *
 * The mapping from stream to brand is a decision and lives in code (`streamBrands.ts`). The
 * brand's NAME and URL are not a decision, they are data: they live in the `brands` table,
 * the Brands admin page renders them from there, and operators can change them. Hardcoding
 * "Refactored.ai" beside a Brands page that says something else is the duplicate-source-of-
 * truth failure this repo has already paid for more than once, and the first anybody would
 * know of the drift is two screens disagreeing about a heading.
 *
 * So the slug is declared and the wording is read. `streamBrands` carries a fallback label
 * per slug, used only when this read fails or the row is missing, and the group it builds
 * then carries `resolved: false` so the page can say the name may be out of date rather than
 * presenting a guess as the brand's own name.
 *
 * ── SCOPED TO THE SLUGS THE BOARD USES ───────────────────────────────────────────────────
 *
 * Production holds eight brands and this board files streams under three. Selecting all of
 * them and filtering in memory would work, but asking for exactly what is needed keeps the
 * query honest about its purpose and means a new brand appearing in the table cannot change
 * what this page shows without someone editing the map.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { BRAND_BY_STREAM, UNASSIGNED_BRAND_KEY } from './streamBrands';
import type { BrandDirectoryEntry, BrandKey } from './streamBrands';

interface RawBrand {
  slug: string;
  name: string | null;
  default_public_url: string | null;
  status: string | null;
}

/**
 * Every brand slug this board files a stream under, de-duplicated, excluding the bucket.
 *
 * The predicate narrows to `BrandKey`, not `string`. R25 Phase 2 gave `BRAND_BY_STREAM` a
 * typed value so a mistyped slug would be a compile error, and this is where that type has to
 * be acknowledged rather than widened back out: a `s is string` predicate over a union of
 * literals is not assignable to its own parameter, which is what CI caught.
 */
export function brandSlugsInUse(): BrandKey[] {
  const slugs = Object.values(BRAND_BY_STREAM)
    .filter((s): s is BrandKey => Boolean(s) && s !== UNASSIGNED_BRAND_KEY);
  return Array.from(new Set(slugs)).sort();
}

/**
 * Read the brands this board needs.
 *
 * `IN (:slugs)` rather than `= ANY(:slugs)`: Sequelize expands an array replacement into a
 * parenthesised list, which `ANY` cannot take, and the resulting error is a confusing syntax
 * failure at run time rather than anything visible here.
 *
 * Returns the rows it found. A slug with no row is simply absent, which the caller renders
 * as an unresolved heading rather than as a missing brand.
 */
export async function getBrandDirectory(): Promise<BrandDirectoryEntry[]> {
  const slugs = brandSlugsInUse();
  if (slugs.length === 0) return [];

  const rows = await sequelize.query<RawBrand>(
    `SELECT slug, name, default_public_url, status
       FROM brands
      WHERE slug IN (:slugs)`,
    { type: QueryTypes.SELECT, replacements: { slugs } },
  );

  return rows
    .filter((r) => Boolean(r.slug) && Boolean(r.name))
    .map((r) => ({
      slug: r.slug,
      name: (r.name as string).trim(),
      url: r.default_public_url?.trim() || null,
      status: r.status ?? 'unknown',
    }));
}
