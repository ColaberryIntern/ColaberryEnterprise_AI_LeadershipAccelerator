export interface Placeholder {
  name: string;
  description: string;
  example: string;
}

export interface PromptTemplateData {
  template: string;
  placeholders?: Placeholder[];
  expected_output_shape?: string;
  variables?: string[];
  example_filled?: string;
  iteration_tips?: string;
}

/**
 * Derive placeholders from either new shape (placeholders array) or legacy shape (variables array).
 */
export function derivePlaceholders(data: PromptTemplateData): Placeholder[] {
  return data.placeholders || (data.variables || []).map(v => ({
    name: v,
    description: '',
    example: '',
  }));
}

/**
 * Build an auto-fill map from a learner profile's structured fields and personalization_context_json.
 */
export function buildAutoFillMap(learnerProfile: Record<string, any> | null | undefined): Record<string, string> {
  if (!learnerProfile) return {};
  const map: Record<string, string> = {};
  if (learnerProfile.company_name) {
    map['company_name'] = learnerProfile.company_name;
    map['company'] = learnerProfile.company_name;
  }
  if (learnerProfile.industry) {
    map['industry'] = learnerProfile.industry;
    map['sector'] = learnerProfile.industry;
  }
  if (learnerProfile.role) {
    map['role'] = learnerProfile.role;
  }
  if (learnerProfile.goal) {
    map['goal'] = learnerProfile.goal;
  }
  if (learnerProfile.identified_use_case) {
    map['identified_use_case'] = learnerProfile.identified_use_case;
    map['use_case'] = learnerProfile.identified_use_case;
  }
  if (learnerProfile.ai_maturity_level) {
    // Map numeric levels (1-4) to descriptive strings for prompt context
    const maturityMap: Record<number, string> = { 1: 'exploring', 2: 'piloting', 3: 'scaling', 4: 'embedded' };
    const val = learnerProfile.ai_maturity_level;
    map['ai_maturity_level'] = typeof val === 'number' ? (maturityMap[val] || String(val)) : String(val);
  }
  if (learnerProfile.company_size) {
    map['company_size'] = String(learnerProfile.company_size);
  }
  if (learnerProfile.full_name) {
    map['full_name'] = learnerProfile.full_name;
  }
  if (learnerProfile.email) {
    map['email'] = learnerProfile.email;
  }
  if (learnerProfile.title) {
    map['title'] = learnerProfile.title;
  }
  if (learnerProfile.personalization_context_json) {
    for (const [key, val] of Object.entries(learnerProfile.personalization_context_json)) {
      if (val && !map[key]) map[key] = val as string;
    }
  }
  return map;
}

/**
 * Get the effective value for a placeholder, checking manual fill values first,
 * then auto-fill map (exact match, then lowercase).
 */
export function getEffectiveValue(
  phName: string,
  fillValues: Record<string, string>,
  autoFillMap: Record<string, string>
): string {
  return fillValues[phName] || autoFillMap[phName] || autoFillMap[phName.toLowerCase()] || '';
}

/**
 * Build effective values for all placeholders.
 */
export function getEffectiveValues(
  placeholders: Placeholder[],
  fillValues: Record<string, string>,
  autoFillMap: Record<string, string>
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const ph of placeholders) {
    values[ph.name] = getEffectiveValue(ph.name, fillValues, autoFillMap);
  }
  return values;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'of', 'in', 'to', 'for',
  'with', 'on', 'at', 'from', 'by', 'about', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
  'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'because', 'if', 'when', 'where', 'how', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its',
  'you', 'your', 'we', 'our', 'they', 'their', 'i', 'my', 'me',
]);

/**
 * Extract meaningful keywords from a string for matching.
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Find all questions (sentences ending in ?) in template text.
 * Returns array of { question, startIndex, endIndex } for each question found.
 */
export function findQuestions(template: string): Array<{ question: string; endIndex: number }> {
  const results: Array<{ question: string; endIndex: number }> = [];
  const regex = /[^.?!\n]*\?/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    results.push({
      question: match[0].trim(),
      endIndex: match.index + match[0].length,
    });
  }
  return results;
}

/**
 * Score how well a placeholder description matches a question, using keyword overlap.
 */
export function scoreMatch(descKeywords: string[], questionText: string): number {
  const qKeywords = extractKeywords(questionText);
  let score = 0;
  for (const kw of descKeywords) {
    if (qKeywords.some(qk => qk.includes(kw) || kw.includes(qk))) {
      score++;
    }
  }
  return score;
}

/**
 * Try to insert an answer inline after the best-matching question in the template.
 * Returns the modified template if a match is found, or null if no match.
 */
export function tryInsertAfterQuestion(
  template: string,
  description: string,
  answer: string,
  usedIndices: Set<number>
): { result: string; matchIndex: number } | null {
  const questions = findQuestions(template);
  if (questions.length === 0) return null;

  const descKeywords = extractKeywords(description);
  if (descKeywords.length === 0) return null;

  let bestScore = 0;
  let bestIdx = -1;

  for (let i = 0; i < questions.length; i++) {
    if (usedIndices.has(i)) continue;
    const score = scoreMatch(descKeywords, questions[i].question);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // Require at least 1 keyword match
  if (bestScore < 1 || bestIdx === -1) return null;

  const q = questions[bestIdx];
  const before = template.slice(0, q.endIndex);
  const after = template.slice(q.endIndex);
  return {
    result: `${before}\nAnswer: ${answer}${after}`,
    matchIndex: bestIdx,
  };
}

/**
 * Build a filled template from a values map.
 * If the template contains {{placeholder}} markers, replaces them.
 * If no markers are found, inserts answers inline after matching questions.
 */
export function buildFilledTemplate(
  template: string,
  placeholders: Placeholder[],
  values: Record<string, string>
): string {
  let result = template;
  let anyReplaced = false;

  for (const ph of placeholders) {
    const value = values[ph.name];
    if (value) {
      const regex = new RegExp(`\\{\\{${ph.name}\\}\\}|\\{${ph.name}\\}`, 'g');
      if (regex.test(result)) {
        result = result.replace(new RegExp(`\\{\\{${ph.name}\\}\\}|\\{${ph.name}\\}`, 'g'), value);
        anyReplaced = true;
      }
    }
  }

  // Fallback: insert answers inline after matching questions
  if (!anyReplaced && placeholders.length > 0) {
    const usedIndices = new Set<number>();
    const remainingValues: string[] = [];

    for (const ph of placeholders) {
      const val = values[ph.name];
      if (!val) continue;

      const desc = ph.description || ph.name.replace(/_/g, ' ');
      const inserted = tryInsertAfterQuestion(result, desc, val, usedIndices);
      if (inserted) {
        result = inserted.result;
        usedIndices.add(inserted.matchIndex);
      } else {
        remainingValues.push(`${desc}: ${val}`);
      }
    }

    // Any unmatched placeholders go at the top as context
    if (remainingValues.length > 0) {
      result = `My context:\n${remainingValues.join('\n')}\n\n${result}`;
    }
  }

  return result;
}
