import type { GovVersionContent } from '../../../../services/govProjectPortalApi';

/**
 * editorHelpers — PURE logic for the editor's Outline tab (T19): one row per section with its requirement chips, a
 * page budget (equal split of the limit, rounded to the half, floored at 0.5 — mirrors the backend buildOutline),
 * whether it has drafted content, and whether it is still only a suggested (planned, unwritten) section. No React.
 */
export interface OutlineRow {
  sectionKey: string;
  heading: string;
  requirementIds: string[];
  pageBudget: number | null;
  hasContent: boolean;
  suggested: boolean;
}

const roundHalf = (x: number): number => Math.round(x * 2) / 2;

export function outlineRows(sections: GovVersionContent['sections'] | null | undefined, pageLimit: number | null | undefined): OutlineRow[] {
  const list = Array.isArray(sections) ? sections : [];
  const n = list.length || 1;
  const limit = typeof pageLimit === 'number' && pageLimit > 0 ? pageLimit : null;
  return [...list]
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .map((s) => {
      const hasContent = !!(s.contentHtml && s.contentHtml.trim());
      return {
        sectionKey: s.sectionKey,
        heading: s.heading,
        requirementIds: Array.isArray(s.requirementIds) ? s.requirementIds : [],
        pageBudget: limit == null ? null : Math.max(0.5, roundHalf(limit / n)),
        hasContent,
        suggested: !!(s.plan && !hasContent),
      };
    });
}
