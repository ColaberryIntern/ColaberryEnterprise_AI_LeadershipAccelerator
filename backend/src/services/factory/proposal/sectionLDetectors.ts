/**
 * sectionLDetectors — DETERMINISTIC detection of the Section L "how to submit" mechanics a solicitation imposes:
 * page limits, minimum font, page size, file format, section order, file naming, number of copies, submission
 * method/portal, and the due date/time. These are the rules that get a compliant-but-sloppy proposal thrown out
 * (over the page cap, wrong font, wrong file name), and an intern never finds them because they live in the
 * solicitation body, not on the requirement checklist.
 *
 * Each detector returns zero or more BlueprintRule, every one carrying the LITERAL source snippet (`quote`) it was
 * read from and the file it came from — the same never-fabricate rail the requirement extractor holds. PURE + TOTAL:
 * regex over text only, never throws, garbage in -> []. Nothing here gates anything directly; the blueprint builder
 * verifies each quote is literally present before storing, and the P3 format check reads these rules.
 */
import type { BlueprintRule, RuleSeverity } from './proposalBlueprintTypes';

/** A clean, bounded, literal snippet of `text` around [idx, idx+len): expanded to nearest sentence-ish boundaries,
 *  whitespace-collapsed, leading punctuation stripped, capped at 240 chars. Mirrors the other detectors' helper so a
 *  stored quote is a real, verifiable span of the source. */
function snippetAround(text: string, idx: number, len: number): string {
  const before = text.slice(0, idx);
  const startBoundary = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; '), before.lastIndexOf('\n'));
  const start = startBoundary >= 0 ? startBoundary + 1 : 0;
  const after = text.slice(idx + len);
  const ends = [after.indexOf('\n'), after.indexOf('. '), after.indexOf('; ')].filter((n) => n >= 0);
  const end = idx + len + (ends.length ? Math.min(...ends) + 1 : after.length);
  const raw = text.slice(start, end).replace(/\s+/g, ' ').replace(/^[.;:\s]+/, '').trim();
  return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
}

/** The first match of a global regex with its captured value, or null. */
function firstCapture(text: string, re: RegExp): { index: number; length: number; groups: string[] } | null {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const m = r.exec(text);
  return m ? { index: m.index, length: m[0].length, groups: m.slice(1) } : null;
}

function rule(key: string, value: string, text: string, idx: number, len: number, sourceFile: string, severity: RuleSeverity): BlueprintRule {
  return { key, value, quote: snippetAround(text, idx, len), sourceFile, severity };
}

// Page limit: "not exceed N pages", "N-page limit", "maximum of N pages", "limited to N pages", "no more than N pages".
const PAGE_LIMIT_RE = /\b(?:not\s+exceed|no\s+(?:more\s+than|longer\s+than)|maximum\s+of|limited\s+to|up\s+to|within)\s+(\d{1,3})\s+(?:single|double)?[-\s]?(?:sided\s+)?pages?\b|\b(\d{1,3})[-\s]page\s+(?:limit|maximum|cap)\b/i;
// Minimum font: "12 point font", "font ... no smaller than 11 point", "Times New Roman 12", "minimum N pt".
const MIN_FONT_RE = /\b(?:no\s+smaller\s+than|minimum\s+(?:of\s+)?|at\s+least|font\s+size\s+(?:of\s+)?)\s*(\d{1,2})\s*(?:[-\s]?point|[-\s]?pt)\b|\b(\d{1,2})\s*(?:[-\s]?point|[-\s]?pt)\s+(?:font|type|typeface|or\s+larger)\b|\b(?:Times\s+New\s+Roman|Arial|Calibri)\s+(\d{1,2})\s*(?:point|pt)?\b/i;
// Page size: "8.5 x 11", "letter size", "A4".
const PAGE_SIZE_RE = /\b8\.5["']?\s*(?:x|by|×)\s*11["']?\b|\bletter[-\s]siz(?:e|ed)\b|\b8\s*1\/2\s*(?:x|by|×)\s*11\b|\bA4\s+(?:paper|size|page)\b/i;
// File format: "searchable PDF", "PDF format", "Microsoft Excel", "Word document", "native Excel with formulas".
const FILE_FORMAT_RE = /\bsearchable\s+PDF\b|\b(?:in|as\s+a?)\s+PDF\s+(?:format|file|document)\b|\bMicrosoft\s+(?:Excel|Word)\b|\b(?:Excel|\.xlsx|Word|\.docx)\s+(?:format|file|workbook|document|spreadsheet)\b|\bnative\s+Excel\b/i;
// Required section order / numbering / tabs.
const SECTION_ORDER_RE = /\bin\s+the\s+(?:following|order\s+(?:listed|shown|below))\b|\b(?:organized?|arranged?|submitted?|presented?|tabbed?)\s+in\s+the\s+(?:following|order)\b|\bsection\s+numbering\b|\b(?:use\s+)?tabs?\s+(?:labeled|numbered|as\s+follows)\b|\bin\s+the\s+order\s+(?:set\s+forth|identified|described)\b/i;
// File naming convention: "name the file", "file naming", "label each file", "named as follows".
const FILE_NAMING_RE = /\b(?:file[-\s]?nam(?:e|ing)\s+(?:convention|requirement|as\s+follows)|name\s+(?:the|each|your)\s+(?:file|document|volume|pdf)|label\s+(?:each|the|your)\s+(?:file|document|volume)|save\s+(?:the|each)\s+file\s+as)\b/i;
// Number of copies: "N copies", "one original and N copies".
const COPIES_RE = /\b(?:one\s+\(1\)\s+original\s+and\s+)?(\d{1,2}|one|two|three|four|five|six)\s+(?:printed\s+|hard\s+|paper\s+|identical\s+|complete\s+)?(?:cop(?:y|ies))\b|\b(\d{1,2})\s+original\s+(?:and|plus)\b/i;
// Submission method / portal.
const SUBMISSION_METHOD_RE = /\b(?:submit(?:ted)?|upload(?:ed)?|deliver(?:ed)?)\b[^.]{0,40}\b(?:electronically|via\s+email|through\s+the\s+(?:portal|website|system)|Bonfire|Ion\s?Wave|e-?mail\s+to|SciQuest|ESBD)\b|\b(?:Bonfire|Ion\s?Wave|ESBD|SciQuest)\b|\bsealed\s+(?:bid|proposal|envelope)\b/i;
// Due date/time (text fallback; the authoritative deadline comes from the qualification keyDates).
const DUE_DATETIME_RE = /\b(?:due|deadline|submission\s+deadline|proposals?\s+(?:are\s+)?due|must\s+be\s+(?:received|submitted))\s+(?:date\s+)?(?:by\s+|no\s+later\s+than\s+|on\s+(?:or\s+before\s+)?)?[^.\n]{0,50}\b(?:\d{1,2}[:/]\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b[^.\n]{0,20}(?:a\.?m\.?|p\.?m\.?|CST|CDT|CT|Central)?/i;

/**
 * Detect the Section-L submission mechanics in one source file's text. Returns at most one rule per kind (a presence
 * flag per mechanic). Total: a non-string / empty text yields []. The builder verifies each quote literally present.
 */
export function detectSectionLRules(text: string | null | undefined, sourceFile: string): BlueprintRule[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const out: BlueprintRule[] = [];

  const pl = firstCapture(text, PAGE_LIMIT_RE);
  if (pl) { const n = pl.groups.find((g) => g); if (n) out.push(rule('page_limit', n, text, pl.index, pl.length, sourceFile, 'fatal')); }

  const mf = firstCapture(text, MIN_FONT_RE);
  if (mf) { const n = mf.groups.find((g) => g); if (n) out.push(rule('min_font', `${n}pt`, text, mf.index, mf.length, sourceFile, 'curable')); }

  const ps = firstCapture(text, PAGE_SIZE_RE);
  if (ps) out.push(rule('page_size', /A4/i.test(text.substr(ps.index, ps.length)) ? 'A4' : 'letter', text, ps.index, ps.length, sourceFile, 'curable'));

  const ff = firstCapture(text, FILE_FORMAT_RE);
  if (ff) out.push(rule('file_format', text.substr(ff.index, ff.length).replace(/\s+/g, ' ').trim(), text, ff.index, ff.length, sourceFile, 'curable'));

  const so = firstCapture(text, SECTION_ORDER_RE);
  if (so) out.push(rule('section_order', 'specified', text, so.index, so.length, sourceFile, 'curable'));

  const fn = firstCapture(text, FILE_NAMING_RE);
  if (fn) out.push(rule('file_naming', 'specified', text, fn.index, fn.length, sourceFile, 'curable'));

  const cp = firstCapture(text, COPIES_RE);
  if (cp) { const n = cp.groups.find((g) => g); if (n) out.push(rule('copies', n, text, cp.index, cp.length, sourceFile, 'curable')); }

  const sm = firstCapture(text, SUBMISSION_METHOD_RE);
  if (sm) out.push(rule('submission_method', text.substr(sm.index, Math.min(sm.length, 60)).replace(/\s+/g, ' ').trim(), text, sm.index, sm.length, sourceFile, 'info'));

  const dd = firstCapture(text, DUE_DATETIME_RE);
  if (dd) out.push(rule('due_datetime', 'see quote', text, dd.index, dd.length, sourceFile, 'info'));

  return out;
}
