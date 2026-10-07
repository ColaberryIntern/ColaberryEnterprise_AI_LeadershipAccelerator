/**
 * proposalExtractor must be DETERMINISTIC and NON-FABRICATING: it emits a requirement only for an obligation
 * sentence that literally appears in the zip, each citing a real source block with verbatim extracted_text,
 * marked `unassessed` + not human-confirmed. Non-obligation text yields nothing; identical sentences dedupe;
 * a bad buffer never throws. In-memory (no temp dir).
 */
const AdmZip = require('adm-zip');
import { extractProposal, extractDossier, type ExtractedBlock } from '../proposalExtractor';

/** Build a single context block (the only kind extractDossier reads) from literal text. */
function ctx(text: string, locator = 'RFP.txt'): ExtractedBlock {
  return { id: `blk-ctx-${locator}`, locator, text, kind: 'context' };
}

function makeZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content, 'utf8'));
  return zip.toBuffer();
}

describe('extractProposal', () => {
  it('captures obligation sentences verbatim as source-cited requirements, dropping non-obligations', async () => {
    const zip = makeZip({
      'RFP.txt': [
        'The vendor shall provide a maintenance management system.',
        'This section is background information about the county.',
        'The proposal must include a signed cover letter.',
        'Offerors are required to submit three references.',
      ].join('\n'),
    });
    const { blocks, requirements, fileCount } = await extractProposal(zip);
    expect(fileCount).toBe(1);
    expect(requirements).toHaveLength(3); // 3 obligations; the background line is NOT fabricated into one
    const statements = requirements.map((r) => r.extractedText);
    expect(statements.some((s) => s.includes('shall provide a maintenance management system'))).toBe(true);
    expect(statements.some((s) => s.includes('background information'))).toBe(false);
    for (const r of requirements) {
      expect(r.sourceEvidence).toHaveLength(1);
      expect(blocks.find((b) => b.id === r.sourceEvidence[0] && b.kind === 'requirement')).toBeTruthy();
      expect(r.extractedText.length).toBeGreaterThan(0);
      expect(r.evidenceState).toBe('unassessed');
      expect(r.humanConfirmed).toBe(false);
      expect(r.interpretation).toBeNull();
      expect(r.sourceDocument).toBe('RFP.txt');
    }
    expect(blocks.some((b) => b.kind === 'context' && b.locator === 'RFP.txt')).toBe(true);
  });

  it('dedupes identical obligation sentences', async () => {
    const zip = makeZip({ 'a.txt': 'The vendor shall submit a plan.\nThe vendor shall submit a plan.' });
    const { requirements } = await extractProposal(zip);
    expect(requirements).toHaveLength(1);
  });

  it('emits nothing when there are no obligation sentences (never fabricates)', async () => {
    const zip = makeZip({ 'notes.txt': 'Hello world here. This is a friendly note with nothing to do.' });
    const { requirements } = await extractProposal(zip);
    expect(requirements).toHaveLength(0);
  });

  it('never throws on a non-zip buffer', async () => {
    const res = await extractProposal(Buffer.from('not a zip at all'));
    expect(res.requirements).toEqual([]);
    expect(res.blocks).toEqual([]);
    expect(res.fileCount).toBe(0);
    expect(res.dossier).toEqual({ contacts: [], naics: [], codes: [], meetings: [], keyDates: [] });
  });

  it('surfaces a dossier (contacts + key date) parsed from the same ZIP', async () => {
    const zip = makeZip({
      'RFP.txt': [
        'The vendor shall provide services. Questions are due by 03/15/2026.',
        'Direct all inquiries to Jane Doe at jane.doe@county.gov or (555) 123-4567.',
      ].join('\n'),
    });
    const { dossier } = await extractProposal(zip);
    expect(dossier.contacts.some((c) => c.kind === 'email' && c.value === 'jane.doe@county.gov')).toBe(true);
    expect(dossier.contacts.some((c) => c.kind === 'phone')).toBe(true);
    expect(dossier.keyDates.some((k) => k.date === '03/15/2026')).toBe(true);
  });
});

describe('extractDossier (pure)', () => {
  it('detects emails and ≥10-digit phones, each citing its source document, and dedupes', () => {
    const d = extractDossier([
      ctx('Contact po@agency.gov or call (555) 987-6543 for details.', 'notice.pdf'),
      ctx('Reminder: email po@agency.gov again.', 'amendment.pdf'),
    ]);
    const emails = d.contacts.filter((c) => c.kind === 'email');
    expect(emails).toHaveLength(1); // deduped across documents
    expect(emails[0].value).toBe('po@agency.gov');
    expect(emails[0].sourceDocument).toBe('notice.pdf');
    expect(d.contacts.some((c) => c.kind === 'phone')).toBe(true);
  });

  it('ignores short digit runs that are not phone numbers', () => {
    const d = extractDossier([ctx('Reference number 123-45 and code 6789.')]);
    expect(d.contacts.filter((c) => c.kind === 'phone')).toHaveLength(0);
  });

  it('detects 6-digit NAICS codes and dedupes', () => {
    const d = extractDossier([ctx('Primary NAICS code: 541512. Secondary NAICS 541512 also applies.')]);
    expect(d.naics).toEqual(['541512']);
  });

  it('tags a NAICS code with its system in `codes` while keeping the `naics` string mirror', () => {
    const d = extractDossier([ctx('Primary NAICS code: 541512.', 'rfp.pdf')]);
    expect(d.codes).toContainEqual({ system: 'naics', code: '541512', sourceDocument: 'rfp.pdf' });
    expect(d.naics).toEqual(['541512']); // compat mirror still populated
  });

  it('detects an NIGP commodity code (label-anchored) and tags it nigp, normalised to NNN-NN', () => {
    const d = extractDossier([ctx('The applicable NIGP code is 920-05.', 'rfp.pdf')]);
    expect(d.codes).toContainEqual({ system: 'nigp', code: '920-05', sourceDocument: 'rfp.pdf' });
    expect(d.naics).toEqual([]); // an NIGP code is NOT a NAICS code
  });

  it('normalises NIGP formats (92005 / "920 05") to the same NNN-NN code and dedupes', () => {
    const d = extractDossier([ctx('See NIGP 92005 and also NIGP code 920 05 for the commodity.')]);
    const nigp = d.codes.filter((c) => c.system === 'nigp');
    expect(nigp).toHaveLength(1);
    expect(nigp[0].code).toBe('920-05');
  });

  it('requires the NIGP label — a bare "920-05" with no NIGP context is NOT captured as a code', () => {
    const d = extractDossier([ctx('Invoice line 920-05 was paid on the reference schedule.')]);
    expect(d.codes.filter((c) => c.system === 'nigp')).toHaveLength(0);
  });

  it('captures BOTH systems distinctly when a solicitation cites each', () => {
    const d = extractDossier([ctx('Industry: NAICS 541512. Commodity: NIGP 920-05.')]);
    expect(d.codes.some((c) => c.system === 'naics' && c.code === '541512')).toBe(true);
    expect(d.codes.some((c) => c.system === 'nigp' && c.code === '920-05')).toBe(true);
  });

  it('captures a meeting line and a dated key-date line', () => {
    const d = extractDossier([
      ctx('A pre-bid conference will be held on 02/01/2026 at the county office.'),
      ctx('Proposals are due by March 15, 2026 at 2:00 PM.'),
    ]);
    expect(d.meetings.some((m) => /pre-bid/i.test(m.text) && m.date === '02/01/2026')).toBe(true);
    expect(d.keyDates.some((k) => k.date === 'March 15, 2026')).toBe(true);
  });

  it('requires a date for a key-date line (no date → not captured)', () => {
    const d = extractDossier([ctx('Proposals are due as specified elsewhere in this document.')]);
    expect(d.keyDates).toHaveLength(0);
  });

  it('returns empty arrays when nothing matches and ignores non-context blocks', () => {
    const empty = extractDossier([ctx('This is a plain background paragraph with no contacts or dates.')]);
    expect(empty).toEqual({ contacts: [], naics: [], codes: [], meetings: [], keyDates: [] });
    const reqOnly = extractDossier([
      { id: 'blk-REQ-001', locator: 'RFP.txt', text: 'email in-a-requirement@agency.gov', kind: 'requirement' },
    ]);
    expect(reqOnly.contacts).toHaveLength(0); // requirement blocks are not scanned
  });

  it('is total — never throws on a non-array/garbage input', () => {
    expect(extractDossier(undefined as any)).toEqual({ contacts: [], naics: [], codes: [], meetings: [], keyDates: [] });
  });
});

describe('extractDossier — deadline time + timezone (never fabricated; a missed-by-zone deadline loses the bid)', () => {
  it('captures the time AND an explicitly-stated timezone on a key-date', () => {
    const d = extractDossier([ctx('Proposals are due by March 15, 2026 at 2:00 PM CST.')]);
    const k = d.keyDates.find((x) => x.date === 'March 15, 2026');
    expect(k).toBeTruthy();
    expect(k!.time).toBe('2:00 PM');
    expect(k!.timezone).toBe('CST');
  });

  it('captures a spelled-out timezone ("Central Time")', () => {
    const d = extractDossier([ctx('Responses are due 03/15/2026 at 2:00 PM Central Time.')]);
    expect(d.keyDates[0].timezone).toBe('Central Time');
  });

  it('leaves timezone NULL when a time is stated but no zone is — the deadline must be verified, never assumed local', () => {
    const d = extractDossier([ctx('Proposals are due 03/15/2026 by 2:00 PM.')]);
    expect(d.keyDates[0].time).toBe('2:00 PM');
    expect(d.keyDates[0].timezone).toBeNull();
  });

  it('does NOT match the ambiguous 2-letter zone "CT" — leaves it null to force verification', () => {
    const d = extractDossier([ctx('Proposals are due March 15, 2026 at 2:00 PM CT.')]);
    expect(d.keyDates[0].time).toBe('2:00 PM');
    expect(d.keyDates[0].timezone).toBeNull(); // CT deliberately unmatched (Connecticut/court collision)
  });

  it('leaves both time and timezone null when only a date is stated (never invents a time)', () => {
    const d = extractDossier([ctx('Responses are due 03/15/2026.')]);
    expect(d.keyDates[0]).toMatchObject({ date: '03/15/2026', time: null, timezone: null });
  });

  it('captures time + zone on a meeting line too', () => {
    const d = extractDossier([ctx('A pre-bid conference will be held on 02/01/2026 at 10:00 AM EST.')]);
    const m = d.meetings.find((x) => /pre-bid/i.test(x.text));
    expect(m!.time).toBe('10:00 AM');
    expect(m!.timezone).toBe('EST');
  });
});

describe('extractProposal — per-file outcome (the honesty rail: no silent loss)', () => {
  it('records an outcome for EVERY file — extracted, unsupported, empty — never silently dropping one', async () => {
    const zip = makeZip({
      'rfp.txt': 'The vendor shall provide a maintenance system.',
      'logo.png': 'not-real-image-bytes',   // unsupported extension
      'blank.txt': '   ',                    // whitespace only -> empty
    });
    const { files, fileCount } = await extractProposal(zip);
    expect(files).toHaveLength(3); // all three files are accounted for
    const byName = Object.fromEntries(files.map((f) => [f.name, f]));
    expect(byName['rfp.txt'].status).toBe('extracted');
    expect(byName['logo.png'].status).toBe('unsupported');
    expect(byName['logo.png'].warning).toMatch(/unsupported/i);
    expect(byName['blank.txt'].status).toBe('empty');
    expect(fileCount).toBe(1); // only the file that yielded text counts
  });

  it('flags truncation when a file exceeds the per-file character budget', async () => {
    const big = 'The vendor shall do a thing. '.repeat(1000); // well over 8000 chars
    const { files } = await extractProposal(makeZip({ 'long.txt': big }));
    expect(files[0].status).toBe('extracted');
    expect(files[0].truncated).toBe(true);
    expect(files[0].chars).toBe(8000); // CHARS_PER_FILE
    expect(files[0].warning).toMatch(/first .* characters/i);
  });

  it('a fully-extracted file reports truncated:false and a null warning', async () => {
    const { files } = await extractProposal(makeZip({ 'a.txt': 'Short text here, all of it fits.' }));
    expect(files[0]).toMatchObject({ status: 'extracted', truncated: false, warning: null });
  });

  it('a non-zip buffer returns an empty files list, not a throw', async () => {
    expect((await extractProposal(Buffer.from('not a zip at all'))).files).toEqual([]);
  });
});

describe('extractProposal — structured office docs (the requirements-matrix path)', () => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  /** A minimal real .xlsx (inline strings, one sheet) carrying the given rows. */
  function xlsxBuffer(rows: string[][]): Buffer {
    const sheetData = rows
      .map((cells) => `<row>${cells.map((c) => `<c t="inlineStr"><is><t>${esc(c)}</t></is></c>`).join('')}</row>`)
      .join('');
    const z = new AdmZip();
    z.addFile('xl/worksheets/sheet1.xml', Buffer.from(`<worksheet><sheetData>${sheetData}</sheetData></worksheet>`, 'utf8'));
    return z.toBuffer();
  }
  /** A minimal real .docx carrying one table with the given rows. */
  function docxBuffer(rows: string[][]): Buffer {
    const trs = rows
      .map((cells) => `<w:tr>${cells.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`)
      .join('');
    const z = new AdmZip();
    z.addFile('word/document.xml', Buffer.from(`<w:document><w:body><w:tbl>${trs}</w:tbl></w:body></w:document>`, 'utf8'));
    return z.toBuffer();
  }
  /** Outer solicitation zip from a map of name -> pre-built file buffer. */
  function makeZipBin(files: Record<string, Buffer>): Buffer {
    const zip = new AdmZip();
    for (const [name, buf] of Object.entries(files)) zip.addFile(name, buf);
    return zip.toBuffer();
  }

  it('pulls an obligation out of an .xlsx requirements ROW (a cell, not the old flat string dump)', async () => {
    const zip = makeZipBin({
      'requirements.xlsx': xlsxBuffer([
        ['ID', 'Requirement'],
        ['R1', 'The vendor shall provide a reporting dashboard.'],
        ['R2', 'This column is just a note with nothing to do.'],
      ]),
    });
    const { requirements, files, fileCount } = await extractProposal(zip);
    expect(requirements.some((r) => r.extractedText.includes('shall provide a reporting dashboard'))).toBe(true);
    expect(requirements.some((r) => r.extractedText.includes('nothing to do'))).toBe(false); // non-obligation row dropped
    expect(files.find((f) => f.name === 'requirements.xlsx')!.status).toBe('extracted');
    expect(fileCount).toBe(1);
  });

  it('pulls an obligation out of a .docx TABLE row (cells kept distinct, not run together)', async () => {
    const zip = makeZipBin({
      'compliance.docx': docxBuffer([
        ['Requirement', 'Response'],
        ['The offeror must submit three past-performance references.', 'Comply'],
      ]),
    });
    const { requirements, blocks, files } = await extractProposal(zip);
    expect(requirements.some((r) => r.extractedText.includes('must submit three past-performance references'))).toBe(true);
    // the two cells of the header row did NOT fuse into one token (structure preserved)
    expect(blocks.some((b) => b.text.includes('RequirementResponse'))).toBe(false);
    expect(files.find((f) => f.name === 'compliance.docx')!.status).toBe('extracted');
  });
});
