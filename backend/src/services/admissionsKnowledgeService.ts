import AdmissionsKnowledgeEntry from '../models/AdmissionsKnowledgeEntry';
import { Op } from 'sequelize';

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

  // Score each entry by keyword overlap
  const scored = allEntries.map((entry) => {
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
 */
export async function buildKnowledgeContext(query: string, pageCategory?: string): Promise<string> {
  const entries = await findRelevantKnowledge({ query, pageCategory, limit: 4 });
  if (entries.length === 0) return '';

  const parts: string[] = ['KNOWLEDGE BASE (use these facts to answer accurately):'];
  for (const entry of entries) {
    parts.push(`[${entry.category.toUpperCase()}] ${entry.title}: ${entry.content}`);
  }

  return parts.join('\n');
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
  };
  return mapping[pageCategory] || 'faq';
}
