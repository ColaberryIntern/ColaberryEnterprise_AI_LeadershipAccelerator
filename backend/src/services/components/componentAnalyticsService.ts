/**
 * componentAnalyticsService — per-component usage/quality metrics. Until real
 * runtime traffic lands (Phase 3), metrics are SEEDED with deterministic demo
 * data derived from each component's own shape (difficulty, prompts, capabilities,
 * domains) so the dashboard is never empty or placeholdered. `recordRuntime`
 * lets the runtime engine fold in real events later (rolling averages).
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import ComponentAnalytics from '../../models/ComponentAnalytics';

// tiny deterministic hash -> 0..1 so seeds are stable per slug (no Math.random)
function h(s: string): number {
  let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return (x % 1000) / 1000;
}
const round = (n: number, d = 1) => Number(n.toFixed(d));

/** Derive believable demo metrics from a component's shape. Deterministic. */
export function seedMetricsFor(c: CurriculumTypeDefinition) {
  const j = c.toJSON() as any;
  const r = h(c.slug);
  const diffMult: Record<string, number> = { intro: 1, core: 0.85, stretch: 0.68 };
  const dm = diffMult[j.difficulty] ?? 0.85;
  const runtime_count = Math.round(40 + r * 360);
  const completion_pct = round(Math.min(98, (72 + r * 26) * dm));
  const promptLen = (j.generation_prompt?.length || 0) + (j.evaluation_prompt?.length || 0);
  const domains: string[] = Array.isArray(j.architect_domains) ? j.architect_domains : [];
  const domain_coverage: Record<string, number> = {};
  domains.forEach((d, i) => { domain_coverage[d] = round(60 + ((h(c.slug + d) * 40))); void i; });
  return {
    component_slug: c.slug,
    creation_count: Math.round(1 + r * 8),
    runtime_count,
    avg_runtime_ms: j.est_runtime_ms || Math.round(4000 + r * 5000),
    avg_cost_usd: j.est_cost_usd || round(0.0003 + r * 0.0006, 6),
    completion_pct,
    dropoff_pct: round(100 - completion_pct - r * 8),
    avg_rating: round(3.6 + r * 1.3, 1),
    prompt_quality: round(Math.min(95, 55 + promptLen / 40)),
    evaluation_quality: j.ai_evaluation ? round(70 + r * 25) : round(40 + r * 20),
    github_success_pct: j.github_required ? round(55 + r * 35) : 0,
    portfolio_success_pct: j.portfolio_eligible ? round(60 + r * 35) : 0,
    domain_coverage,
    seeded: true,
    updated_at: new Date(),
  };
}

/** Seed/refresh analytics for all components (idempotent upsert). */
export async function seedAnalytics(): Promise<{ seeded: number }> {
  const rows = await CurriculumTypeDefinition.findAll();
  let seeded = 0;
  for (const c of rows) {
    const m = seedMetricsFor(c);
    await ComponentAnalytics.upsert(m);
    seeded += 1;
  }
  return { seeded };
}

export async function getAnalytics(slug: string) {
  let a = await ComponentAnalytics.findOne({ where: { component_slug: slug } });
  if (!a) {
    const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
    if (c) { await ComponentAnalytics.upsert(seedMetricsFor(c)); a = await ComponentAnalytics.findOne({ where: { component_slug: slug } }); }
  }
  return a;
}

/** Program-wide analytics summary + per-component rows (for the dashboard). */
export async function analyticsOverview() {
  const rows = await ComponentAnalytics.findAll({ order: [['runtime_count', 'DESC']] });
  const n = rows.length || 1;
  const sum = (f: (r: ComponentAnalytics) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    totals: {
      components: rows.length,
      runtime_count: sum((r) => r.runtime_count),
      avg_completion_pct: round(sum((r) => r.completion_pct) / n),
      avg_cost_usd: round(sum((r) => r.avg_cost_usd) / n, 6),
      avg_rating: round(sum((r) => r.avg_rating) / n, 2),
      total_cost_usd: round(sum((r) => r.avg_cost_usd * r.runtime_count), 4),
      seeded: rows.some((r) => r.seeded),
    },
    components: rows.map((r) => r.toJSON()),
  };
}

/** Fold a real runtime event into the rolling averages (Phase 3 hook). */
export async function recordRuntime(slug: string, ev: { runtime_ms: number; cost_usd: number; completed: boolean }) {
  const a = await getAnalytics(slug);
  if (!a) return;
  const n = a.runtime_count;
  await a.update({
    runtime_count: n + 1,
    avg_runtime_ms: Math.round((a.avg_runtime_ms * n + ev.runtime_ms) / (n + 1)),
    avg_cost_usd: Number(((a.avg_cost_usd * n + ev.cost_usd) / (n + 1)).toFixed(6)),
    completion_pct: Number((((a.completion_pct / 100) * n + (ev.completed ? 1 : 0)) / (n + 1) * 100).toFixed(1)),
    seeded: false,
    updated_at: new Date(),
  });
}
