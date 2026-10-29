import { useEffect, useState } from 'react';
import { listMyGovProjects, MyGovProjectCard } from '../../services/govProjectPortalApi';

/**
 * The gov contract(s) THIS intern is assigned to, for the portal left-nav "Gov
 * Contracts" group. Backed by GET /api/portal/gov-projects (listMyGovProjects),
 * which is membership-scoped server-side — it returns only the delivery projects
 * the signed-in participant is an ACTIVE member of. So the nav group shows an
 * intern exactly their own contract(s) and nothing else; a student with none
 * gets an empty list and the group is dropped by the caller.
 *
 * Fail-soft like useInternshipNav: any error (offline, flag off, 403, 500) reads
 * as "no gov contracts", so the nav degrades to no group rather than throwing.
 */
export function useMyGovProjectsNav(): MyGovProjectCard[] {
  const [projects, setProjects] = useState<MyGovProjectCard[]>([]);
  useEffect(() => {
    let live = true;
    listMyGovProjects()
      .then((p) => { if (live) setProjects(p); })
      .catch(() => { /* not assigned / offline / flag off — leave the group hidden */ });
    return () => { live = false; };
  }, []);
  return projects;
}

/** One left-nav entry per assigned gov contract. */
export interface GovNavEntry { label: string; to: string; }

/**
 * Pure: map the assigned-contract cards to nav entries, each deep-linking to the
 * intern's existing cockpit at /portal/gov-projects/:projectId. Extracted from the
 * hook so the label fallback and the deep-link path — the load-bearing bits — are
 * tested without a hook or a fetch. Empty in ⇒ empty out, so the caller drops the
 * group. The label falls back to the project id when a name is missing, never blank.
 */
export function govNavEntries(cards: MyGovProjectCard[]): GovNavEntry[] {
  return cards.map((c) => ({
    label: c.name || c.projectId,
    to: `/portal/gov-projects/${c.projectId}`,
  }));
}
