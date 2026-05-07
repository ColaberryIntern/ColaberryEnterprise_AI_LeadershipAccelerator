/**
 * telemetryFreshnessMonitor — categorizes manifest age + computes freshness
 * scores that feed sync health.
 *
 * Contract: BUILD_MANIFEST_CONTRACT.md §8 (Freshness)
 */

export type FreshnessBucket = 'fresh' | 'aging' | 'stale' | 'expired';

export interface FreshnessResult {
  readonly total: number;
  readonly fresh: number;
  readonly aging: number;
  readonly stale: number;
  readonly expired: number;
  /** 0-100. 100 = all manifests fresh. */
  readonly score: number;
  readonly oldest_age_ms: number | null;
  readonly newest_age_ms: number | null;
}

const FRESH_MS = 24 * 60 * 60 * 1000;       // 24h
const AGING_MS = 7 * 24 * 60 * 60 * 1000;   // 7d
const STALE_MS = 30 * 24 * 60 * 60 * 1000;  // 30d

export function classifyAge(ageMs: number): FreshnessBucket {
  if (ageMs <= FRESH_MS) return 'fresh';
  if (ageMs <= AGING_MS) return 'aging';
  if (ageMs <= STALE_MS) return 'stale';
  return 'expired';
}

/**
 * Pure: takes a list of manifest ages (ms) and returns aggregated freshness.
 */
export function scoreFreshnessFromAges(ages: ReadonlyArray<number>): FreshnessResult {
  if (ages.length === 0) {
    return {
      total: 0, fresh: 0, aging: 0, stale: 0, expired: 0,
      score: 0,
      oldest_age_ms: null, newest_age_ms: null,
    };
  }

  let fresh = 0, aging = 0, stale = 0, expired = 0;
  let oldest = 0, newest = Number.POSITIVE_INFINITY;
  for (const age of ages) {
    if (age > oldest) oldest = age;
    if (age < newest) newest = age;
    const bucket = classifyAge(age);
    if (bucket === 'fresh') fresh++;
    else if (bucket === 'aging') aging++;
    else if (bucket === 'stale') stale++;
    else expired++;
  }

  // Weighted score: fresh=1, aging=0.7, stale=0.3, expired=0.
  const weighted = fresh * 1 + aging * 0.7 + stale * 0.3 + expired * 0;
  const score = Math.round((weighted / ages.length) * 100);

  return {
    total: ages.length,
    fresh, aging, stale, expired,
    score,
    oldest_age_ms: oldest,
    newest_age_ms: Number.isFinite(newest) ? newest : null,
  };
}

/**
 * DB-backed: looks up all manifests for a project and scores freshness.
 */
export async function scoreFreshnessForProject(projectId: string): Promise<FreshnessResult> {
  const { default: BuildManifest } = await import('../../../models/BuildManifest');
  const rows = await BuildManifest.findAll({
    where: { project_id: projectId },
    attributes: ['execution_timestamp'],
  });
  const now = Date.now();
  const ages = rows.map((r: any) => now - new Date(r.execution_timestamp).getTime());
  return scoreFreshnessFromAges(ages);
}
