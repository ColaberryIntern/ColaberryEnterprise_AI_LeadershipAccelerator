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
import { docxToText, xlsxToText } from './ooxmlText';
import { classifyDocuments, SINGLE_ITEM_ROLES, roleLabel, type DocRole } from './documentClassifier';
import { detectRfpComplianceRules, type RfpComplianceFinding } from './rfpComplianceRules';
// adm-zip is an undeclared/untyped dep (resolves via hoisted node_modules); the require() form keeps strict
// tsc from rejecting it (TS7016), matching backend/src/scripts/lib/govBidContentExtractor.js.
const AdmZip = require('adm-zip');

// Safety ceilings, NOT comprehension limits. The old 8,000 / 80,000 caps read only the first ~16% of a real
// 25-page RFP (it stopped mid-page 4), missing the insurance, performance bond, budget cap, required
// deliverables, references, and evaluation criteria — the very things that decide a bid. Read the WHOLE
// document; truncate only to protect memory against a pathological upload (a 1,000-page scanned appendix).
const CHARS_PER_FILE = 400_000;
const CHARS_TOTAL = 1_500_000;
const MAX_REQUIREMENTS = 200;
const MIN_SENTENCE_LEN = 12;
/** The file types the extractor can pull text from. Anything else is recorded as 'unsupported', never silently dropped. */
const SUPPORTED_EXT = new Set(['txt', 'md', 'docx', 'xlsx', 'pdf']);
/** An obligation keyword marks a sentence as a candidate requirement (what the RFP says you must do/submit).
 *  Broadened past the strict shall/must set because real solicitations (and Bonfire requirements-response
 *  templates) phrase obligations many ways — `should`, `responsible for`, `ensure`, `needs to`, and the
 *  "Describe/Demonstrate your approach to…" prompts of a scored-criteria matrix. A candidate is only a
 *  SUGGESTION the reviewer confirms, so missing a real requirement (zero candidates) is far costlier than a
 *  spare one; this errs toward capture. Strict superset of the old pattern — every previous match still matches. */
const OBLIGATION = /\b(?:shall|must|should|will\s+(?:provide|be|perform|deliver|support|include|furnish|maintain|ensure|respond)|responsible\s+for|is\s+responsible|are\s+responsible|needs?\s+to|ensure|describe|demonstrate|capable\s+of|submit|provide|required)\b/i;

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
/** Opportunity dossier — best-effort, DETERMINISTIC facts detected from the ZIP text (no LLM). Every item is a
 *  literal match and cites its source document; it is "detected — verify", never authoritative. */
export interface DossierContact { kind: 'email' | 'phone'; value: string; sourceDocument: string; }
export interface DossierLine {
  text: string;
  date: string | null;
  /** Time-of-day if literally stated in the same sentence (e.g. "2:00 PM"); null otherwise. */
  time: string | null;
  /** Timezone ONLY if an UNAMBIGUOUS one is literally stated (CST/CDT/EST/.../UTC/GMT/"Central Time"…); null
   *  otherwise. NEVER inferred. A non-null `time` with a null `timezone` means the zone was not stated and the
   *  deadline's absolute moment MUST be verified before relying on it — a missed-by-timezone deadline loses the bid. */
  timezone: string | null;
  sourceDocument: string;
}
/** A detected procurement commodity/industry code WITH its code SYSTEM made explicit — never assume NAICS.
 *  `naics` (North American Industry Classification, 6 digits) and `nigp` (NIGP commodity code, class-item
 *  NNN-NN) are different systems a solicitation may cite; labelling which one a code belongs to is the point. */
export interface DossierCode { system: 'naics' | 'nigp'; code: string; sourceDocument: string; }
export interface ExtractedDossier {
  contacts: DossierContact[];
  /** Retained for existing consumers: the NAICS codes only, as bare strings (mirrors the `naics` entries in `codes`). */
  naics: string[];
  /** Every detected procurement code, each tagged with its explicit system (naics | nigp). The forward model. */
  codes: DossierCode[];
  meetings: DossierLine[];
  keyDates: DossierLine[];
  /** Submission-mechanics obligations stated in the solicitation BODY (not on the response checklist): a required
   *  separate cost file, a required redacted copy, a stated offer-validity period. Each cites a literal quote. */
  complianceRules: RfpComplianceFinding[];
}
/** Per-file extraction outcome — one row per file in the ZIP, so NOTHING is silently dropped. A reviewer sees
 *  every file and exactly what happened to it (extracted / empty / unsupported / unreadable / scanned PDF /
 *  not-read-because-the-budget-filled), plus whether the text was truncated. */
export type FileExtractStatus =
  | 'extracted' | 'empty' | 'unsupported' | 'unreadable' | 'image_only_pdf' | 'skipped_budget' | 'duplicate';
export interface ExtractedFileOutcome {
  name: string;
  status: FileExtractStatus;
  /** The classified role of this file (solicitation / form / tax_form / contract_terms / …), so the UI can group
   *  files and the reviewer sees WHY a form yielded one item while the RFP yielded many. Absent for an unread file. */
  role?: DocRole;
  /** Characters captured (after truncation). 0 for anything not extracted. */
  chars: number;
  /** True when the captured text was cut short by the per-file or total char budget. */
  truncated: boolean;
  /** Human-readable note; null only for a file cleanly extracted in full. */
  warning: string | null;
}
export interface ProposalExtraction {
  blocks: ExtractedBlock[];
  requirements: ExtractedRequirement[];
  dossier: ExtractedDossier;
  fileCount: number;
  /** Every file in the ZIP with its extraction outcome — the honesty rail: no file is silently skipped. */
  files: ExtractedFileOutcome[];
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const NAICS_RE = /\bNAICS\s*(?:code)?\s*[:#]?\s*(\d{6})\b/gi;
// NIGP commodity code — REQUIRES the "NIGP" label (like NAICS), so a bare "920-05" number is never mislabelled.
// Allows up to 20 NON-DIGIT chars of filler between the label and the code ("code is", "commodity code", ":",
// "-") so real phrasings match, but the non-digit bound keeps the match LOCAL to the label (it can't reach a
// number in another clause). Accepts class-item "920-05" / "920 05" / "92005"; normalised to "NNN-NN" at capture.
const NIGP_RE = /\bNIGP\b[^\d]{0,20}?(\d{3}[-\s]?\d{2})\b/gi;
const MEETING_RE = /\b(pre[- ]?bid|pre[- ]?proposal|pre[- ]?submittal|site\s+visit|site\s+inspection|q\s*&\s*a|question\s+and\s+answer|industry\s+day|walk[- ]?through)\b/i;
// Anchored on the reliable date-announcing tokens; "due" covers "proposals/questions/responses ARE due", "due date",
// "due by". The key-date path ALSO requires a literal date in the same sentence, so these loose anchors never fire alone.
const KEYDATE_RE = /\b(due|deadline|closing\s+date|closes|submission\s+deadline|inquir(?:y|ies)|no\s+later\s+than|received\s+by|submitted\s+by|must\s+be\s+received)\b/i;
// Accepts "03/15/2026", "March 15, 2026", and ORDINAL forms real RFPs use — "Nov. 6th, 2026",
// "November 6th 2026" — which the non-ordinal pattern silently missed (the Snow RFP's "Nov. 6th" deadline).
const DATE_RE = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4})\b/i;
// Time-of-day: "2:00 PM", "14:00", "2:00", "2 p.m.", "2pm". Best-effort; within a key-date sentence a "2:00" is a time.
const TIME_RE = /\b(\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)\b/i;
// Timezone: ONLY unambiguous forms. The 3-letter US zones (CST/CDT/EST/EDT/MST/MDT/PST/PDT), UTC/GMT, and the
// spelled-out "<Region> Time". Deliberately NOT the bare 2-letter CT/ET/MT/PT in free text — those collide with
// ordinary words (CT=Connecticut/court, ET=et al.), and a false zone is worse than a null that says "verify".
const TZ_RE = /\b(C[SD]T|E[SD]T|M[SD]T|P[SD]T|UTC|GMT|(?:Central|Eastern|Mountain|Pacific)(?:\s+(?:Standard|Daylight))?\s+Time)\b/i;
// The ONE place a 2-letter zone is trustworthy: immediately after a real time of day (with :MM or am/pm),
// "5:00 p.m. MT". The adjacency removes the free-text collision, so we accept CT/ET/MT/PT there and only there.
// This is the Snow-RFP deadline ("5:00 p.m. MT") the unambiguous-only rule above otherwise left zone-less.
const TIME_ADJ_TZ_RE = /\d{1,2}(?::\d{2}\s*(?:[ap]\.?m\.?)?|\s*[ap]\.?m\.?)\s*\b([CEMP]T)\b/i;

/** PURE: pull the first stated date, time, and (only if unambiguous) timezone from one line of text. */
function whenOf(str: string): { date: string | null; time: string | null; timezone: string | null } {
  const dateM = str.match(DATE_RE);
  const timeM = str.match(TIME_RE);
  const tzM = str.match(TZ_RE);
  let timezone = tzM ? tzM[1].replace(/\s+/g, ' ').trim() : null;
  if (!timezone) {
    // No unambiguous zone — fall back to a 2-letter zone ONLY when it sits right after a time (TIME_ADJ_TZ_RE),
    // never in free text. "5:00 p.m. MT" → "MT"; a bare "CT" elsewhere stays null (verify).
    const adj = str.match(TIME_ADJ_TZ_RE);
    if (adj) timezone = adj[1].toUpperCase();
  }
  return {
    date: dateM ? dateM[1] : null,
    time: timeM ? timeM[1].replace(/\s+/g, ' ').trim() : null,
    timezone,
  };
}

/**
 * PURE: pull an opportunity dossier (contacts, NAICS, meeting + key-date lines) from the extracted context blocks.
 * Deterministic regex over the literal text; de-duplicated and capped; each item cites its source document.
 * Best-effort and "detected — verify": it never invents a value and emits only what literally appears. Total.
 */
export function extractDossier(blocks: ExtractedBlock[]): ExtractedDossier {
  const contacts: DossierContact[] = [];
  const naics: string[] = [];
  const codes: DossierCode[] = [];
  const meetings: DossierLine[] = [];
  const keyDates: DossierLine[] = [];
  const seenContact = new Set<string>();
  const seenNaics = new Set<string>();
  const seenCode = new Set<string>();
  const ctx = (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.kind === 'context');

  for (const b of ctx) {
    const text = String(b.text ?? '');
    const doc = String(b.locator ?? '');
    for (const m of text.match(EMAIL_RE) ?? []) {
      const v = m.toLowerCase();
      if (!seenContact.has(v) && contacts.length < 12) { seenContact.add(v); contacts.push({ kind: 'email', value: m, sourceDocument: doc }); }
    }
    for (const m of text.match(PHONE_RE) ?? []) {
      const v = m.replace(/[^\d]/g, '');
      if (v.length >= 10 && !seenContact.has(v) && contacts.length < 20) { seenContact.add(v); contacts.push({ kind: 'phone', value: m.trim(), sourceDocument: doc }); }
    }
    let nm: RegExpExecArray | null;
    NAICS_RE.lastIndex = 0;
    while ((nm = NAICS_RE.exec(text)) !== null) {
      const code = nm[1];
      if (!seenNaics.has(code) && naics.length < 6) { seenNaics.add(code); naics.push(code); }
      const key = `naics:${code}`;
      if (!seenCode.has(key) && codes.length < 20) { seenCode.add(key); codes.push({ system: 'naics', code, sourceDocument: doc }); }
    }
    let gm: RegExpExecArray | null;
    NIGP_RE.lastIndex = 0;
    while ((gm = NIGP_RE.exec(text)) !== null) {
      const digits = gm[1].replace(/\D/g, ''); // "920 05" / "920-05" / "92005" → "92005"
      const code = `${digits.slice(0, 3)}-${digits.slice(3)}`; // normalise to class-item NNN-NN
      const key = `nigp:${code}`;
      if (!seenCode.has(key) && codes.length < 20) { seenCode.add(key); codes.push({ system: 'nigp', code, sourceDocument: doc }); }
    }
    const sents = sentences(text);
    for (let i = 0; i < sents.length; i++) {
      const s = sents[i];
      let { date, time, timezone } = whenOf(s);
      if (meetings.length < 10 && MEETING_RE.test(s)) {
        // A conference / site visit is usually LABELLED on one line ("Pre-Proposal Conference:") and DATED on the
        // next (or in the next table cell). When the meeting's own line carries no date, borrow it from the
        // immediately following line - as long as that line is not itself another meeting - so the meeting actually
        // shows WHEN it is. Still "detected - verify"; it gates nothing.
        if (!date && i + 1 < sents.length && !MEETING_RE.test(sents[i + 1])) {
          const nxt = whenOf(sents[i + 1]);
          if (nxt.date) { date = nxt.date; time = time ?? nxt.time; timezone = timezone ?? nxt.timezone; }
        }
        meetings.push({ text: truncate(s, 240), date, time, timezone, sourceDocument: doc });
      } else if (keyDates.length < 10 && KEYDATE_RE.test(s) && date) {
        keyDates.push({ text: truncate(s, 240), date, time, timezone, sourceDocument: doc });
      }
    }
  }
  // Submission-mechanics rules are detected over the WHOLE solicitation body (they are usually stated once, in the
  // instructions, not per-requirement), so run them on the joined context text rather than per block.
  const complianceRules = detectRfpComplianceRules(ctx.map((b) => String(b.text ?? '')).join('\n'));
  return { contacts, naics, codes, meetings, keyDates, complianceRules };
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'file';
const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
// A fill-and-sign form / tax form becomes ONE item, cited by a verbatim line from the file — its first real line.
function firstMeaningfulLine(text: string): string | null {
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length >= 8 && /[A-Za-z]/.test(line)) return truncate(line, 200);
  }
  return null;
}
// Material contract clauses — the ones in a Terms & Conditions template that actually create an obligation. A T&C
// file contributes these (plus one "review and note exceptions" item) instead of every boilerplate sentence.
// Leading \b only, NO trailing \b: these are STEMS that must match their inflections (indemnif->indemnify,
// liabilit->liability, licens->license/licensed, terminat->termination, warrant->warranty, bond->bonded/bonding).
// A trailing \b broke that — "indemnif\b" does not match "indemnify" (no boundary between f and y).
const MATERIAL_TERM_RE = /\b(?:insurance|bond|indemnif|liabilit|licens|E-?Verify|prevailing\s+wage|non[-\s]?collusion|conflict\s+of\s+interest|confidential|non[-\s]?disclosure|warrant|terminat|data\s+(?:security|privacy|protection)|HIPAA|FERPA|SOC\s*2|background\s+check|compliance\s+with|equal\s+(?:employment\s+)?opportunity|prohibited|debarment)/i;

/** Text out of one in-zip file buffer, by extension. Never throws — returns '' on unreadable/unsupported.
 *  .docx/.xlsx delegate to the structure-aware ooxmlText reader so table rows and spreadsheet cells keep
 *  their boundaries (a requirements matrix reads as rows, not one run-on blob). */
function textFromEntry(name: string, buf: Buffer): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'txt' || ext === 'md') return buf.toString('utf8');
    if (ext === 'docx') return docxToText(buf);
    if (ext === 'xlsx') return xlsxToText(buf);
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

/** A line that STARTS a new logical block: a bullet/number list marker, or a heading. Such a line is
 *  never glued onto the previous one, so a list or a new section is not swallowed into a prior sentence. */
const LIST_MARK = /^(?:[-*•]|\(?\d+[.)]|[A-Za-z][.)])\s+/;
const HEADING_WORD = /^(?:section|article|part|exhibit|attachment|appendix|schedule|addendum|clause)\b/i;
function isHardStart(line: string): boolean {
  if (LIST_MARK.test(line)) return true;
  if (HEADING_WORD.test(line)) return true;
  // A multi-word ALL-CAPS line reads as a heading ("SCOPE OF WORK"), so it is not glued to prose.
  if (line.length >= 4 && line.length <= 80 && /\s/.test(line) && /[A-Z]/.test(line) && !/[a-z]/.test(line)) return true;
  return false;
}

/**
 * Split text into sentences, keeping the raw text for verbatim citation.
 *
 * When `joinWraps` is true (plain text and PDF, where a newline is usually a SOFT line wrap from the
 * renderer, not a real boundary), lines broken mid-sentence are rejoined with a space BEFORE splitting,
 * so a requirement wrapped across two lines stays ONE sentence (the Herriman "...asset management and" /
 * "work order tracking..." symptom). A newline stays a HARD break only when the previous line already
 * ends a sentence (. ; :), the line is blank, or the next line starts a list marker or heading - so a
 * "...the following elements:" intro keeps its list, and a new section is not swallowed.
 *
 * When `joinWraps` is false (.docx / .xlsx, where ooxmlText has already made table rows and spreadsheet
 * cells the boundaries), behaviour is UNCHANGED: every newline splits, so cells never re-fuse.
 */
// A period inside an abbreviation is NOT a sentence boundary. "due by 5:00 p.m. MT on Nov. 6th, 2026" must stay
// ONE sentence, or the splitter shatters the time/zone away from the date and the deadline is never captured.
// Mask the abbreviation periods (a.m./p.m. and month abbreviations) with a sentinel before the split, and restore
// them to a real '.' before any sentence is returned — so requirement text stays verbatim.
const ABBR_SENTINEL = '';
function protectAbbrevPeriods(s: string): string {
  return s
    .replace(/\b([ap])\.m\./gi, `$1${ABBR_SENTINEL}m${ABBR_SENTINEL}`)
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\./gi, `$1${ABBR_SENTINEL}`);
}

function sentences(text: string, joinWraps = false): string[] {
  const normalized = protectAbbrevPeriods(text.replace(/\r\n?/g, '\n'));
  let logicalText = normalized;
  if (joinWraps) {
    const logical: string[] = [];
    let blockBreak = true; // start of text, or just after a blank line or a heading
    for (const rawLine of normalized.split('\n')) {
      const line = rawLine.trim();
      if (line === '') { blockBreak = true; continue; }
      const prev = logical.length ? logical[logical.length - 1] : null;
      const hardStart = isHardStart(line);
      const canContinue = prev !== null && !blockBreak && !/[.;:]$/.test(prev) && !hardStart;
      if (canContinue) logical[logical.length - 1] = `${prev} ${line}`;
      else logical.push(line);
      // After a heading the next line starts fresh; a LIST item still accepts its own wrapped continuation.
      blockBreak = hardStart && !LIST_MARK.test(line);
    }
    logicalText = logical.join('\n');
  }
  return logicalText
    .split(/(?<=[.;:])\s+|\n+/)
    .map((s) => s.split(ABBR_SENTINEL).join('.').trim())   // restore the protected abbreviation periods
    .filter((s) => s.length >= MIN_SENTENCE_LEN);
}

/**
 * Extract source blocks + source-cited requirement candidates from a solicitation zip buffer.
 * Deterministic, in-memory, never throws on a bad file (skips it).
 */
export async function extractProposal(zipBuffer: Buffer): Promise<ProposalExtraction> {
  const blocks: ExtractedBlock[] = [];
  const requirements: ExtractedRequirement[] = [];
  const files: ExtractedFileOutcome[] = [];
  const seen = new Set<string>();
  let total = 0;
  let reqN = 0;
  let fileCount = 0;

  let entries: any[] = [];
  let openedZip = false;
  try {
    entries = new AdmZip(zipBuffer).getEntries().filter((e: any) => !e.isDirectory);
    openedZip = true;
  } catch {
    openedZip = false;
  }
  // The upload is often NOT a zip-of-files but a LONE document, and both cases otherwise produce a silent zero:
  //   (1) a lone PDF — adm-zip THROWS (a PDF is not a zip container), so nothing is ever read;
  //   (2) a lone .docx — adm-zip OPENS it (a .docx IS a zip), but its entries are the OOXML parts
  //       (word/document.xml, …), none of a SUPPORTED_EXT, so every entry is 'unsupported' → zero.
  // In both, treat the WHOLE buffer as that single document so its obligations are still captured. A single
  // synthetic entry reuses the normal per-file read path below (ext decides PDF vs docx).
  const looksPdf = zipBuffer.length >= 5 && zipBuffer.toString('latin1', 0, 5) === '%PDF-';
  const looksDocx = openedZip && entries.some((e: any) => String(e.entryName) === 'word/document.xml');
  if (looksPdf) {
    entries = [{ entryName: 'solicitation.pdf', isDirectory: false, getData: () => zipBuffer }];
  } else if (looksDocx) {
    entries = [{ entryName: 'solicitation.docx', isDirectory: false, getData: () => zipBuffer }];
  } else if (!openedZip) {
    // Genuinely couldn't open and it isn't a lone PDF — DON'T fail silently (the old behavior returned an empty
    // files[] that surfaced as a bare "no requirements detected", indistinguishable from "read it, found none").
    // Record one legible outcome so the operator knows WHY and what to do.
    files.push({ name: 'upload', status: 'unreadable', chars: 0, truncated: false,
      warning: 'The upload did not open as a readable ZIP (it may be password-protected, an encrypted/ZIP64 archive, or not a ZIP at all). Re-export the solicitation ZIP from the source and upload again, or establish the requirements by hand.' });
    return { blocks, requirements, dossier: { contacts: [], naics: [], codes: [], meetings: [], keyDates: [], complianceRules: [] }, fileCount: 0, files };
  }
  entries.sort((a: any, b: any) => String(a.entryName).localeCompare(String(b.entryName)));

  // pdf-parse required lazily (only when a PDF is present); undeclared/untyped -> require() form.
  let PDFParse: any = null;
  // PASS 1 reads every file's text; classification + per-role extraction happen AFTER, over the whole set.
  const readFiles: Array<{ name: string; ext: string; text: string; ctxId: string }> = [];

  for (const entry of entries) {
    const name: string = entry.entryName;
    const ext = (name.split('.').pop() || '').toLowerCase();

    // Record an outcome for EVERY file — never silently skip. Budget-first, then type, then read.
    if (total >= CHARS_TOTAL) {
      files.push({ name, status: 'skipped_budget', chars: 0, truncated: false,
        warning: `Not read: the ${CHARS_TOTAL}-character extraction budget was already reached by earlier files — review this one manually.` });
      continue;
    }
    if (!SUPPORTED_EXT.has(ext)) {
      files.push({ name, status: 'unsupported', chars: 0, truncated: false,
        warning: `Unsupported file type (.${ext || 'none'}) — not extracted; review it manually.` });
      continue;
    }

    let raw = '';
    let threw = false;
    try {
      if (ext === 'pdf') {
        if (!PDFParse) PDFParse = require('pdf-parse').PDFParse;
        const result = await new PDFParse({ data: entry.getData() }).getText();
        raw = result?.text || '';
      } else {
        raw = textFromEntry(name, entry.getData());
      }
    } catch {
      threw = true;
    }

    if (threw) {
      files.push({ name, status: 'unreadable', chars: 0, truncated: false,
        warning: 'Could not read this file (corrupt, encrypted, or an unsupported internal format) — review it manually.' });
      continue;
    }
    if (!raw.trim()) {
      const scanned = ext === 'pdf';
      files.push({ name, status: scanned ? 'image_only_pdf' : 'empty', chars: 0, truncated: false,
        warning: scanned
          ? 'No extractable text (likely a scanned / image-only PDF) — review it manually or run OCR.'
          : 'No extractable text found in this file — review it manually.' });
      continue;
    }

    fileCount++;
    let text = raw.slice(0, CHARS_PER_FILE);
    if (total + text.length > CHARS_TOTAL) text = text.slice(0, Math.max(0, CHARS_TOTAL - total));
    const truncated = text.length < raw.length;
    total += text.length;
    files.push({ name, status: 'extracted', chars: text.length, truncated,
      warning: truncated
        ? `Only the first ${text.length} characters were extracted (the file is longer) — review the source for anything beyond that.`
        : null });

    const ctxId = `blk-ctx-${slug(name)}`;
    blocks.push({ id: ctxId, locator: name, text, kind: 'context' });
    // Defer extraction: a W-9's tax instructions and a boilerplate T&C template must NOT be scanned like the RFP
    // body. Collect the file now; classify the whole set and extract per role below.
    readFiles.push({ name, ext, text, ctxId });
  }

  // CLASSIFY every read file — role + near-duplicate flag.
  const classified = classifyDocuments(readFiles.map((f) => ({ name: f.name, text: f.text })));
  const byName = new Map(classified.map((c) => [c.name, c]));
  const dupNames = new Set(classified.filter((c) => c.duplicateOf).map((c) => c.name));
  for (const c of classified) {
    const outcome = files.find((f) => f.name === c.name);
    if (!outcome) continue;
    outcome.role = c.role;
    if (c.duplicateOf) {
      outcome.status = 'duplicate';
      outcome.warning = `Duplicate of ${c.duplicateOf} — read once, not re-extracted.`;
    }
  }

  // Emit one requirement, de-duplicated by its VERBATIM text across all files. The honesty rail holds:
  // extractedText is always literal text from the zip (a sentence, or a form's own title line).
  const pushReq = (locator: string, statement: string, extractedText: string, tracks: string[]): void => {
    if (requirements.length >= MAX_REQUIREMENTS) return;
    const norm = extractedText.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    reqN += 1;
    const reqId = `REQ-${String(reqN).padStart(3, '0')}`;
    const blkId = `blk-${reqId}`;
    blocks.push({ id: blkId, locator, text: extractedText, kind: 'requirement' });
    requirements.push({
      canonicalReqId: reqId, statement: truncate(statement, 500), kind: 'compliance', priority: 'must',
      tracks, sourceDocument: locator, section: locator, extractedText,
      interpretation: null, humanConfirmed: false, evidenceState: 'unassessed', sourceEvidence: [blkId],
    });
  };

  // PASS 2 — extract per role.
  for (const f of readFiles) {
    if (requirements.length >= MAX_REQUIREMENTS) break;
    const c = byName.get(f.name);
    if (!c || c.duplicateOf) continue;                 // a duplicate is read once, never re-extracted
    // Rejoin soft-wrapped lines for plain text and PDFs (renderer wraps mid-sentence). For .docx/.xlsx the
    // ooxmlText reader already made rows/cells the boundaries, so DON'T join or the cells re-fuse.
    const joinWraps = f.ext === 'pdf' || f.ext === 'txt' || f.ext === 'md';

    if (SINGLE_ITEM_ROLES.has(c.role)) {
      // A fill-and-sign form / W-9 / price sheet becomes ONE "complete and submit" item — not 14 candidates
      // from its own instructions. Cited by a verbatim line from the file (its title), or its name.
      pushReq(f.name, `Complete and submit the ${roleLabel(c.role)}: ${f.name}`, firstMeaningfulLine(f.text) || f.name, ['proposal']);
      continue;
    }
    if (c.role === 'contract_terms') {
      // One "review and note exceptions" item, PLUS only the MATERIAL clauses (insurance, bond, indemnity,
      // compliance, licensing...) — not every sentence of the boilerplate template.
      pushReq(f.name, `Review ${f.name} and state any exceptions in the proposal`, firstMeaningfulLine(f.text) || f.name, ['proposal']);
      for (const s of sentences(f.text, joinWraps)) {
        if (requirements.length >= MAX_REQUIREMENTS) break;
        if (OBLIGATION.test(s) && MATERIAL_TERM_RE.test(s)) pushReq(f.name, s, s, ['proposal']);
      }
      continue;
    }
    // solicitation / addendum / reference — the full obligation scan (unchanged behavior).
    for (const s of sentences(f.text, joinWraps)) {
      if (requirements.length >= MAX_REQUIREMENTS) break;
      if (OBLIGATION.test(s)) pushReq(f.name, s, s, ['proposal', 'solution_build']);
    }
  }

  // The dossier ignores a duplicate file's context so contacts/dates are not double-counted.
  const dossier = extractDossier(blocks.filter((b) => !(b.kind === 'context' && dupNames.has(b.locator))));
  return { blocks, requirements, dossier, fileCount, files };
}
