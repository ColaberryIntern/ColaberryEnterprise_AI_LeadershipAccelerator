/**
 * govRequirementItems — DETERMINISTIC structure over the extracted requirements (P2).
 *
 * The extractor (proposalExtractor.ts) produces verbatim, source-cited obligation fragments. This module
 * groups each into a defined RequirementItem in one of four categories, so Step 2 can show a readable map
 * instead of a flat list. It is PURE and DETERMINISTIC (no LLM, no I/O): same fragments in, same items out,
 * which is what makes it unit-testable. AI may LATER enrich titles or fill `inferred` gaps (advisory, as in
 * govBuildSpec.ts), but the category and the citations never depend on a model.
 *
 * It NEVER fabricates: every item cites >=1 real source fragment (reqId + verbatim text + document). Nothing
 * here gates anything — items are advisory UI; the server gates still read the established requirements.
 *
 * Category -> downstream (see govBuildPlan.ts / the establish path): `scope` items carry the solution_build
 * track (they become build stories); `submit` + `rule` + `after_award` are submission/award-stage obligations.
 */
import type { ExtractedRequirement, ExtractedDossier } from './proposalExtractor';
import { classifyRequirementCategory, type ReqItemCategory } from './requirementSignals';

// RE-EXPORTED so every existing importer keeps its path and this stays a pure move. The signals
// left for `requirementSignals.ts` only because `proposalExtractor` now needs to categorise too,
// and importing them back from here would close a cycle. This module's public surface is
// unchanged, which is why its existing test suite was not touched to accommodate the move.
export { classifyRequirementCategory };
export type { ReqItemCategory };

export interface RequirementItemFragment {
  reqId: string;
  text: string;
  doc: string;
  section?: string;
}

export interface RequirementItem {
  id: string;
  category: ReqItemCategory;
  title: string;
  definition: string;
  sourceFragments: RequirementItemFragment[];
  links: string[];
  inferred: boolean;
  checkNote?: string;
  status: 'candidate' | 'confirmed';
  dueAt?: string | null;
}

// Mirrors proposalExtractor DATE_RE — accepts ordinal day forms ("Nov. 6th, 2026") real RFPs use. Keep in sync.
const DATE_RE = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4})\b/i;


const PREFIX: Record<ReqItemCategory, string> = { submit: 'SUB', rule: 'RUL', scope: 'SCP', after_award: 'AWD' };
const stripMarker = (s: string): string => s.replace(/^\s*(?:[-*•]|\(?\d+[.)]|[A-Za-z][.)])\s+/, '').trim();
const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function titleFrom(statement: string): string {
  const clean = stripMarker(statement);
  // First clause up to a comma/terminator, capped - a scannable label, not the whole sentence.
  const firstClause = clean.split(/[,;:.]/)[0].trim();
  return truncate(firstClause.length >= 12 ? firstClause : clean, 72);
}

/**
 * PURE: turn extracted requirements into categorized RequirementItems, each citing its source fragment(s).
 * Deterministic and total. Duplicate statements are already deduped by the extractor, so this is 1:1.
 */
export function buildRequirementItems(
  requirements: ExtractedRequirement[],
  _dossier?: ExtractedDossier,
): RequirementItem[] {
  const reqs = Array.isArray(requirements) ? requirements : [];
  const counters: Record<ReqItemCategory, number> = { submit: 0, rule: 0, scope: 0, after_award: 0 };
  const items: RequirementItem[] = [];
  for (const r of reqs) {
    const statement = String(r?.extractedText ?? r?.statement ?? '').trim();
    if (!statement) continue;
    const category = classifyRequirementCategory(statement);
    counters[category] += 1;
    const dateM = statement.match(DATE_RE);
    items.push({
      id: `ITEM-${PREFIX[category]}${String(counters[category]).padStart(2, '0')}`,
      category,
      title: titleFrom(statement),
      definition: truncate(statement, 500),
      sourceFragments: [{
        reqId: String(r.canonicalReqId || ''),
        text: statement,
        doc: String(r.sourceDocument || ''),
        section: r.section ? String(r.section) : undefined,
      }],
      links: [],
      inferred: false,
      status: 'candidate',
      dueAt: (category === 'submit' || category === 'rule') && dateM ? dateM[1] : null,
    });
  }
  return items;
}

/** The tracks an established requirement should carry for a given item category, so downstream build-story
 *  derivation (govBuildPlan.ts) is unchanged: only `scope` items carry solution_build. */
export function tracksForCategory(category: ReqItemCategory): string[] {
  return category === 'scope' ? ['proposal', 'solution_build'] : ['proposal'];
}

/** The due stage an established requirement should carry for a given item category. */
export function dueStageForCategory(category: ReqItemCategory): 'submission' | 'award' | 'delivery' | 'unknown' {
  if (category === 'submit' || category === 'rule') return 'submission';
  if (category === 'after_award') return 'award';
  if (category === 'scope') return 'delivery';
  return 'unknown';
}
