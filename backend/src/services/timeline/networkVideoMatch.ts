/**
 * networkVideoMatch — PURE personalization helpers for the Testimonials selector.
 * No I/O, no DB, no imports: turns "what we know about a student" into signal tags
 * and scores a candidate video's match. Kept separate from networkVideoService so
 * it is trivially unit-testable (mirrors the repo's PURE-function test pattern).
 */

/** Map profile/role text -> the tag vocabulary the ingest tagger uses, so a
 *  student's role ("Registered Nurse") matches a testimonial tagged `nurse`. */
export const USER_TAG_RULES: Array<[RegExp, string]> = [
  [/nurse|nursing|\brn\b|cna\b/i, 'nurse'], [/teacher|educator|professor|instructor/i, 'teacher'],
  [/accountant|bookkeep|cpa\b/i, 'accountant'], [/engineer/i, 'engineer'], [/analyst/i, 'analyst'],
  [/manager|supervisor|director/i, 'manager'], [/pharmac/i, 'pharmacist'], [/lawyer|attorney|legal/i, 'legal'],
  [/recruiter|human resources|\bhr\b/i, 'hr'], [/military|veteran|army|navy|air force|marine/i, 'veteran'],
  [/customer service|call center|support/i, 'customer-service'], [/mechanic|technician/i, 'technician'],
  [/health|hospital|clinic|patient|medical/i, 'healthcare'], [/financ|bank|accounting/i, 'finance'],
  [/\bsales\b/i, 'sales'], [/insurance/i, 'insurance'], [/logistic|supply\s?chain|warehouse/i, 'logistics'],
  [/manufactur|factory/i, 'manufacturing'], [/educat|school|university/i, 'education'], [/retail|store/i, 'retail'],
  [/real\s?estate/i, 'real-estate'], [/utilit|energy|power/i, 'energy'], [/govern|public sector|federal/i, 'government'],
  [/hospitality|restaurant|hotel/i, 'hospitality'], [/transport|trucking|driver/i, 'transportation'],
  [/career\s?(switch|change|transition|pivot)/i, 'career-switch'], [/no\s?(it|tech|coding)|non[-\s]?tech/i, 'non-technical'],
  [/mother|mom|dad|father|parent|family/i, 'parent'], [/immigra|visa|h1b|h-1b/i, 'immigrant'],
  [/\bsql\b/i, 'sql'], [/power\s?bi/i, 'powerbi'], [/tableau/i, 'tableau'], [/data\s?analy/i, 'data-analytics'],
];

/** PURE — derive signal tags from free text (role/industry/goal). Applies the tag
 *  rules AND keeps distinctive raw tokens, so "Registered Nurse" yields both
 *  `nurse` and `healthcare`. */
export function deriveUserTagsFromText(text: string): Set<string> {
  const tags = new Set<string>();
  const t = (text || '').toLowerCase();
  if (!t.trim()) return tags;
  for (const [re, tag] of USER_TAG_RULES) if (re.test(t)) tags.add(tag);
  t.split(/[^a-z0-9]+/).forEach((w) => { if (w.length > 3) tags.add(w); });
  return tags;
}

/** PURE — deterministic personalization score: tag overlap (heaviest) + raw text
 *  hits. Higher = better match for this student. */
export function matchScore(videoTags: string[], videoText: string, userTags: Set<string>): number {
  const overlap = videoTags.filter((t) => userTags.has(t)).length;
  const hay = (videoText || '').toLowerCase();
  const textHits = [...userTags].filter((t) => t.length > 3 && hay.includes(t)).length;
  return overlap * 3 + textHits * 2;
}
