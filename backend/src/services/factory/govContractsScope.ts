import type { GovPipelineCard } from './govPipeline';

/**
 * govContractsScope — who may see which gov pursuit in the admin "Gov Contracts" tab.
 *
 * A "broad" caller — one who holds the `program` section (owner, admin, or a legacy full
 * admin) — is a management/operator viewer and sees EVERY active pursuit, exactly as the
 * existing gov cockpit (which is `program`-gated) already does. A SCOPED caller (a future
 * gov role that holds only `gov_contracts`) sees ONLY the projects they are an active member
 * of: the card's `deliveryProjectId` must be in their membership set.
 *
 * A card with no `deliveryProjectId` is a pre-approval pursuit with no delivery project yet,
 * so nobody can be a member of it — it is management-only and is never shown to a scoped
 * caller. Deny-by-default: an empty membership set yields an empty result.
 *
 * PURE: no I/O, no mutation of the input array. The section gate (`requireSection`) is the
 * coarse "may you open the tab at all" check; THIS is the per-project row-level scope on top
 * of it, mirroring how the portal `/api/portal/gov-projects` route scopes a student to their
 * own `DeliveryProjectMember` rows.
 */
export function scopeGovCardsToMembership(
  cards: GovPipelineCard[],
  memberProjectIds: readonly string[],
  broad: boolean,
): GovPipelineCard[] {
  if (broad) return cards;
  const member = new Set(memberProjectIds);
  return cards.filter((c) => c.deliveryProjectId != null && member.has(c.deliveryProjectId));
}
