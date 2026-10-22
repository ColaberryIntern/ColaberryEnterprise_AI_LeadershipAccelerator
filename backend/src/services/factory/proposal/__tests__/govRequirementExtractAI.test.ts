/**
 * govRequirementExtractAI — the flagged AI pass + the route orchestrator. Proves: the PURE sanitize drops malformed
 * rows; the service is FAIL-SOFT (no key / upstream error / bad JSON -> error object, never throws); and
 * applyAiComprehension is OFF by default (deterministic output untouched, no model call) and, when on, only ADDS
 * quote-verified rows after the deterministic ones. Client mocked exactly like govCapabilityFit.test.ts.
 */
jest.mock('../../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../../../config/featureFlags', () => ({ FLAGS: { govAiExtraction: false } }));
import { getInstrumentedOpenAI } from '../../../openaiInstrumented';
import { FLAGS } from '../../../../config/featureFlags';
import { sanitizeAiCandidates, govRequirementExtractAI, applyAiComprehension } from '../govRequirementExtractAI';
import type { ExtractedRequirement } from '../proposalExtractor';

const mockClient = (content: string) => ({
  chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) } },
});
const det = (id: string, text: string): ExtractedRequirement => ({
  canonicalReqId: id, statement: text, kind: 'compliance', priority: 'must', tracks: ['proposal', 'solution_build'],
  sourceDocument: 'rfp.pdf', section: 'rfp.pdf', extractedText: text, interpretation: null, humanConfirmed: false,
  evidenceState: 'unassessed', sourceEvidence: [],
});

const SAVED = process.env.OPENAI_API_KEY;
beforeEach(() => { (getInstrumentedOpenAI as jest.Mock).mockReset(); (FLAGS as any).govAiExtraction = false; process.env.OPENAI_API_KEY = 'test-key'; });
afterAll(() => { if (SAVED === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = SAVED; });

describe('sanitizeAiCandidates (pure)', () => {
  it('keeps rows with BOTH a statement and a quote, drops the rest, clamps lengths', () => {
    const out = sanitizeAiCandidates([
      { statement: 'Carry insurance', quote: 'shall maintain liability insurance', document: 'rfp.pdf' },
      { statement: 'no quote' },                 // dropped (no quote)
      { quote: 'orphan quote with no statement' }, // dropped (no statement)
      'garbage',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ statement: 'Carry insurance', quote: 'shall maintain liability insurance', document: 'rfp.pdf' });
  });
  it('is total on garbage', () => {
    expect(sanitizeAiCandidates(undefined)).toEqual([]);
    expect(sanitizeAiCandidates('nope' as any)).toEqual([]);
  });
});

describe('govRequirementExtractAI — fail-soft, never throws', () => {
  it('returns an error (and never calls the model) when there is no API key', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await govRequirementExtractAI([{ name: 'rfp.pdf', text: 'The offeror shall do a thing.' }]);
    expect(r.candidates).toEqual([]);
    expect(r.error).toBeTruthy();
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });
  it('returns sanitized candidates from the model JSON', async () => {
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(mockClient('{"requirements":[{"statement":"Register in SAM","quote":"Offeror shall be registered in SAM.gov","document":"rfp.pdf"}]}'));
    const r = await govRequirementExtractAI([{ name: 'rfp.pdf', text: 'Offeror shall be registered in SAM.gov.' }]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].quote).toBe('Offeror shall be registered in SAM.gov');
  });
  it('an upstream error returns an error object, not a throw', async () => {
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue({ chat: { completions: { create: jest.fn().mockRejectedValue(new Error('boom')) } } });
    const r = await govRequirementExtractAI([{ name: 'rfp.pdf', text: 'x shall y.' }]);
    expect(r.candidates).toEqual([]);
    expect(r.error).toBeTruthy();
  });
});

describe('applyAiComprehension — flag-gated, additive, fail-soft', () => {
  const extraction = (): any => ({
    requirements: [det('REQ-001', 'A deterministic requirement.')],
    files: [{ name: 'rfp.pdf', status: 'extracted', chars: 100, truncated: false, warning: null, role: 'solicitation' }],
    blocks: [{ id: 'blk-ctx-rfp', locator: 'rfp.pdf', text: 'The Offeror shall submit a redacted copy of the proposal.', kind: 'context' }],
    dossier: { contacts: [], naics: [], codes: [], meetings: [], keyDates: [] }, fileCount: 1,
  });

  it('OFF by default: returns the deterministic requirements unchanged and calls no model', async () => {
    const out = await applyAiComprehension(extraction());
    expect(out.requirements.map((r) => r.canonicalReqId)).toEqual(['REQ-001']);
    expect(out.aiMeta.mode).toBe('deterministic');
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('ON: appends a quote-VERIFIED AI requirement after the deterministic one (continuing REQ-NNN)', async () => {
    (FLAGS as any).govAiExtraction = true;
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(mockClient('{"requirements":[{"statement":"Submit a redacted copy","quote":"shall submit a redacted copy of the proposal","document":"rfp.pdf"}]}'));
    const out = await applyAiComprehension(extraction());
    expect(out.requirements.map((r) => r.canonicalReqId)).toEqual(['REQ-001', 'REQ-002']);
    expect(out.requirements[1].extractedText).toBe('shall submit a redacted copy of the proposal'); // verbatim, verified
    expect(out.aiMeta).toMatchObject({ mode: 'deterministic+ai', aiKept: 1 });
  });

  it('ON but the model fabricates a quote NOT in the source: it is DROPPED (deterministic output preserved)', async () => {
    (FLAGS as any).govAiExtraction = true;
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(mockClient('{"requirements":[{"statement":"Invented","quote":"a sentence that never appears anywhere in the solicitation text","document":"rfp.pdf"}]}'));
    const out = await applyAiComprehension(extraction());
    expect(out.requirements.map((r) => r.canonicalReqId)).toEqual(['REQ-001']); // nothing added
    expect(out.aiMeta).toMatchObject({ mode: 'deterministic+ai', aiKept: 0, aiDropped: 1 });
  });
});
