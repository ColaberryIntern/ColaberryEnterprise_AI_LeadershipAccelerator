/**
 * SV0.2 - deterministic whitepaper parser. Input is `pdftotext -layout` output (pages separated by form feeds);
 * output is one structured manifest record minus the file-level fields (sha256, upload id) the script adds.
 *
 * Colaberry's whitepapers use a small, stable heading set (surveyed across all 39 on 2026-11-13), so a heading map is
 * enough; no LLM. Anything the map cannot find is left empty and named in `gaps`, never guessed.
 */
import { tagCapabilities } from './capabilityVocabulary';
import { extractOutcomeSentences, normalizeSpace, sentences } from './outcomeCheck';

type Bucket = 'summary' | 'problem' | 'solution' | 'tech' | 'outcome' | 'other';

/** Heading text (exact line, case-insensitive) -> bucket. */
const HEADINGS: Record<string, Bucket> = {
  'executive summary': 'summary',
  'business reason': 'problem', 'business challenge': 'problem', 'challenge': 'problem', 'purpose': 'problem',
  'objective': 'problem', 'objectives': 'problem',
  'solution': 'solution', 'approach and methodology': 'solution', 'data science & ai intervention': 'solution',
  'innovation': 'solution', 'ai techniques': 'solution', 'ai techniques and integration': 'solution', 'integration': 'solution',
  'technology used': 'tech', 'technological stack': 'tech', 'software and platforms': 'tech', 'technology architecture': 'tech',
  'tech stack': 'tech',
  'outcome': 'outcome', 'outcomes': 'outcome', 'key results': 'outcome', 'results achieved': 'outcome',
  'quantitative outcomes': 'outcome', 'business impact': 'outcome', 'strategic benefits': 'outcome',
  'operational efficiencies and cost savings': 'outcome', 'results': 'outcome', 'impact': 'outcome',
  'client profile': 'summary', 'the client': 'summary', 'the colaberry approach': 'solution', 'our process': 'solution',
  'our results': 'outcome', 'our solution': 'solution', 'business concern': 'problem', 'business problem': 'problem', 'the challenge': 'problem',
  'results and benefits': 'outcome', 'benefits': 'outcome',
  'conclusion': 'other', 'future prospects': 'other', 'testimonials': 'other', 'data utilization': 'other',
  'reporting scenarios': 'other', 'innovation and competitiveness': 'other',
};

const INDUSTRY_PREFIX: [RegExp, string][] = [
  [/^AgTech/i, 'AgTech'], [/^Utilit(y|ies)/i, 'Utilities'], [/^(Manf|Manufacturing)/i, 'Manufacturing'],
  [/^Energy/i, 'Energy'], [/^ClimateTech/i, 'ClimateTech'], [/^Healthcare/i, 'Healthcare'], [/^ConvoAI/i, 'Conversational AI'],
];

const FOOTER = /(Colaberry Inc\.\s+www\.colaberry\.com|www\.colaberry\.com\s+\d+\s+info@colaberry\.com)/i;
const BANNER = /^[A-Z &]+(INDUSTRY|COMPANIES)$/;
const BULLET = /^[•▪●•▪●-]\s*/;

export interface ParsedWhitepaper {
  title: string; industry: string; clientDescriptor: string; problem: string; solution: string;
  capabilities: string[]; techStack: string[]; outcomes: { text: string; numbers: string[]; page: number }[];
  pageCount: number; gaps: string[];
}

export function industryFromFilename(file: string): string {
  const base = file.replace(/^.*[\\/]/, '');
  for (const [re, name] of INDUSTRY_PREFIX) if (re.test(base)) return name;
  return 'Other';
}

/** Split into pages, then into heading buckets (concatenating repeated buckets). */
export function splitSections(raw: string): { pages: string[]; sections: Record<Bucket, string>; titleLines: string[] } {
  const pages = raw.split('\f').filter((p, i, a) => p.trim() || i < a.length - 1);
  const sections: Record<Bucket, string> = { summary: '', problem: '', solution: '', tech: '', outcome: '', other: '' };
  const titleLines: string[] = [];
  let current: Bucket | 'title' = 'title';
  for (const line of raw.replace(/\f/g, '\n').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || FOOTER.test(t)) continue;
    const head = t.toLowerCase().replace(/\s*:$/, '');
    const bucket = HEADINGS[head];
    if (bucket) { current = bucket; continue; }
    // Older two-column layout: "Heading: first words of the paragraph" on one line.
    const inline = t.match(/^([A-Za-z &]{3,40}):\s+(.+)$/);
    if (inline && HEADINGS[inline[1].toLowerCase()]) {
      const b = HEADINGS[inline[1].toLowerCase()];
      current = b;
      sections[b] += inline[2] + '\n';
      continue;
    }
    if (current === 'title') { if (!BANNER.test(t)) titleLines.push(t); continue; }
    sections[current] += t + '\n';
  }
  return { pages, sections, titleLines };
}

/** Labels of "Label: description" bullets in the technology sections, de-duplicated, in order. */
export function extractTechStack(techText: string): string[] {
  const out: string[] = [];
  for (const line of techText.split('\n')) {
    const m = line.replace(BULLET, '').match(/^([A-Z][A-Za-z0-9 .&/+()'-]{1,48}?):\s/);
    if (m && !out.includes(m[1].trim())) out.push(m[1].trim());
  }
  return out;
}

const DESCRIPTOR = /\b(?:a|an)\s+(?:(?:major|leading|large|global|prominent|regional|national|multinational|medical|environmental|agricultural|energy|utility|science|diagnostics|metal-processing|manufacturing|California-based|[A-Z][a-z]+-based)\s+){1,4}(?:[a-z-]+\s+){0,3}(?:company|companies|utility|organization|agency|laboratory|lab|clients?|firm|provider|manufacturer)\b/i;

export function findClientDescriptor(text: string): string {
  const m = normalizeSpace(text).match(DESCRIPTOR);
  return m ? m[0] : '';
}

/** First n sentences of a section, capped. */
const lead = (text: string, n: number, cap = 700): string => sentences(text).slice(0, n).join(' ').slice(0, cap);

function pageOf(pages: string[], sentence: string): number {
  const probe = normalizeSpace(sentence).slice(0, 40);
  const idx = pages.findIndex((p) => normalizeSpace(p).includes(probe));
  return idx >= 0 ? idx + 1 : 1;
}

export function parseWhitepaper(raw: string, sourceFile: string): ParsedWhitepaper {
  const { pages, sections, titleLines } = splitSections(raw);
  const gaps: string[] = [];
  const title = normalizeSpace(titleLines.join(' ')) || sourceFile.replace(/\.pdf$/i, '');
  if (!titleLines.length) gaps.push('title taken from filename');

  let problem = lead(sections.problem, 2);
  if (!problem) { problem = lead(sections.summary, 1); gaps.push('problem: no problem heading, used executive summary'); }
  let solution = lead(sections.solution, 3);
  if (!solution) { solution = lead(sections.summary, 2); gaps.push('solution: no solution heading, used executive summary'); }
  if (!problem) gaps.push('problem: empty');
  if (!solution) gaps.push('solution: empty');

  if (!sections.outcome) gaps.push('outcomes: no outcome heading');
  // Results are often stated in the summary or solution too; scan all three, outcome section first, de-duplicated.
  const seen = new Set<string>();
  const outcomes = [sections.outcome, sections.summary, sections.solution]
    .flatMap((t) => extractOutcomeSentences(t))
    .filter((o) => (seen.has(o.text) ? false : (seen.add(o.text), true)))
    .slice(0, 8)
    .map((o) => ({ ...o, page: pageOf(pages, o.text) }));

  const techStack = extractTechStack(sections.tech);
  if (!techStack.length) gaps.push('techStack: no labelled technology bullets');
  const body = [sections.summary, sections.problem, sections.solution, sections.tech, sections.outcome].join('\n');
  const capabilities = tagCapabilities(body);
  if (!capabilities.length) gaps.push('capabilities: no vocabulary match');

  return {
    title, industry: industryFromFilename(sourceFile), clientDescriptor: findClientDescriptor(sections.summary || body),
    problem, solution, capabilities, techStack, outcomes, pageCount: Math.max(1, pages.length), gaps,
  };
}
