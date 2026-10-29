import { useEffect, useState } from 'react';
import { fetchGovContracts, GovContractCard } from '../../services/adminGovContractsApi';

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

/** One left-nav sub-item per contract that has a build. */
export interface AdminGovNavEntry { key: string; label: string; to: string; }

/**
 * Pure: map the admin gov-contract cards to nav sub-items. Only contracts with an actual build
 * (`deliveryProjectId`) get an item — an early-stage pursuit has no intern cockpit to open, so a
 * sub-item for it would 404. Each links to the admin read-only cockpit at
 * /admin/internship/gov-contract/:deliveryProjectId (a child of /admin/internship, so it inherits the
 * `internship` route gate; the backend endpoint is the real `gov_contracts` gate). Label falls back to
 * the pursuit key when there is no title.
 */
export function adminGovContractNavEntries(cards: GovContractCard[]): AdminGovNavEntry[] {
  return cards
    .filter((c) => !!c.deliveryProjectId)
    .map((c) => ({
      key: c.deliveryProjectId as string,
      label: c.title || c.key,
      to: `/admin/internship/gov-contract/${c.deliveryProjectId}`,
    }));
}
