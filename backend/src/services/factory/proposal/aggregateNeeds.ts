import type { HumanNeed } from './proposalReviewTypes';

/**
 * aggregateNeeds — the one needs list, server-side. It collects every open HumanNeed across documents (placeholder
 * gaps, human-resolver findings), the blueprint (`needs_input` forms), the build (unverified stories, demo URL), and
 * the package (missing files, Gold), then dedupes by `key` (merging where each is used) and sorts fatal-first, then
 * by how many documents each need unblocks, then stably by key. Pure — the caller gathers the sources; this orders
 * them. `needsForViewer` is the intern rail: it drops pricing needs and approvals the viewer cannot give.
 */

const distinctDocs = (n: HumanNeed): number => new Set(n.usedIn.map((u) => u.docKey)).size;

export function aggregateNeeds(needs: Array<HumanNeed | null | undefined>): HumanNeed[] {
  const byKey = new Map<string, HumanNeed>();
  for (const n of needs) {
    if (!n || !n.key) continue;
    const existing = byKey.get(n.key);
    if (!existing) {
      byKey.set(n.key, { ...n, usedIn: [...(n.usedIn ?? [])] });
      continue;
    }
    for (const u of n.usedIn ?? []) {
      if (!existing.usedIn.some((e) => e.docKey === u.docKey && e.sectionKey === u.sectionKey)) existing.usedIn.push(u);
    }
    // Fatal wins: if any instance blocks export, the merged need blocks export.
    if (n.blocking === 'fatal') existing.blocking = 'fatal';
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking === 'fatal' ? -1 : 1;
    const d = distinctDocs(b) - distinctDocs(a);
    if (d !== 0) return d;
    return a.key.localeCompare(b.key);
  });
}

/** Split the sorted list into the inbox's two groups. */
export function groupNeeds(needs: HumanNeed[]): { blockingExport: HumanNeed[]; holdingScore: HumanNeed[] } {
  return {
    blockingExport: needs.filter((n) => n.blocking === 'fatal'),
    holdingScore: needs.filter((n) => n.blocking !== 'fatal'),
  };
}

/** A need is about pricing (admin-only) when its key names price/pricing/cost. */
export function isPricingNeed(n: HumanNeed): boolean {
  return /(?:^|[:_])(price|pricing|cost)(?:[:_]|$)/i.test(n.key) || /\bprice\b|\bpricing\b|\bcost proposal\b/i.test(n.ask);
}

/**
 * The intern-safe projection of the needs list: never pricing (admin-only end to end), and `approval` needs only to a
 * viewer who can actually give them. Mirrors the student-safe projection rail the rest of the Studio enforces.
 */
export function needsForViewer(needs: HumanNeed[], opts: { includePricing: boolean; canApprove: boolean }): HumanNeed[] {
  return needs.filter((n) => {
    if (!opts.includePricing && isPricingNeed(n)) return false;
    if (n.kind === 'approval' && !opts.canApprove) return false;
    return true;
  });
}
