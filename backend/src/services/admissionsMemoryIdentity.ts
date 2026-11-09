import { Op, type WhereOptions } from 'sequelize';
import AdmissionsMemory from '../models/AdmissionsMemory';
import { Visitor } from '../models';

/**
 * R4 - Maya remembers a PERSON, not a browser.
 *
 * admissions_memory is keyed on visitor_id (UNIQUE): a browser fingerprint from localStorage. Measured 2026-11-09: 114
 * rows, 1 with a lead_id; 30 more can be linked from visitors.lead_id; and people with 2+ rows exist, so the same human
 * was greeted as a stranger on a second device. The identity to key on already exists (the lead); no third identity is
 * invented and no column is added.
 *
 *   lead known  (the visitor is linked to a lead, or the caller passes the lead):
 *               use the person's CANONICAL row, the oldest admissions_memory row carrying that lead_id. A newer browser
 *               of the same person gets the same memory. If no row carries the lead yet, the visitor's own row is used
 *               and stamped with the lead, so it becomes the canonical one.
 *   anonymous   the visitor's own row, exactly as before (first touch).
 *
 * Every read here is a primary-key or indexed lookup. The only write is stamping lead_id on a row that has none.
 */

export interface MemoryIdentityDeps {
  leadForVisitor: (visitorId: string) => Promise<number | null>;
  canonicalForLead: (leadId: number) => Promise<AdmissionsMemory | null>;
  ownRow: (visitorId: string) => Promise<AdmissionsMemory | null>;
}

export function defaultMemoryIdentityDeps(): MemoryIdentityDeps {
  return {
    leadForVisitor: async (visitorId) => {
      const v = await Visitor.findByPk(visitorId, { attributes: ['id', 'lead_id'] });
      return v?.lead_id ?? null;
    },
    canonicalForLead: (leadId) => AdmissionsMemory.findOne({ where: { lead_id: leadId }, order: [['created_at', 'ASC'], ['id', 'ASC']] }),
    ownRow: (visitorId) => AdmissionsMemory.findOne({ where: { visitor_id: visitorId } }),
  };
}

/** The lead this visitor is, from the explicit hint first (a conversation's lead), else the visitor link. */
export async function leadFor(visitorId: string, leadHint: number | null | undefined, deps: MemoryIdentityDeps): Promise<number | null> {
  if (typeof leadHint === 'number' && Number.isFinite(leadHint)) return leadHint;
  return deps.leadForVisitor(visitorId);
}

/**
 * The memory row for this visitor WITHOUT creating one (read paths: building context, classifying). Null for an
 * anonymous visitor with no memory yet.
 */
export async function findPersonMemory(
  visitorId: string, leadHint?: number | null, deps: MemoryIdentityDeps = defaultMemoryIdentityDeps(),
): Promise<AdmissionsMemory | null> {
  const leadId = await leadFor(visitorId, leadHint, deps);
  if (leadId !== null) {
    const canonical = await deps.canonicalForLead(leadId);
    if (canonical) return canonical;
  }
  return deps.ownRow(visitorId);
}

/** True when the person has any earlier memory under any of their browsers (a returning person is never "new"). */
export function isReturning(memory: AdmissionsMemory | null): boolean {
  return !!memory && (memory.conversation_count || 0) >= 1;
}

/** Rows a lead could be stamped on: unlinked rows only, so a re-run changes nothing (idempotent). */
export function unlinkedRowsOf(visitorId: string): WhereOptions {
  return { visitor_id: visitorId, lead_id: { [Op.is]: null } };
}
