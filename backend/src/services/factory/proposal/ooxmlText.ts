/**
 * ooxmlText — DETERMINISTIC, structure-aware plain-text extraction from the two Office Open XML
 * container formats a solicitation ZIP actually carries: .xlsx (SpreadsheetML) and .docx (WordprocessingML).
 *
 * Why this exists: the first-pass extractor read an .xlsx by dumping `xl/sharedStrings.xml` with its tags
 * stripped — a flat bag of every string in the workbook with NO cell, row, or sheet boundaries, and missing
 * every inline number — and read a .docx by stripping all tags from `word/document.xml`, which runs every
 * table cell together into one blob. A government RFP ships its requirements matrix and pricing schedule as
 * exactly those tables, so losing row/cell structure loses the requirements. These functions reconstruct
 * cell/row boundaries so a requirements table reads as discrete rows (each becomes an obligation candidate).
 *
 * Both functions are PURE, in-memory, and TOTAL: a corrupt or unexpected buffer yields '' (logged upstream as
 * an `unreadable`/`empty` per-file outcome), never a throw. No LLM, no network, no temp dir.
 */
// adm-zip is an undeclared/untyped dep (resolves via hoisted node_modules); require() keeps strict tsc from
// rejecting it (TS7016), matching proposalExtractor.ts and backend/src/scripts/lib/govBidContentExtractor.js.
const AdmZip = require('adm-zip');

/** Decode the XML entities OOXML actually emits, in a SINGLE left-to-right pass so `&amp;lt;` → `&lt;`
 *  (not `<`). Unknown entities are left untouched. */
export function decodeXmlEntities(s: string): string {
  return String(s ?? '').replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_m, e: string) => {
    switch (e) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        if (e[0] === '#') {
          const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
        }
        return _m;
    }
  });
}

/** Concatenate the `<t>` runs inside one XML fragment (a shared-string `<si>` or an inline-string `<is>`). */
function joinTextRuns(fragment: string): string {
  const parts: string[] = [];
  for (const m of fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) parts.push(decodeXmlEntities(m[1]));
  return parts.join('');
}

/**
 * .xlsx → text. Reads the shared-string table (by index) and every worksheet in sheetN order, emitting one
 * line per row with cells tab-separated. Shared-string cells (`t="s"`) resolve through the table; inline
 * strings (`t="inlineStr"`) read their `<is>`; everything else (numbers, booleans, formula results) takes the
 * literal `<v>`. Empty rows are dropped. Deterministic: sheets and rows keep document order. Never throws.
 */
export function xlsxToText(buf: Buffer): string {
  try {
    const zip = new AdmZip(buf);

    const shared: string[] = [];
    const ssEntry = zip.getEntry('xl/sharedStrings.xml');
    if (ssEntry) {
      const xml = ssEntry.getData().toString('utf8');
      for (const si of xml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) ?? []) shared.push(joinTextRuns(si));
    }

    const sheetNames = zip
      .getEntries()
      .map((e: any) => String(e.entryName))
      .filter((n: string) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a: string, b: string) => {
        // Numeric sheet order (sheet2 before sheet10), not lexical.
        const na = parseInt(a.replace(/\D/g, ''), 10);
        const nb = parseInt(b.replace(/\D/g, ''), 10);
        return na - nb;
      });

    const lines: string[] = [];
    for (const sn of sheetNames) {
      const sheetXml = zip.getEntry(sn)?.getData().toString('utf8') ?? '';
      for (const rowMatch of sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
        const cells: string[] = [];
        for (const c of rowMatch.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
          const attrs = c[1];
          const body = c[2];
          if (/\bt="s"/.test(attrs)) {
            const vm = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
            const idx = vm ? parseInt(vm[1], 10) : NaN;
            cells.push(Number.isFinite(idx) && shared[idx] != null ? shared[idx] : '');
          } else if (/\bt="inlineStr"/.test(attrs)) {
            cells.push(joinTextRuns(body));
          } else {
            const vm = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
            cells.push(vm ? decodeXmlEntities(vm[1]) : '');
          }
        }
        const line = cells.join('\t').replace(/\t+$/, '').trim();
        if (line) lines.push(line);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * .docx → text. Reconstructs structure BEFORE stripping tags: a table-cell end becomes a tab, a table-row and
 * a paragraph end become a newline, and `<w:tab/>`/`<w:br/>` map to tab/newline. So a requirements table reads
 * as one line per row with tab-separated cells (each row then becomes an obligation candidate), instead of the
 * old all-cells-in-one-blob. Deterministic; never throws.
 */
export function docxToText(buf: Buffer): string {
  try {
    const entry = new AdmZip(buf).getEntry('word/document.xml');
    if (!entry) return '';
    let s: string = entry.getData().toString('utf8');
    s = s
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<\/w:tr>/g, '\n');
    s = decodeXmlEntities(s.replace(/<[^>]+>/g, ''));
    // A paragraph-end newline sitting immediately before a cell boundary is NOT a line break — it's the end of
    // the cell's text. Collapse it so a one-paragraph cell stays on its row instead of splitting onto its own line.
    s = s.replace(/[ \t]*\n[ \t]*\t/g, '\t');
    return s
      .split('\n')
      .map((line) => line.replace(/[  ]+/g, ' ').replace(/ *\t+ */g, '\t').replace(/\t+$/, '').trim())
      .filter((line) => line.length > 0)
      .join('\n');
  } catch {
    return '';
  }
}
