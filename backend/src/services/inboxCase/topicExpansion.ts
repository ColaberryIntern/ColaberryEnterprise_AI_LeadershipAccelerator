import InboxIdentityAlias from '../../models/InboxIdentityAlias';
import { normalizeQuery, normalizeSubject } from './textNormalization';

// Mode B ("Resolve by topic, business, or initiative") expansion: starts
// from the exact phrase and expands through normalized subjects and known
// aliases, per root directive section 5. Deterministic — no AI call. The
// caller's discovery step layers term-overlap ("semantic-ish") scoring on
// top of this, capped low per matchScoring.ts.

export interface TopicExpansion {
  exactPhrase: string;
  normalizedQuery: string;
  subjectVariants: string[];
  companyDomains: string[];
  knownAliasTerms: string[];
}

export async function expandTopic(query: string): Promise<TopicExpansion> {
  const exactPhrase = query.trim();
  const normalized = normalizeQuery(exactPhrase);
  const normalizedSubjectForm = normalizeSubject(exactPhrase);

  // Known aliases whose canonical_name or alias_value contains/matches the
  // query text — e.g. "AI Flotation" matching a company_domain alias for
  // "aiflotation.com" or a stored abbreviation.
  const aliasMatches = await InboxIdentityAlias.findAll({
    where: {},
    limit: 500, // bounded scan; identity table is not expected to grow past low thousands
  });

  const companyDomains = new Set<string>();
  const knownAliasTerms = new Set<string>();
  const queryTokens = normalized.split(' ').filter(Boolean);

  for (const alias of aliasMatches) {
    const canonicalNorm = normalizeQuery(alias.canonical_name);
    const valueNorm = normalizeQuery(alias.alias_value);
    const relatesToQuery =
      canonicalNorm.includes(normalized) ||
      normalized.includes(canonicalNorm) ||
      queryTokens.some((t) => t.length > 2 && (canonicalNorm.includes(t) || valueNorm.includes(t)));

    if (!relatesToQuery) continue;

    if (alias.alias_type === 'company_domain') companyDomains.add(alias.alias_value);
    else knownAliasTerms.add(alias.alias_value);
  }

  const subjectVariants = Array.from(
    new Set([normalizedSubjectForm, normalized].filter((v) => v.length > 0))
  );

  return {
    exactPhrase,
    normalizedQuery: normalized,
    subjectVariants,
    companyDomains: Array.from(companyDomains),
    knownAliasTerms: Array.from(knownAliasTerms),
  };
}
