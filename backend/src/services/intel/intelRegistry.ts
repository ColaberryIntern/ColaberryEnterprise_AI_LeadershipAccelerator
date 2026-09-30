/**
 * intelRegistry — the pure, DB-free core of the generic intelligence engine:
 * the source-adapter contract, a module-level registry, and the cost-gate helper.
 *
 * Kept import-clean (no DB, no LLM, no I/O) for the same reason aiNewsBootDecision
 * is its own file: the registry and the gating rule are then unit-testable in
 * isolation, and intelPipeline stays a thin orchestrator that re-exports this
 * public surface. Adapters and the engine both depend on this; it depends on
 * nothing in the repo.
 */

/** A source-normalized item, pre-persistence — the adapter's collect() output. */
export interface NormalizedIntelItem {
  guid: string;                 // stable dedup key, namespaced by source
  source: string;               // sub-source label, e.g. 'Anthropic'
  title: string;
  url: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
}

/**
 * One content generator, expressed as a thin adapter over the generic engine.
 * `slug` is the pipeline id AND the curriculum-type slug (used to resolve the
 * generation prompt and stamp timeline_cards.type). The two `*Env` names are the
 * env vars that gate cost and bound per-run spend, so each source is independently
 * switchable in prod without a code change.
 */
export interface IntelSourceConfig {
  slug: string;
  label: string;
  enableEnv: string;            // env var gating cost-bearing materialization
  maxPerRunEnv: string;         // env var bounding cards materialized per run
  catchupStaleHours?: number;   // boot catch-up staleness window (default 20h)
  collect(): Promise<NormalizedIntelItem[]>;
  rank?(item: NormalizedIntelItem, now: Date): number;
}

/** Outcome of one runIntelPipeline() run. */
export interface IntelRunResult {
  slug: string;
  found: number;
  inserted: number;
  updated: number;
  carded: number;
  collectFailed: boolean;
}

/** Default staleness window (hours) before a boot triggers a catch-up materialize.
 *  Matches the AI News Flash BOOT_CATCHUP_STALE_HOURS default (24h cron + margin). */
export const DEFAULT_CATCHUP_STALE_HOURS = 20;

// ---- Registry --------------------------------------------------------------

const registry = new Map<string, IntelSourceConfig>();

/** Register (or replace) a source adapter, keyed by its slug. Last write wins so
 *  a re-import during hot-reload is idempotent rather than throwing. */
export function registerIntelSource(cfg: IntelSourceConfig): void {
  if (!cfg || !cfg.slug) throw new Error('registerIntelSource: a non-empty slug is required');
  if (typeof cfg.collect !== 'function') throw new Error(`registerIntelSource(${cfg.slug}): collect() is required`);
  registry.set(cfg.slug, cfg);
}

export function getIntelSource(slug: string): IntelSourceConfig | undefined {
  return registry.get(slug);
}

export function listIntelSources(): IntelSourceConfig[] {
  return Array.from(registry.values());
}

/** Test/support hook — clear the registry. Not used in production paths. */
export function clearIntelSources(): void {
  registry.clear();
}

// ---- Cost gate (pure, env-injectable) --------------------------------------

/**
 * Resolve the cost gate + per-run card cap for a run. Pure and env-injectable so
 * the rule is unit-testable without a DB.
 *
 * - materializeOn = opts.force OR env[cfg.enableEnv] === 'true'  (cost gate)
 * - maxCards      = opts.maxCards, else env[cfg.maxPerRunEnv], else 1 (code floor)
 *
 * A non-finite or <= 0 env value falls back to the floor (fail-safe: a typo'd
 * MAX_PER_RUN can never widen spend, and it can never round to zero and stall).
 */
export function resolveMaterialization(
  cfg: Pick<IntelSourceConfig, 'enableEnv' | 'maxPerRunEnv'>,
  opts: { maxCards?: number; force?: boolean } = {},
  env: NodeJS.ProcessEnv = process.env,
): { materializeOn: boolean; maxCards: number } {
  const materializeOn = Boolean(opts.force) || env[cfg.enableEnv] === 'true';
  let maxCards = opts.maxCards ?? Number(env[cfg.maxPerRunEnv] || 1);
  if (!Number.isFinite(maxCards) || maxCards <= 0) maxCards = 1;
  return { materializeOn, maxCards: Math.floor(maxCards) };
}
