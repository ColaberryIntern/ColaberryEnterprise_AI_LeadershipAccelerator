/**
 * Requirements Parser Service — Section-Aware Parsing
 *
 * Parses a requirements document into structured sections with
 * individually trackable requirements. This is the SOURCE OF TRUTH
 * for project completion tracking.
 */

export interface ParsedRequirement {
  key: string;   // REQ-001, REQ-002, etc.
  text: string;  // requirement text
  section: string;
}

export interface ParsedSection {
  name: string;
  requirements: ParsedRequirement[];
}

export interface ParsedRequirements {
  sections: ParsedSection[];
  total_requirements: number;
  flat: ParsedRequirement[];  // all requirements in order
}

/**
 * Parse a requirements document into sections with trackable requirements.
 * Supports markdown with ## section headers and bullet/numbered lists.
 * Falls back to flat list if no headers found.
 */
export function parseRequirementsWithSections(docText: string): ParsedRequirements {
  const lines = docText.split('\n');
  const sections: ParsedSection[] = [];
  let currentSection = 'General';
  let reqIndex = 0;

  // First pass: detect if there are any section headers
  const hasHeaders = lines.some(line => /^#{1,3}\s+/.test(line.trim()));

  if (!hasHeaders) {
    // No headers — treat entire document as one section
    const requirements = extractRequirementsFromLines(lines, 'General', reqIndex);
    if (requirements.length > 0) {
      sections.push({ name: 'General', requirements });
    }
  } else {
    // Parse with section headers
    let currentLines: string[] = [];

    for (const line of lines) {
      const headerMatch = line.trim().match(/^#{1,3}\s+(.+)/);

      if (headerMatch) {
        // Process accumulated lines for previous section
        if (currentLines.length > 0) {
          const reqs = extractRequirementsFromLines(currentLines, currentSection, reqIndex);
          if (reqs.length > 0) {
            sections.push({ name: currentSection, requirements: reqs });
            reqIndex += reqs.length;
          }
          currentLines = [];
        }
        currentSection = headerMatch[1].trim()
          .replace(/^\d+\.\s*/, '')  // remove leading numbers
          .replace(/[*_]/g, '');      // remove markdown emphasis
      } else {
        currentLines.push(line);
      }
    }

    // Process remaining lines
    if (currentLines.length > 0) {
      const reqs = extractRequirementsFromLines(currentLines, currentSection, reqIndex);
      if (reqs.length > 0) {
        sections.push({ name: currentSection, requirements: reqs });
      }
    }
  }

  // Build flat list
  const flat = sections.flatMap(s => s.requirements);

  return {
    sections,
    total_requirements: flat.length,
    flat,
  };
}

/**
 * Extract individual requirements from lines of text.
 * Recognizes: bullet points (- * •), numbered lists (1. 2.), and key-value pairs.
 */
function extractRequirementsFromLines(
  lines: string[],
  sectionName: string,
  startIndex: number
): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];
  let idx = startIndex;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip headers, horizontal rules, and metadata
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^[-=]{3,}$/.test(trimmed)) continue;
    if (/^>/.test(trimmed)) continue;  // blockquotes

    // Match bullet points: - item, * item, • item
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (text.length > 10) {  // skip very short items (likely sub-bullets or noise)
        idx++;
        requirements.push({
          key: `REQ-${String(idx).padStart(3, '0')}`,
          text,
          section: sectionName,
        });
      }
      continue;
    }

    // Match numbered lists: 1. item, 1) item
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numberedMatch) {
      const text = numberedMatch[1].trim();
      if (text.length > 10) {
        idx++;
        requirements.push({
          key: `REQ-${String(idx).padStart(3, '0')}`,
          text,
          section: sectionName,
        });
      }
      continue;
    }

    // Match checkbox items: - [ ] item, - [x] item
    const checkboxMatch = trimmed.match(/^-\s*\[[ x]\]\s+(.+)/i);
    if (checkboxMatch) {
      idx++;
      requirements.push({
        key: `REQ-${String(idx).padStart(3, '0')}`,
        text: checkboxMatch[1].trim(),
        section: sectionName,
      });
      continue;
    }
  }

  return requirements;
}
