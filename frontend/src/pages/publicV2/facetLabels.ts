/**
 * Facet slugs, said the way a reader would say them.
 *
 * WHY IT EXISTS. The taxonomy is an OPEN vocabulary - the server derives it from
 * whatever published records happen to declare - so the slug is the only name a
 * facet has. `storiesV2Model` notes that display copy therefore belongs to the
 * renderer; nothing was doing that job, so every facet rendered raw. In a
 * checkbox list `correlated-persisted-audit-trail` is survivable. In a word cloud,
 * whose entire purpose is a glance, it is a wall of hyphens.
 *
 * IT CHANGES THE LABEL AND NEVER THE VALUE. The slug stays the filter value and
 * stays in the URL, so shared links keep working and the server sees exactly what
 * it saw before. This module is display only.
 *
 * IT IS ITS OWN FILE so the sidebar and the cloud import the SAME function. Two
 * controls over one filter state is only safe while they print the same words for
 * the same thing; a humaniser living inside either one would eventually drift.
 *
 * THE TWO MAPS ARE SHORT ON PURPOSE. They are a display nicety, not a dictionary.
 * A long list here becomes a second vocabulary to maintain beside the taxonomy,
 * and the failure mode of a missing entry is mild - a word reads as ordinary
 * prose instead of a brand.
 */

/** Rendered in capitals. */
const ACRONYMS = new Set([
  'ai', 'sql', 'mfa', 'api', 'ui', 'ux', 'css', 'html', 'ci', 'cd', 'llm', 'sdk', 'mcp',
]);

/** Rendered with the casing their owners use. */
const BRANDS = new Map<string, string>([
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['github', 'GitHub'],
  ['postgresql', 'PostgreSQL'],
  ['postgres', 'Postgres'],
  ['nodejs', 'Node.js'],
  ['openai', 'OpenAI'],
  ['claude', 'Claude'],
]);

function sayWord(word: string): string {
  const key = word.toLowerCase();
  const brand = BRANDS.get(key);
  if (brand) return brand;
  return ACRONYMS.has(key) ? word.toUpperCase() : word;
}

/**
 * `governed-ai-remediation` -> `Governed AI remediation`.
 *
 * Sentence case, not title case: these are phrases, and Title Case On Every Word
 * reads like a headline rather than a description of what a record covers. The
 * first word is only capitalised when it is an ordinary word - a leading acronym
 * or brand already carries its own casing and must not be flattened.
 */
export function humanizeFacetLabel(slug: string): string {
  const words = slug.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return slug;
  const spoken = words.map(sayWord);
  const [first, ...rest] = spoken;
  const firstKey = words[0].toLowerCase();
  const lead = ACRONYMS.has(firstKey) || BRANDS.has(firstKey)
    ? first
    : first.charAt(0).toUpperCase() + first.slice(1);
  return [lead, ...rest].join(' ');
}

export default humanizeFacetLabel;
