/**
 * proposalExtractor must be DETERMINISTIC and NON-FABRICATING: it emits a requirement only for an obligation
 * sentence that literally appears in the zip, each citing a real source block with verbatim extracted_text,
 * marked `unassessed` + not human-confirmed. Non-obligation text yields nothing; identical sentences dedupe;
 * a bad buffer never throws. In-memory (no temp dir).
 */
const AdmZip = require('adm-zip');
import { extractProposal } from '../proposalExtractor';

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
  });
});
