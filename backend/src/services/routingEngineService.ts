import { RoutingRule, RoutingRuleExecution } from '../models';
import { runAction, ActionContext } from './routingActionsService';
import { isUniqueViolation } from '../utils/uniqueViolation';
import { classifyError } from '../utils/errorClassifier';

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
export interface DispatchContext {
  source_slug: string;
  entry_slug: string;
  raw_payload_id: string;
  normalized: Record<string, any>;
  /** Source brand/tenant (T226). Optional: unclassified sources pass nothing. */
  tenant_id?: string | null;
  brand_id?: string | null;
  brand_slug?: string | null;
}

function buildFacts(lead: any, context: DispatchContext): Record<string, any> {
  return {
    source_slug: context.source_slug,
    entry_slug: context.entry_slug,
    raw_payload_id: context.raw_payload_id,
    // T226: a rule can say `brand_slug: 'ai-flotation'`. Null when unresolved,
    // so such a rule simply does not match — it never matches by accident.
    tenant_id: context.tenant_id ?? null,
    brand_id: context.brand_id ?? null,
    brand_slug: context.brand_slug ?? null,
    lead: lead?.toJSON ? lead.toJSON() : lead,
    normalized: context.normalized,
  };
}

export interface DispatchResult {
  type: string;
  status: string;
  detail?: any;
  error?: string;
  rule?: string;
}

/**
 * Claim-then-run (T226). The UNIQUE index on `(raw_payload_id, rule_id,
 * action_index)` is the replay guard: the `claimed` row is inserted BEFORE the
 * handler runs, so a second run of the same payload — a re-POST, a retry, two
 * workers — loses the insert and returns `skipped` instead of dialling twice.
 * Returns the claim row, or null when someone else already holds it.
 */
async function claimExecution(
  rule: RoutingRule,
  actionIndex: number,
  action: Record<string, any>,
  lead: any,
  context: DispatchContext,
): Promise<RoutingRuleExecution | null> {
  try {
    return await RoutingRuleExecution.create({
      raw_payload_id: context.raw_payload_id,
      lead_id: Number(lead?.id),
      rule_id: rule.id,
      rule_version: rule.version ?? 1,
      action_index: actionIndex,
      action_type: String(action?.type ?? ''),
      action_snapshot: action,
      status: 'claimed',
      tenant_id: context.tenant_id ?? null,
      brand_id: context.brand_id ?? null,
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
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
  context: DispatchContext,
): Promise<DispatchResult[]> {
  const rules = await RoutingRule.findAll({
    where: { is_active: true },
    order: [['priority', 'ASC'], ['created_at', 'ASC']],
  });
  const facts = buildFacts(lead, context);
  const ctx: ActionContext = { lead, ...context };

  const results: DispatchResult[] = [];

  for (const rule of rules) {
    if (!evaluateConditions(rule.conditions, facts)) continue;

    const actions = (rule.actions as Array<Record<string, any>>) || [];
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      const claim = await claimExecution(rule, i, action, lead, context);
      if (!claim) {
        results.push({ type: String(action?.type ?? ''), status: 'skipped', detail: { reason: 'already_executed' }, rule: rule.name });
        continue;
      }
      const r = await runAction(action, { ...ctx, rule_id: rule.id, rule_version: rule.version });
      results.push({ ...r, rule: rule.name });
      await claim.update({
        status: r.status,
        detail: r.detail ?? null,
        error_class: r.status === 'failed' ? classifyError(new Error(r.error ?? 'failed')) : null,
        finished_at: new Date(),
      });
    }

    if (!rule.continue_on_match) break;
  }

  return results;
}
