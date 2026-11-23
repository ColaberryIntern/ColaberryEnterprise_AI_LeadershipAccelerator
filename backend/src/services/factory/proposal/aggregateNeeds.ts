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

// A firm-level fact whose one answer serves every bid (belongs in the shared company dossier).
const GLOBAL_FACT_RE = /\b(firm|company|our\s+(?:team|organization|organisation|capabilit)|authorized\s+represent|security\s+(?:posture|design|control|practice)|single\s+sign[- ]?on|\bSSO\b|\bRBAC\b|encryption|backup|disaster\s+recovery|\bSLA\b|service\s+level|support\s+(?:hours|tier|desk|model)|certification|certified|insurance|bonding|\bbond\b|licensure|capabilit|past\s+performance|resume|résumé|methodology)\b/i;
// A fact tied to THIS solicitation (do NOT reuse it on another bid).
const LOCAL_FACT_RE = /\b(number\s+of|how\s+many|square\s+footage|sq\.?\s*ft|building|facilit|users?\b|employees?|headcount|deadline|due\s+date|time\s+zone|address|contact|this\s+(?:rfp|solicitation|project|bid|city|agency)|submission\s+(?:method|email|address)|issuing\s+agency|buyer)\b/i;

/**
 * PURE: classify a need as a reusable COMPANY-dossier asset (`global`) or specific to THIS bid (`local`). Records
 * (references / key personnel) and company certifications (signatures) are always global; a `fact` is read from its
 * key + ask (a solicitation-specific fact is local, a firm-level fact is global); everything else (decision, setting,
 * approval, confirm_rule, file) is bid-specific. A bare, unmatched fact defaults to `local` so the shared dossier is
 * never polluted by a fact that only happened to be true for one bid.
 */
export function needScope(n: HumanNeed): 'global' | 'local' {
  if (n.kind === 'record' || n.kind === 'signature') return 'global';
  if (n.kind === 'fact') {
    const t = `${n.key} ${n.ask}`;
    if (LOCAL_FACT_RE.test(t)) return 'local';
    if (GLOBAL_FACT_RE.test(t)) return 'global';
    return 'local';
  }
  return 'local';
}

/** Stamp each need with its `scope` (global/local) for the inbox split and the "where to add it" link. Pure. */
export function withNeedScope(needs: HumanNeed[]): HumanNeed[] {
  return needs.map((n) => ({ ...n, scope: needScope(n) }));
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
