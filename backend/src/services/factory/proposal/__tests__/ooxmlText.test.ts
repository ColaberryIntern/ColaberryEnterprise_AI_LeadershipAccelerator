/**
 * ooxmlText must be DETERMINISTIC and STRUCTURE-PRESERVING: an .xlsx resolves shared strings by index and
 * keeps row/cell boundaries (tab-separated cells, one line per row); a .docx keeps table rows/cells and
 * paragraphs as separate lines instead of one run-on blob. Both are TOTAL — garbage never throws, it yields ''.
 * These are the properties a requirements matrix depends on (each row must survive as its own obligation line).
 */
const AdmZip = require('adm-zip');
import { decodeXmlEntities, xlsxToText, docxToText } from '../ooxmlText';

/** Build an OOXML container buffer from a map of inner-path -> xml string. */
function ooxml(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content, 'utf8'));
  return zip.toBuffer();
}

describe('decodeXmlEntities', () => {
  it('decodes the five named entities', () => {
    expect(decodeXmlEntities('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).toBe(`a & b <c> "d" 'e'`);
  });
  it('decodes decimal and hex numeric references', () => {
    expect(decodeXmlEntities('&#39;quoted&#39; and &#x2019;smart&#x2019;')).toBe("'quoted' and ’smart’");
  });
  it('is single-pass — does NOT double-decode (&amp;lt; stays &lt;, not <)', () => {
    expect(decodeXmlEntities('5 &amp;lt; 10')).toBe('5 &lt; 10');
  });
  it('leaves an unknown entity untouched and never throws on junk', () => {
    expect(decodeXmlEntities('keep &nbsp; and &unknown;')).toBe('keep &nbsp; and &unknown;');
    expect(decodeXmlEntities(undefined as any)).toBe('');
  });
});

describe('xlsxToText', () => {
  it('resolves shared strings BY INDEX and keeps row/cell structure (tab cells, newline rows)', () => {
    const sharedStrings = `<?xml version="1.0"?><sst>` +
      `<si><t>Requirement</t></si>` +
      `<si><t>The vendor shall provide training.</t></si>` +
      `<si><t>Priority</t></si>` +
      `</sst>`;
    // Row 1: shared[0], shared[2]  |  Row 2: shared[1], inline number 42
    const sheet = `<?xml version="1.0"?><worksheet><sheetData>` +
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42</v></c></row>` +
      `</sheetData></worksheet>`;
    const out = xlsxToText(ooxml({ 'xl/sharedStrings.xml': sharedStrings, 'xl/worksheets/sheet1.xml': sheet }));
    const lines = out.split('\n');
    expect(lines).toEqual(['Requirement\tPriority', 'The vendor shall provide training.\t42']);
    // the whole point: index 1 (not index 0) is resolved for the second row's first cell
    expect(out).toContain('The vendor shall provide training.');
  });

  it('orders worksheets NUMERICALLY (sheet2 before sheet10), not lexically', () => {
    const files: Record<string, string> = {
      'xl/worksheets/sheet10.xml': `<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>tenth</t></is></c></row></sheetData></worksheet>`,
      'xl/worksheets/sheet2.xml': `<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>second</t></is></c></row></sheetData></worksheet>`,
    };
    const out = xlsxToText(ooxml(files));
    expect(out.indexOf('second')).toBeLessThan(out.indexOf('tenth'));
  });

  it('reads inline strings and decodes entities in cell text', () => {
    const sheet = `<worksheet><sheetData><row>` +
      `<c r="A1" t="inlineStr"><is><t>R&amp;D plan</t></is></c>` +
      `</row></sheetData></worksheet>`;
    expect(xlsxToText(ooxml({ 'xl/worksheets/sheet1.xml': sheet }))).toBe('R&D plan');
  });

  it('is total — a non-xlsx / garbage buffer yields an empty string, never a throw', () => {
    expect(xlsxToText(Buffer.from('not a zip'))).toBe('');
    expect(xlsxToText(ooxml({ 'unrelated.xml': '<x/>' }))).toBe('');
  });
});

describe('docxToText', () => {
  it('keeps a TABLE as one line per row with tab-separated cells (not one run-on blob)', () => {
    const xml = `<?xml version="1.0"?><w:document><w:body><w:tbl>` +
      `<w:tr><w:tc><w:p><w:r><w:t>Requirement</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>Response</w:t></w:r></w:p></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p><w:r><w:t>The offeror must submit a plan.</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>Yes</w:t></w:r></w:p></w:tc></w:tr>` +
      `</w:tbl></w:body></w:document>`;
    const out = docxToText(ooxml({ 'word/document.xml': xml }));
    const lines = out.split('\n');
    expect(lines).toEqual(['Requirement\tResponse', 'The offeror must submit a plan.\tYes']);
    // the two cells of a row did NOT run together into one token
    expect(out).not.toContain('RequirementResponse');
  });

  it('keeps paragraphs as separate lines and maps <w:br/> to a newline', () => {
    const xml = `<w:document><w:body>` +
      `<w:p><w:r><w:t>First paragraph.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Second line one</w:t><w:br/><w:t>second line two</w:t></w:r></w:p>` +
      `</w:body></w:document>`;
    expect(docxToText(ooxml({ 'word/document.xml': xml })).split('\n')).toEqual([
      'First paragraph.',
      'Second line one',
      'second line two',
    ]);
  });

  it('decodes entities in run text', () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Terms &amp; conditions &lt;see appendix&gt;</w:t></w:r></w:p></w:body></w:document>`;
    expect(docxToText(ooxml({ 'word/document.xml': xml }))).toBe('Terms & conditions <see appendix>');
  });

  it('is total — missing document.xml or garbage yields an empty string, never a throw', () => {
    expect(docxToText(ooxml({ 'word/styles.xml': '<x/>' }))).toBe('');
    expect(docxToText(Buffer.from('not a zip'))).toBe('');
  });
});
