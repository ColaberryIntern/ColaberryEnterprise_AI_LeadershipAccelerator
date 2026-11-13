/**
 * The requirement ceiling must be REPORTED, not silent.
 *
 * `proposalExtractor`'s own contract says "NOTHING is silently dropped" and it keeps a per-file
 * honesty rail (`files[]`, with `status` and `truncated`) to prove it. Requirements had no such
 * rail: once 200 were held, obligation 201 and everything after it was discarded with no counter,
 * no flag and no warning. Measured 2026-11-12 against production, 4 of 15 delivery projects sit at
 * EXACTLY 200 requirements and NONE sits between 190 and 199 — a cap firing, not a distribution.
 * A compliance matrix built from a capped set understates the solicitation and nothing said so.
 *
 * WHICH TEST CATCHES WHAT, measured by mutation (see the header of each case):
 *  - deleting the `suppressed += 1` increment            -> 'counts the obligations it did not keep'
 *  - restoring the `break` in the sentence scan          -> 'counts every obligation past the cap'
 *  - moving the cap check back above the dedupe guard    -> 'counts DISTINCT obligations, not repeats'
 *  - making the cap check `>` instead of `>=`            -> 'stores exactly the cap and no more'
 *  - returning a warning when nothing was suppressed     -> 'stays silent when the cap did not fire'
 *  - dropping the fields from the unreadable-zip return  -> 'reports the fields even when no zip opened'
 */
const AdmZip = require('adm-zip');
import { extractProposal } from '../proposalExtractor';
import { toExtractionResult } from '../govExtractionJobService';

const CAP = 200;

function makeZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content, 'utf8'));
  return zip.toBuffer();
}

/** `n` distinct obligation sentences. Distinct text matters: dedupe keys on the normalized sentence. */
function obligations(n: number, from = 1): string[] {
  const out: string[] = [];
  for (let i = from; i < from + n; i += 1) {
    out.push(`The vendor shall provide scheduled maintenance for asset group ${i}.`);
  }
  return out;
}

describe('proposalExtractor requirement ceiling', () => {
  it('stores exactly the cap and no more', async () => {
    const zip = makeZip({ 'RFP.txt': obligations(CAP + 50).join('\n') });
    const { requirements, requirementsCap } = await extractProposal(zip);
    expect(requirements).toHaveLength(CAP);
    expect(requirementsCap).toBe(CAP);
  });

  it('counts the obligations it did not keep', async () => {
    const zip = makeZip({ 'RFP.txt': obligations(CAP + 50).join('\n') });
    const { requirementsSuppressed } = await extractProposal(zip);
    expect(requirementsSuppressed).toBe(50);
  });

  it('counts every obligation past the cap, not just the first one over', async () => {
    // The scan used to `break` at the cap, so the loss was unmeasurable as well as unreported:
    // 201 obligations and 2,000 were indistinguishable. 137 is deliberately not a round number.
    const zip = makeZip({ 'RFP.txt': obligations(CAP + 137).join('\n') });
    const { requirementsSuppressed } = await extractProposal(zip);
    expect(requirementsSuppressed).toBe(137);
  });

  it('counts DISTINCT obligations, not repeats of the same sentence', async () => {
    // Every sentence appears twice. The stored set dedupes to the cap, and the suppressed count
    // must report 50 real obligations missing — not 300 sightings.
    const lines = obligations(CAP + 50);
    const zip = makeZip({ 'RFP.txt': [...lines, ...lines].join('\n') });
    const { requirements, requirementsSuppressed } = await extractProposal(zip);
    expect(requirements).toHaveLength(CAP);
    expect(requirementsSuppressed).toBe(50);
  });

  it('warns in words a reviewer can act on when the cap fires', async () => {
    const zip = makeZip({ 'RFP.txt': obligations(CAP + 3).join('\n') });
    const { requirementsWarning } = await extractProposal(zip);
    expect(requirementsWarning).toContain('3 further obligation(s) were found and NOT extracted');
    expect(requirementsWarning).toContain('sample, not a');
  });

  it('stays silent when the cap did not fire', async () => {
    const zip = makeZip({ 'RFP.txt': obligations(4).join('\n') });
    const { requirements, requirementsSuppressed, requirementsWarning } = await extractProposal(zip);
    expect(requirements).toHaveLength(4);
    expect(requirementsSuppressed).toBe(0);
    expect(requirementsWarning).toBeNull();
  });

  it('treats landing exactly on the cap as complete, not as a loss', async () => {
    // The off-by-one that matters: a document with exactly 200 obligations lost nothing, so a
    // warning here would cry wolf on every full extraction that happens to fill the ceiling.
    const zip = makeZip({ 'RFP.txt': obligations(CAP).join('\n') });
    const { requirements, requirementsSuppressed, requirementsWarning } = await extractProposal(zip);
    expect(requirements).toHaveLength(CAP);
    expect(requirementsSuppressed).toBe(0);
    expect(requirementsWarning).toBeNull();
  });

  it('reports the fields even when no zip could be opened', async () => {
    const { requirementsCap, requirementsSuppressed, requirementsWarning } =
      await extractProposal(Buffer.from('not a zip at all', 'utf8'));
    // 0 must be distinguishable from absent: a consumer testing `> 0` needs the field present.
    expect(requirementsSuppressed).toBe(0);
    expect(requirementsCap).toBe(CAP);
    expect(requirementsWarning).toBeNull();
  });

  it('leaves the stored requirement set byte-identical to the capped behaviour', async () => {
    // Letting the scan run past the cap must not change WHICH 200 are kept, nor their ids. If this
    // fails, the fix changed extraction output rather than only reporting on it.
    const zip = makeZip({ 'RFP.txt': obligations(CAP + 50).join('\n') });
    const { requirements } = await extractProposal(zip);
    expect(requirements[0].canonicalReqId).toBe('REQ-001');
    expect(requirements[CAP - 1].canonicalReqId).toBe(`REQ-${CAP}`);
    expect(requirements.map((r) => r.canonicalReqId)).toHaveLength(new Set(requirements.map((r) => r.canonicalReqId)).size);
    expect(requirements[0].extractedText).toContain('asset group 1.');
    expect(requirements[CAP - 1].extractedText).toContain(`asset group ${CAP}.`);
  });
});

/**
 * The count has to REACH someone. These live beside the extractor cases rather than in the job
 * service's own suite because they are the same defect: a number nobody is shown is still silence.
 */
describe('the requirement ceiling reaches the reviewer payload', () => {
  it('carries the suppressed count, the warning and the cap through to the UI payload', () => {
    const payload = toExtractionResult(
      [{ canonicalReqId: 'REQ-001', statement: 'x', extractedText: 'x' }],
      {},
      { fileCount: 1, files: [], requirementsCap: CAP, requirementsSuppressed: 42, requirementsWarning: 'forty two missing' },
      null,
    );
    expect(payload.requirementsSuppressed).toBe(42);
    expect(payload.requirementsWarning).toBe('forty two missing');
    expect(payload.requirementsCap).toBe(CAP);
  });

  it('reports nothing suppressed, rather than undefined, for a caller that omits the fields', () => {
    // `undefined` would make `payload.requirementsSuppressed > 0` quietly false for a capped
    // extraction, which is the exact silence this change exists to remove.
    const payload = toExtractionResult([], {}, { fileCount: 0, files: [] }, null);
    expect(payload.requirementsSuppressed).toBe(0);
    expect(payload.requirementsWarning).toBeNull();
    expect(payload).toHaveProperty('requirementsSuppressed');
  });
});
