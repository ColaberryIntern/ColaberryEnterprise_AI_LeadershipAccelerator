/**
 * feedConfigService — the GLOBAL feed policy for the Feed Control plane.
 *
 * One tunable policy object, persisted as a single `SystemSetting` row
 * (key `feed_control_policy`) so it survives restarts and is edited from the
 * Feed Control board. It holds the knobs that used to be hardcoded constants:
 * the Today cadence (was `CADENCE = 2`), the ambient provider list (was the
 * hardcoded `AMBIENT_PROVIDERS` array), default frequency caps/cooldowns, the
 * recency half-life, and the priority weight the rule-based ranker uses.
 *
 * These are the admin-set INPUTS to the transparent rule-based ranker
 * (feedRanker.ts). An ML value model can later read the same policy.
 */
import { getSetting, setSetting } from '../settingsService';

export type AmbientProviderSlug = 'blog' | 'podcast' | 'testimonial';

export interface FeedPolicy {
  /** Today feed: place this many anchored (curriculum) items between each ambient injection. */
  todayCadence: number;
  /** Which ambient providers rotate into Today (subset of the 3 real pickers). */
  ambientProviders: AmbientProviderSlug[];
  /** Default max times an item may be shown to one student (0 = unlimited). */
  defaultFrequencyCap: number;
  /** Default minimum days before a shown item can reappear (0 = no cooldown). */
  defaultCooldownDays: number;
  /** Recency decay half-life in days — older items score lower. */
  recencyHalfLifeDays: number;
  /** 0..1 — fraction of slots reserved for fresh/exploratory items. */
  explorationPct: number;
  /** How strongly a card's `priority` (0..100) boosts its rank. */
  priorityWeight: number;
}

export const DEFAULT_FEED_POLICY: FeedPolicy = {
  todayCadence: 2, // matches the legacy hardcoded CADENCE so flag-off ≡ current behavior
  ambientProviders: ['blog', 'podcast', 'testimonial'],
  defaultFrequencyCap: 0,
  defaultCooldownDays: 0,
  recencyHalfLifeDays: 21,
  explorationPct: 0.15,
  priorityWeight: 0.02,
};

const POLICY_KEY = 'feed_control_policy';
const VALID_PROVIDERS: AmbientProviderSlug[] = ['blog', 'podcast', 'testimonial'];

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}
function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

/** Coerce an arbitrary stored/patch object into a valid, clamped FeedPolicy. */
export function normalizePolicy(raw: Partial<FeedPolicy> | null | undefined): FeedPolicy {
  const p = raw && typeof raw === 'object' ? raw : {};
  const providers = Array.isArray(p.ambientProviders)
    ? (p.ambientProviders.filter((x) => VALID_PROVIDERS.includes(x as AmbientProviderSlug)) as AmbientProviderSlug[])
    : DEFAULT_FEED_POLICY.ambientProviders;
  return {
    todayCadence: clampInt(p.todayCadence, 1, 20, DEFAULT_FEED_POLICY.todayCadence),
    ambientProviders: providers.length ? providers : [], // [] = ambient off (pure curriculum)
    defaultFrequencyCap: clampInt(p.defaultFrequencyCap, 0, 100, DEFAULT_FEED_POLICY.defaultFrequencyCap),
    defaultCooldownDays: clampInt(p.defaultCooldownDays, 0, 365, DEFAULT_FEED_POLICY.defaultCooldownDays),
    recencyHalfLifeDays: clampInt(p.recencyHalfLifeDays, 1, 365, DEFAULT_FEED_POLICY.recencyHalfLifeDays),
    explorationPct: clampNum(p.explorationPct, 0, 1, DEFAULT_FEED_POLICY.explorationPct),
    priorityWeight: clampNum(p.priorityWeight, 0, 1, DEFAULT_FEED_POLICY.priorityWeight),
  };
}

/** Read the live policy (defaults merged with any stored overrides). Never throws. */
export async function getFeedPolicy(): Promise<FeedPolicy> {
  try {
    const stored = await getSetting(POLICY_KEY);
    return normalizePolicy(stored && typeof stored === 'object' ? { ...DEFAULT_FEED_POLICY, ...stored } : DEFAULT_FEED_POLICY);
  } catch {
    return { ...DEFAULT_FEED_POLICY };
  }
}

/** Merge a partial patch into the live policy and persist it. Returns the new policy. */
export async function setFeedPolicy(patch: Partial<FeedPolicy>, adminId?: string): Promise<FeedPolicy> {
  const current = await getFeedPolicy();
  const next = normalizePolicy({ ...current, ...patch });
  await setSetting(POLICY_KEY, next, adminId);
  return next;
}
