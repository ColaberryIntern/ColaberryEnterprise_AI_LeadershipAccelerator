import AdmissionsKnowledgeEntry from '../models/AdmissionsKnowledgeEntry';
import { Op } from 'sequelize';
import { emitRetrieval } from './aiEventService';
import { gateKnowledgeEntries, renderKnowledgeContext } from './admissionsKnowledgeGate';

/**
 * Find relevant knowledge entries by keyword matching against the query and category.
 */
export async function findRelevantKnowledge(params: {
  query: string;
  pageCategory?: string;
  limit?: number;
}): Promise<AdmissionsKnowledgeEntry[]> {
  const { query, pageCategory, limit = 5 } = params;
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  if (queryWords.length === 0) {
    // No meaningful query — return top priority entries for the category
    const where: any = { active: true };
    if (pageCategory) where.category = mapPageToKnowledgeCategory(pageCategory);
    return AdmissionsKnowledgeEntry.findAll({
      where,
      order: [['priority', 'DESC']],
      limit,
    });
  }

  // Fetch active entries
  const allEntries = await AdmissionsKnowledgeEntry.findAll({
    where: { active: true },
    order: [['priority', 'DESC']],
  });

  // Restrict champion entries to champion/referral pages only
  const isChampionPage = pageCategory === 'champion' || pageCategory === 'referrals';
  const filteredEntries = allEntries.filter((entry) => {
    if (entry.category === 'champion' && !isChampionPage) return false;
    return true;
  });

  // Score each entry by keyword overlap
  const scored = filteredEntries.map((entry) => {
    let score = 0;
    const keywords = (entry.keywords || []).map((k: string) => k.toLowerCase());
    const titleLower = entry.title.toLowerCase();
    const contentLower = entry.content.toLowerCase();
    const categoryLower = entry.category.toLowerCase();

    for (const word of queryWords) {
      if (keywords.some((kw) => kw.includes(word) || word.includes(kw))) score += 3;
      if (titleLower.includes(word)) score += 2;
      if (contentLower.includes(word)) score += 1;
    }

    // Boost category match
    if (pageCategory && categoryLower === mapPageToKnowledgeCategory(pageCategory)) {
      score += 2;
    }

    // Boost by priority
    score += entry.priority * 0.1;

    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

/**
 * Build a knowledge context string for system prompt injection.
 *
 * Retrieval is only half of this. Rows are then GATED (`admissionsKnowledgeGate`) before any
 * of them reaches the prompt, because keyword scoring ranks by relevance and knows nothing
 * about whether a fact is still allowed to be quoted. Two behaviours depend on it:
 *
 *  - A row quoting a retired fact is withheld even when it scores highest. The nightly
 *    website crawler writes rows without applying the retirement check, so a retired figure
 *    can sit in an active row between a crawl and the next restart.
 *  - NO MATCH NOW RETURNS AN INSTRUCTION, NOT AN EMPTY STRING. The empty string left the
 *    prompt with no knowledge block at all, and the model answered from its own weights with
 *    nothing marking the answer as unsourced. Callers must therefore append whatever this
 *    returns UNCONDITIONALLY; treating a falsy result as "nothing to add" reintroduces the
 *    exact failure, and the gate's test pins that the return is never empty.
 */
export async function buildKnowledgeContext(query: string, pageCategory?: string): Promise<string> {
  const entries = await findRelevantKnowledge({ query, pageCategory, limit: 4 });
  const gated = gateKnowledgeEntries(entries);
  // Persist retrieval provenance — source IDs/titles for observability + citations (TBI P1-6).
  // Records what actually REACHED the prompt, not what was fetched: a withheld row did not
  // source the answer, so logging it as a source would misattribute the reply.
  emitRetrieval({
    method: 'keyword',
    count: gated.allowed.length,
    sources: gated.allowed.map((e) => ({ id: e.id, title: e.title, category: e.category })),
    workflowId: 'maya_knowledge',
    agentId: 'Maya',
  }).catch(() => {});

  return renderKnowledgeContext(gated);
}

/**
 * Map page category to knowledge category.
 */
function mapPageToKnowledgeCategory(pageCategory: string): string {
  const mapping: Record<string, string> = {
    homepage: 'program',
    program: 'curriculum',
    pricing: 'pricing',
    enroll: 'logistics',
    case_studies: 'outcomes',
    contact: 'faq',
    strategy_call_prep: 'faq',
    advisory: 'enterprise',
    sponsorship: 'sponsorship',
    champion: 'champion',
    referrals: 'champion',
  };
  return mapping[pageCategory] || 'faq';
}
