import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { HumanNeed } from './proposalReviewTypes';
import { aggregateNeeds } from './aggregateNeeds';

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
    const versions = await sequelize.query<{ findings: unknown }>(
      `SELECT v.findings AS findings
         FROM gov_proposal_document_versions v
         JOIN gov_proposal_documents d ON d.current_version_id = v.id
        WHERE d.delivery_project_id = $1`,
      { bind: [deliveryProjectId], type: QueryTypes.SELECT },
    );
    return aggregateNeeds(extractNeeds(gaps, versions.map((v) => v.findings)));
  } catch {
    return [];
  }
}
