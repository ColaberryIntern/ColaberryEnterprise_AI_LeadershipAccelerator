import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { HumanNeed } from './proposalReviewTypes';
import { aggregateNeeds } from './aggregateNeeds';
import { goldNeedFor, type GoldDocState } from './goldGate';

/**
 * collectProjectNeeds — the one open-needs list for a project, server-side (v3 §V1.4). It pulls every typed
 * HumanNeed from the two sources that carry them today — open gap rows (each `[PLACEHOLDER]` reconciled into a gap
 * with a `need`) and the human-resolver findings on each document's current version — and runs them through
 * `aggregateNeeds` (dedupe by key, fatal first, by how many documents each unblocks). Fail-soft: a read error yields
 * an empty list. The blueprint `needs_input` forms, unverified-story decisions, demo-URL setting and the Gold package
 * approval are layered on as those sources land (V2); the pure `extractNeeds` keeps the shaping testable without a DB.
 */

export function isHumanNeed(n: unknown): n is HumanNeed {
  if (!n || typeof n !== 'object') return false;
  const o = n as Record<string, unknown>;
  return typeof o.key === 'string' && typeof o.kind === 'string' && Array.isArray(o.usedIn);
}

/** PURE: drop needs whose key already has a recorded resolution (an answered gap carrying that need_key). */
export function dropResolved(needs: HumanNeed[], resolvedKeys: Set<string>): HumanNeed[] {
  return needs.filter((n) => !resolvedKeys.has(n.key));
}

/** PURE: extract HumanNeeds from raw gap `need` values and from version finding arrays (resolver==='human'). */
export function extractNeeds(
  gapNeeds: Array<{ need?: unknown }>,
  findingSets: Array<unknown>,
): HumanNeed[] {
  const out: HumanNeed[] = [];
  for (const g of gapNeeds) {
    if (isHumanNeed(g?.need)) out.push(g.need);
  }
  for (const set of findingSets) {
    if (!Array.isArray(set)) continue;
    for (const f of set) {
      const rec = f as Record<string, unknown> | null;
      if (rec && rec.resolver === 'human' && isHumanNeed(rec.need)) out.push(rec.need);
    }
  }
  return out;
}

export async function collectProjectNeeds(deliveryProjectId: string): Promise<HumanNeed[]> {
  if (!deliveryProjectId) return [];
  try {
    const gaps = await sequelize.query<{ need: unknown }>(
      "SELECT need FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND resolution = 'open' AND need IS NOT NULL",
      { bind: [deliveryProjectId], type: QueryTypes.SELECT },
    );
    // Per-document current-version findings + pass state + Gold-gate state — feeds both the human-resolver needs and
    // the T13 Gold package approval need (surfaced only when every eligible document passes and Gold isn't yet given).
    const versions = await sequelize.query<{ doc_key: string; superseded: boolean; findings: unknown; passes: boolean; gold_status: string | null }>(
      `SELECT d.doc_key AS doc_key, d.superseded AS superseded, v.findings AS findings, v.passes AS passes,
              gr.status AS gold_status
         FROM gov_proposal_documents d
         JOIN gov_proposal_document_versions v ON d.current_version_id = v.id
         LEFT JOIN gov_proposal_gate_reviews gr ON gr.document_id = d.id AND gr.gate = 'gold'
        WHERE d.delivery_project_id = $1`,
      { bind: [deliveryProjectId], type: QueryTypes.SELECT },
    );
    const resolved = await sequelize.query<{ need_key: string }>(
      "SELECT DISTINCT need_key FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND need_key IS NOT NULL AND resolution <> 'open'",
      { bind: [deliveryProjectId], type: QueryTypes.SELECT },
    );
    const resolvedKeys = new Set(resolved.map((r) => r.need_key));

    const needs = extractNeeds(gaps, versions.map((v) => v.findings));
    // T13: the single Gold package approval need, when the project is ready and Gold isn't already given.
    const goldDocs: GoldDocState[] = versions.map((v) => ({ docKey: v.doc_key, passes: !!v.passes, superseded: !!v.superseded, goldApproved: v.gold_status === 'approved' }));
    const gold = goldNeedFor(goldDocs);
    if (gold) needs.push(gold);

    return dropResolved(aggregateNeeds(needs), resolvedKeys);
  } catch {
    return [];
  }
}
