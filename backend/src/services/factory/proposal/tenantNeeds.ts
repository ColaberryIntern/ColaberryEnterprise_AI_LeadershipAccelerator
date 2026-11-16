import type { HumanNeed } from './proposalReviewTypes';
import { collectProjectNeeds } from './collectProjectNeeds';

/**
 * tenantNeeds — "Needs across contracts" (spec §B, decision #2). The per-project "Needs you" list is per bid; this
 * unions the OPEN needs across every one of a tenant's gov bids and dedupes them by canonical need key, so a question
 * asked on three bids shows once, tagged with the bids that ask it. It backs the dossier's tenant-wide needs surface:
 * one place to see everything a person still owes, and (with answer-once propagation) answering it on any bid clears
 * it from all of them. Pure merge core (`mergeTenantNeeds`) + a thin async collector.
 */

export interface TenantNeedProject { projectId: string; projectName: string }
export interface TenantNeed extends HumanNeed { projects: TenantNeedProject[] }

interface ProjectNeeds { projectId: string; projectName: string; needs: HumanNeed[] }

const distinctDocs = (n: HumanNeed): number => new Set((n.usedIn ?? []).map((u) => u.docKey)).size;

/**
 * PURE: union each project's needs into one list deduped by `need.key`. The merged need carries the union of its
 * `usedIn` and the set of bids (projects) that ask it; fatal wins (if any bid blocks export, the merged need does).
 * Sorted fatal-first, then by how many bids ask it (the most shared first), then by how many documents it unblocks,
 * then stably by key.
 */
export function mergeTenantNeeds(perProject: ProjectNeeds[]): TenantNeed[] {
  const byKey = new Map<string, TenantNeed>();
  for (const p of Array.isArray(perProject) ? perProject : []) {
    for (const n of p.needs ?? []) {
      if (!n || !n.key) continue;
      const existing = byKey.get(n.key);
      if (!existing) {
        byKey.set(n.key, { ...n, usedIn: [...(n.usedIn ?? [])], projects: [{ projectId: p.projectId, projectName: p.projectName }] });
        continue;
      }
      for (const u of n.usedIn ?? []) {
        if (!existing.usedIn.some((e) => e.docKey === u.docKey && e.sectionKey === u.sectionKey)) existing.usedIn.push(u);
      }
      if (!existing.projects.some((e) => e.projectId === p.projectId)) existing.projects.push({ projectId: p.projectId, projectName: p.projectName });
      if (n.blocking === 'fatal') existing.blocking = 'fatal';
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking === 'fatal' ? -1 : 1;
    const bids = b.projects.length - a.projects.length;
    if (bids !== 0) return bids;
    const docs = distinctDocs(b) - distinctDocs(a);
    if (docs !== 0) return docs;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Collect every open need across the tenant's gov bids, deduped. The caller resolves the tenant's delivery projects
 * (id + human name); this collects each project's needs and merges them. Fail-soft per project (a failed collect
 * yields no needs for that bid, never a throw).
 */
export async function collectTenantNeeds(projects: TenantNeedProject[]): Promise<TenantNeed[]> {
  const list = Array.isArray(projects) ? projects.filter((p) => p && p.projectId) : [];
  const perProject: ProjectNeeds[] = await Promise.all(
    list.map(async (p) => {
      let needs: HumanNeed[] = [];
      try { needs = await collectProjectNeeds(p.projectId); } catch { needs = []; }
      return { projectId: p.projectId, projectName: p.projectName, needs };
    }),
  );
  return mergeTenantNeeds(perProject);
}
