/**
 * proposalExtractor — DETERMINISTIC, dark-safe extraction of source-cited requirements from a solicitation
 * zip. No LLM, no network, no cost.
 *
 * It reads the zip ENTIRELY IN MEMORY (no temp dir, no disk write — so no zip-slip path-traversal), pulls
 * text per file (.pdf/.docx/.xlsx/.txt), and captures obligation sentences VERBATIM as requirement
 * candidates that each CITE their source block. It NEVER fabricates: a requirement is emitted only for text
 * that literally appears in the zip, and it is an HONEST first-pass capture — every row is `unassessed` and
 * NOT human-confirmed, for a person to assess. Real comprehension is the later (separately-approved) LLM step.
 */
// adm-zip is an undeclared/untyped dep (resolves via hoisted node_modules); the require() form keeps strict
// tsc from rejecting it (TS7016), matching backend/src/scripts/lib/govBidContentExtractor.js.
const AdmZip = require('adm-zip');

const CHARS_PER_FILE = 8000;
const CHARS_TOTAL = 80000;
const MAX_REQUIREMENTS = 200;
const MIN_SENTENCE_LEN = 12;
/** An obligation keyword marks a sentence as a candidate requirement (what the RFP says you must do/submit). */
const OBLIGATION = /\b(shall|must|will\s+provide|is\s+required|are\s+required|required\s+to|submit|provide)\b/i;

export interface ExtractedBlock {
  id: string;
  locator: string;
  text: string;
  kind: 'requirement' | 'context';
}
export interface ExtractedRequirement {
  canonicalReqId: string;
  statement: string;
  kind: string;
  priority: string;
  tracks: string[];
  sourceDocument: string;
  section: string;
  extractedText: string;
  interpretation: string | null;
  humanConfirmed: boolean;
  evidenceState: string;
  sourceEvidence: string[];
}
export interface ProposalExtraction {
  blocks: ExtractedBlock[];
  requirements: ExtractedRequirement[];
  fileCount: number;
}

const stripXmlTags = (s: string): string => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'file';
const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** Text out of one in-zip file buffer, by extension. Never throws — returns '' on unreadable/unsupported. */
function textFromEntry(name: string, buf: Buffer): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'txt' || ext === 'md') return buf.toString('utf8');
    if (ext === 'docx') {
      const doc = new AdmZip(buf).getEntry('word/document.xml');
      return doc ? stripXmlTags(doc.getData().toString('utf8')) : '';
    }
    if (ext === 'xlsx') {
      const inner = new AdmZip(buf);
      const strings = inner.getEntry('xl/sharedStrings.xml');
      return strings ? stripXmlTags(strings.getData().toString('utf8')) : '';
    }
    if (ext === 'pdf') {
      // pdf-parse v2 is a class-based, async API; extracted lazily via a synchronous shim is not possible,
      // so PDF text is pulled in extractProposal (async). This branch is unused (see extractProposal).
      return '';
    }
  } catch {
    return '';
  }
  return '';
}

/** Split into sentences on terminators or newlines; keeps the raw text for verbatim citation. */
function sentences(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/(?<=[.;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SENTENCE_LEN);
}

/**
 * Extract source blocks + source-cited requirement candidates from a solicitation zip buffer.
 * Deterministic, in-memory, never throws on a bad file (skips it).
 */
export async function extractProposal(zipBuffer: Buffer): Promise<ProposalExtraction> {
  const blocks: ExtractedBlock[] = [];
  const requirements: ExtractedRequirement[] = [];
  const seen = new Set<string>();
  let total = 0;
  let reqN = 0;
  let fileCount = 0;

  let entries: any[] = [];
  try {
    entries = new AdmZip(zipBuffer).getEntries().filter((e: any) => !e.isDirectory);
  } catch {
    return { blocks, requirements, fileCount: 0 };
  }
  entries.sort((a: any, b: any) => String(a.entryName).localeCompare(String(b.entryName)));

  // pdf-parse required lazily (only when a PDF is present); undeclared/untyped -> require() form.
  let PDFParse: any = null;

  for (const entry of entries) {
    if (total >= CHARS_TOTAL) break;
    const name: string = entry.entryName;
    const ext = (name.split('.').pop() || '').toLowerCase();
    let raw = '';
    try {
      if (ext === 'pdf') {
        if (!PDFParse) PDFParse = require('pdf-parse').PDFParse;
        const result = await new PDFParse({ data: entry.getData() }).getText();
        raw = result?.text || '';
      } else {
        raw = textFromEntry(name, entry.getData());
      }
    } catch {
      raw = '';
    }
    if (!raw.trim()) continue;
    fileCount++;

    let text = raw.slice(0, CHARS_PER_FILE);
    if (total + text.length > CHARS_TOTAL) text = text.slice(0, Math.max(0, CHARS_TOTAL - total));
    total += text.length;

    const ctxId = `blk-ctx-${slug(name)}`;
    blocks.push({ id: ctxId, locator: name, text, kind: 'context' });

    for (const s of sentences(text)) {
      if (requirements.length >= MAX_REQUIREMENTS) break;
      if (!OBLIGATION.test(s)) continue;
      const norm = s.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(norm)) continue;
      seen.add(norm);
      reqN += 1;
      const reqId = `REQ-${String(reqN).padStart(3, '0')}`;
      const blkId = `blk-${reqId}`;
      blocks.push({ id: blkId, locator: name, text: s, kind: 'requirement' });
      requirements.push({
        canonicalReqId: reqId,
        statement: truncate(s, 500),
        kind: 'compliance',
        priority: 'must',
        tracks: ['proposal', 'solution_build'],
        sourceDocument: name,
        section: name,
        extractedText: s,
        interpretation: null,
        humanConfirmed: false,
        evidenceState: 'unassessed',
        sourceEvidence: [blkId],
      });
    }
  }

  return { blocks, requirements, fileCount };
}
