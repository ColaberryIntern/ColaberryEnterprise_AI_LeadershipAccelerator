import { useEffect, useState } from 'react';
import { fetchGovContracts, GovContractCard, GovContractAssignedIntern } from '../../services/adminGovContractsApi';
import { parseDeadline, countdownTo } from '../../pages/admin/govDeadline';

/**
 * The gov contracts to show as per-contract sub-items under the admin left-nav "Interns → Gov
 * Contracts" node. Backed by GET /api/admin/gov-contracts (fetchGovContracts), which is already
 * row-scoped server-side: an owner/admin (broad) gets every pursuit, a scoped caller only their own.
 *
 * `enabled` is the caller's `canSection('gov_contracts')` — the hook fetches ONLY for a viewer who
 * holds the section, so the one extra request never fires for a role that cannot see the node anyway.
 * Fail-soft: any error (no access, offline, 503) leaves the list empty and the node is dropped.
 */
export function useAdminGovContractsNav(enabled: boolean): GovContractCard[] {
  const [cards, setCards] = useState<GovContractCard[]>([]);
  useEffect(() => {
    if (!enabled) { setCards([]); return; }
    let live = true;
    fetchGovContracts()
      .then((r) => { if (live) setCards(r.projects); })
      .catch(() => { /* no gov access / offline — leave the node hidden */ });
    return () => { live = false; };
  }, [enabled]);
  return cards;
}

/** One left-nav sub-item per contract that has a build. `owner` is the assigned active intern. */
export interface AdminGovNavEntry { key: string; label: string; to: string; owner?: string; }

/** True when a contract's close date has passed. Unknown (null) ≠ expired, so a contract with no
 *  resolvable date stays visible rather than being silently hidden. */
function closeDatePast(closeDate: string | null): boolean {
  if (!closeDate) return false;
  const parsed = parseDeadline(closeDate);
  return parsed ? countdownTo(parsed.ms, Date.now()).past : false;
}

/** The owner line: the assigned active intern, or "First +N" when more than one is assigned. */
function ownerLabel(interns: GovContractAssignedIntern[]): string | undefined {
  if (!interns || interns.length === 0) return undefined;
  const first = interns[0].name;
  return interns.length > 1 ? `${first} +${interns.length - 1}` : first;
}

/**
 * Map the admin gov-contract cards to nav sub-items, showing ONLY contracts that (1) have a build
 * (`deliveryProjectId` — an early-stage pursuit has no intern cockpit, so a sub-item would 404), (2) have
 * at least one ACTIVE intern assigned (`hasActiveIntern`), and (3) have not passed their close date. Each
 * links to the admin read-only cockpit at /admin/internship/gov-contract/:deliveryProjectId (a child of
 * /admin/internship, so it inherits the `internship` route gate; the backend endpoint is the real
 * `gov_contracts` gate). The owner (the assigned active intern) rides on the entry so the nav makes clear
 * who owns the tasks. Label falls back to the pursuit key when there is no title.
 */
export function adminGovContractNavEntries(cards: GovContractCard[]): AdminGovNavEntry[] {
  return cards
    .filter((c) => !!c.deliveryProjectId && c.hasActiveIntern && !closeDatePast(c.closeDate))
    .map((c) => ({
      key: c.deliveryProjectId as string,
      label: c.title || c.key,
      to: `/admin/internship/gov-contract/${c.deliveryProjectId}`,
      owner: ownerLabel(c.assignedInterns),
    }));
}
