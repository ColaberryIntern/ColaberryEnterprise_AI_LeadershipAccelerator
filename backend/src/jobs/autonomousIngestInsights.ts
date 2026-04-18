import fs from 'fs';
import path from 'path';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { LeadSource, RoutingRule, EntryPoint } from '../models';

export interface IngestInsight {
  id: string;
  type: 'suggest_routing_rule' | 'suggest_field_map_entry' | 'info';
  title: string;
  description: string;
  suggested_config: Record<string, any> | null;
  evidence: Record<string, any>;
  generated_at: string;
  applied: boolean;
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const OUT_FILE = path.join(DATA_DIR, 'autonomous_insights.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readInsights(): IngestInsight[] {
  try {
    if (!fs.existsSync(OUT_FILE)) return [];
    const raw = fs.readFileSync(OUT_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function writeInsights(insights: IngestInsight[]) {
  ensureDir();
  fs.writeFileSync(OUT_FILE, JSON.stringify(insights, null, 2));
}

/**
 * Heuristic 1: any source that has accepted ≥ 20 leads in the last 30 days
 * and has no routing rules mentioning its slug gets a "default routing rule"
 * suggestion (notify_sales).
 */
async function suggestDefaultRoutingRules(): Promise<IngestInsight[]> {
  const sources = await LeadSource.findAll({ where: { is_active: true } });
  const rules = await RoutingRule.findAll({ where: { is_active: true } });

  const insights: IngestInsight[] = [];

  for (const source of sources) {
    const mentions = rules.some(r => {
      const c = r.conditions as any;
      return c?.source_slug === source.slug;
    });
    if (mentions) continue;

    const rows = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM raw_lead_payloads
       WHERE source_slug = :slug AND status = 'accepted'
         AND received_at >= NOW() - INTERVAL '30 days'`,
      { type: QueryTypes.SELECT, replacements: { slug: source.slug } }
    );
    const count = Number(rows[0]?.count || 0);
    if (count < 20) continue;

    insights.push({
      id: `rule-${source.slug}-${Date.now()}`,
      type: 'suggest_routing_rule',
      title: `Add a default routing rule for ${source.name}`,
      description: `${count} leads have been accepted from ${source.slug} in the last 30 days, but no routing rule mentions this source. A default "notify_sales" rule would surface new leads to the team.`,
      suggested_config: {
        name: `${source.name} — default notify`,
        priority: 200,
        conditions: { source_slug: source.slug },
        actions: [{ type: 'notify_sales', channel: 'email' }],
        continue_on_match: false,
        is_active: true,
      },
      evidence: { source_slug: source.slug, leads_30d: count },
      generated_at: new Date().toISOString(),
      applied: false,
    });
  }
  return insights;
}

/**
 * Heuristic 2: top unmapped metadata keys per entry point — if a key shows up
 * in ≥ 10 accepted payloads and isn't in the field_map, suggest adding it.
 */
async function suggestFieldMapEntries(): Promise<IngestInsight[]> {
  const rows = await sequelize.query<{ source_slug: string; entry_slug: string; key: string; n: string }>(
    `SELECT rlp.source_slug, rlp.entry_slug, jsonb_object_keys(rlp.body) AS key, COUNT(*)::text AS n
     FROM raw_lead_payloads rlp
     WHERE rlp.status = 'accepted'
       AND rlp.received_at >= NOW() - INTERVAL '30 days'
       AND rlp.body IS NOT NULL
     GROUP BY rlp.source_slug, rlp.entry_slug, jsonb_object_keys(rlp.body)
     HAVING COUNT(*) >= 10`,
    { type: QueryTypes.SELECT }
  );

  const insights: IngestInsight[] = [];
  for (const r of rows) {
    if (!r.source_slug || !r.entry_slug) continue;
    const source = await LeadSource.findOne({ where: { slug: r.source_slug } });
    if (!source) continue;
    const entry = await EntryPoint.findOne({ where: { source_id: source.id, slug: r.entry_slug } });
    if (!entry) continue;

    insights.push({
      id: `field-${r.source_slug}-${r.entry_slug}-${r.key}`,
      type: 'suggest_field_map_entry',
      title: `Map "${r.key}" for ${r.source_slug}/${r.entry_slug}`,
      description: `The key "${r.key}" appears in ${r.n} accepted payloads for this entry point but is currently falling through to metadata. Consider adding an explicit mapping.`,
      suggested_config: {
        entry_point_id: entry.id,
        field_map_entry: { [r.key]: `metadata.${r.key}` },
      },
      evidence: { source_slug: r.source_slug, entry_slug: r.entry_slug, key: r.key, occurrences_30d: Number(r.n) },
      generated_at: new Date().toISOString(),
      applied: false,
    });
  }
  return insights;
}

export async function runInsightsJob(): Promise<IngestInsight[]> {
  const existing = readInsights();
  const existingIds = new Set(existing.map(i => i.id));

  const [rules, fields] = await Promise.all([
    suggestDefaultRoutingRules().catch((err) => { console.warn('[Insights] rules failed:', err?.message); return []; }),
    suggestFieldMapEntries().catch((err) => { console.warn('[Insights] fields failed:', err?.message); return []; }),
  ]);

  const fresh = [...rules, ...fields].filter(i => !existingIds.has(i.id));
  // Keep existing records (including applied: true) so the UI can show history,
  // but cap retention to 200 most-recent entries.
  const merged = [...fresh, ...existing].slice(0, 200);
  writeInsights(merged);

  console.log(`[Insights] Ran job. New=${fresh.length}, total=${merged.length}`);
  return merged;
}

export function markApplied(id: string): IngestInsight | null {
  const list = readInsights();
  const found = list.find(i => i.id === id);
  if (!found) return null;
  found.applied = true;
  writeInsights(list);
  return found;
}
