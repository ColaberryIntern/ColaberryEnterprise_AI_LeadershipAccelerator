import type { HumanNeed } from './proposalReviewTypes';
import { collectProjectNeeds } from './collectProjectNeeds';
import {
  canonicalizeNeed, deriveSubject, groupLabel, subjectLabel, type GroupKind,
} from './needGrouping';

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

// ── Grouped needs (CC-20261117-q8k3): fold the deduped needs into dossier group cards ───────────────────
// A card is one (group, subject) slot. Many atomic/near-duplicate needs ("project name 1/2/3", "specific
// project names") collapse into one past_performance card; a reporting slot and a recruiting slot are SEPARATE
// cards of the same group, so references stay non-interchangeable. Pure over the merged TenantNeed[].

export interface NeedGroupConcept { conceptId: string; label: string; asks: string[]; needKeys: string[] }
export interface NeedGroupCard {
  groupSlug: string;
  groupLabel: string;
  groupKind: GroupKind;
  subject: string;
  subjectLabel: string;
  blocking: 'fatal' | 'score';
  projects: TenantNeedProject[];
  bidCount: number;
  concepts: NeedGroupConcept[];
  needKeys: string[];
}

/** The subject of a need: the value tagged at draft time, else derived from its ask, else 'general'. */
export function needSubject(n: HumanNeed): string {
  const tagged = typeof n.subject === 'string' ? n.subject.trim() : '';
  if (tagged) return tagged;
  const derived = deriveSubject(n.ask || '');
  return derived || 'general';
}

/**
 * PURE: fold merged tenant needs into group cards keyed by (groupSlug, subject). Cards are sorted fatal-first,
 * then by how many bids they span, then by group. Within a card, needs are collected by concept (so a fact group
 * like "solicitation" lists due_date / client / contact as distinct fields, while a reference group is one record).
 */
export function groupTenantNeeds(needs: TenantNeed[]): NeedGroupCard[] {
  const byCard = new Map<string, NeedGroupCard>();
  for (const n of Array.isArray(needs) ? needs : []) {
    if (!n || !n.key) continue;
    const match = canonicalizeNeed(n);
    const subject = needSubject(n);
    const cardKey = `${match.groupSlug}::${subject}`;
    let card = byCard.get(cardKey);
    if (!card) {
      card = {
        groupSlug: match.groupSlug,
        groupLabel: groupLabel(match.groupSlug),
        groupKind: match.groupKind,
        subject,
        subjectLabel: subjectLabel(subject),
        blocking: n.blocking === 'fatal' ? 'fatal' : 'score',
        projects: [],
        bidCount: 0,
        concepts: [],
        needKeys: [],
      };
      byCard.set(cardKey, card);
    }
    if (n.blocking === 'fatal') card.blocking = 'fatal';
    for (const p of n.projects ?? []) {
      if (!card.projects.some((e) => e.projectId === p.projectId)) card.projects.push(p);
    }
    if (!card.needKeys.includes(n.key)) card.needKeys.push(n.key);
    let concept = card.concepts.find((c) => c.conceptId === match.conceptId);
    if (!concept) { concept = { conceptId: match.conceptId, label: match.label, asks: [], needKeys: [] }; card.concepts.push(concept); }
    if (n.ask && !concept.asks.includes(n.ask)) concept.asks.push(n.ask);
    if (!concept.needKeys.includes(n.key)) concept.needKeys.push(n.key);
  }
  const cards = [...byCard.values()];
  for (const c of cards) c.bidCount = c.projects.length;
  return cards.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking === 'fatal' ? -1 : 1;
    if (b.bidCount !== a.bidCount) return b.bidCount - a.bidCount;
    return a.groupSlug.localeCompare(b.groupSlug);
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
