import { RoutingRule } from '../models';
import { runAction, ActionContext } from './routingActionsService';

/**
 * Resolve a dotted path like `normalized.metadata.company_size` against a
 * value dictionary. Returns `undefined` when any segment is missing.
 */
function resolvePath(src: Record<string, any>, path: string): any {
  if (!src) return undefined;
  let cur: any = src;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Build the flat fact dictionary a rule's conditions are evaluated against.
 *
 * Supported top-level keys:
 * - `source_slug`, `entry_slug`, `raw_payload_id`
 * - `lead.<field>` — any column on the Lead row
 * - `normalized.<field>` — any normalized-body field (including `metadata.*`)
 */
function buildFacts(lead: any, context: {
  source_slug: string;
  entry_slug: string;
  raw_payload_id: string;
  normalized: Record<string, any>;
}): Record<string, any> {
  return {
    source_slug: context.source_slug,
    entry_slug: context.entry_slug,
    raw_payload_id: context.raw_payload_id,
    lead: lead?.toJSON ? lead.toJSON() : lead,
    normalized: context.normalized,
  };
}

/**
 * Evaluate one rule's `conditions` object against the fact set.
 *
 * Condition syntax (all entries AND together):
 * - `<key>`: `value`          — equality against the resolved key
 * - `<key>_eq`: `value`       — same as above, explicit
 * - `<key>_in`: [a, b]        — membership
 * - `<key>_gte` / `_lte` / `_gt` / `_lt`: number — numeric comparison
 * - `<key>_contains`: "s"     — substring match (case-insensitive)
 * - `<key>_regex`: "pattern"  — RegExp match
 *
 * Shorthand: a bare key like `"entry_point_slug"` in a condition is an alias
 * for `"entry_slug"` and is resolved the same way.
 */
export function evaluateConditions(
  conditions: Record<string, any> | null | undefined,
  facts: Record<string, any>
): boolean {
  if (!conditions || typeof conditions !== 'object') return true;

  for (const [rawKey, expected] of Object.entries(conditions)) {
    const m = rawKey.match(/^(.+?)(_eq|_in|_gte|_lte|_gt|_lt|_contains|_regex|_ne)?$/);
    const key = (m?.[1] || rawKey).replace(/^entry_point_slug$/, 'entry_slug');
    const op = m?.[2] || '_eq';
    const value = resolvePath(facts, key);

    switch (op) {
      case '_eq':
        if (value !== expected) return false;
        break;
      case '_ne':
        if (value === expected) return false;
        break;
      case '_in':
        if (!Array.isArray(expected) || !expected.includes(value)) return false;
        break;
      case '_gte':
        if (!(Number(value) >= Number(expected))) return false;
        break;
      case '_lte':
        if (!(Number(value) <= Number(expected))) return false;
        break;
      case '_gt':
        if (!(Number(value) > Number(expected))) return false;
        break;
      case '_lt':
        if (!(Number(value) < Number(expected))) return false;
        break;
      case '_contains':
        if (typeof value !== 'string' || !value.toLowerCase().includes(String(expected).toLowerCase())) return false;
        break;
      case '_regex':
        try {
          if (!new RegExp(String(expected)).test(String(value ?? ''))) return false;
        } catch {
          return false;
        }
        break;
    }
  }
  return true;
}

/**
 * Load + evaluate all active rules in priority order, then dispatch matched
 * actions. Returns a flat list of `{ type, status }` descriptors for the
 * ingest response.
 */
export async function evaluateAndDispatch(
  lead: any,
  context: {
    source_slug: string;
    entry_slug: string;
    raw_payload_id: string;
    normalized: Record<string, any>;
  }
): Promise<Array<{ type: string; status: string; detail?: any; error?: string; rule?: string }>> {
  const rules = await RoutingRule.findAll({
    where: { is_active: true },
    order: [['priority', 'ASC'], ['created_at', 'ASC']],
  });
  const facts = buildFacts(lead, context);
  const ctx: ActionContext = { lead, ...context };

  const results: Array<{ type: string; status: string; detail?: any; error?: string; rule?: string }> = [];

  for (const rule of rules) {
    if (!evaluateConditions(rule.conditions, facts)) continue;

    for (const action of (rule.actions as Array<Record<string, any>>) || []) {
      const r = await runAction(action, ctx);
      results.push({ ...r, rule: rule.name });
    }

    if (!rule.continue_on_match) break;
  }

  return results;
}
