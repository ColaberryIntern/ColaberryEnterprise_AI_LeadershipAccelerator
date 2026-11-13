/**
 * The outside-document AI analysis. The LLM is MOCKED - no real OpenAI call is ever made here.
 */
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import {
  analyzeOutsideDocument, sanitizeOutsideAnalysis, __clearOutsideAnalysisCache, MAX_ANALYSIS_CHARS,
} from '../caseStudyOutsideAnalysis';

const mocked = getInstrumentedOpenAI as unknown as jest.Mock;
const clientReturning = (create: jest.Mock) => ({ chat: { completions: { create } } });
const okJson = JSON.stringify({
  title: 'Advanced Econometric Pricing Model', industry: 'AgTech', year: 2024,
  clientDescriptor: 'a major agriculture science company', summary: 'A hybrid pricing model.',
  outcomes: ['Five key bands identified'], metrics: [{ label: 'Wavelength bands', value: '5', verified: true }],
  techStack: ['XGBoost', 'AWS'], capabilities: ['Pricing optimization'], keywords: ['pricing', 'xgboost'],
  suggestedNaics: ['541511', 'not-a-code'],
});
const input = { text: 'Colaberry built an econometric pricing model.', fileName: 'AgTech.pdf', contentHash: 'a'.repeat(64) };

let errSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  __clearOutsideAnalysisCache();
  process.env.OPENAI_API_KEY = 'test-key';
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errSpy.mockRestore());

describe('sanitizeOutsideAnalysis (pure)', () => {
  it('forces every metric to verified:false whatever the model claimed', () => {
    const out = sanitizeOutsideAnalysis(JSON.parse(okJson), 2026);
    expect(out.metrics).toEqual([{ label: 'Wavelength bands', value: '5', verified: false }]);
  });

  it('keeps only real NAICS-shaped codes and drops an implausible year', () => {
    const out = sanitizeOutsideAnalysis({ suggestedNaics: ['541511', '54', 'abc', '1234567'], year: 1700 }, 2026);
    expect(out.suggestedNaics).toEqual(['541511', '54']);
    expect(out.year).toBeNull();
    expect(sanitizeOutsideAnalysis({ year: '2027' }, 2026).year).toBe(2027);
    expect(sanitizeOutsideAnalysis({ year: 2028 }, 2026).year).toBeNull();
  });

  it('is total: garbage in yields an empty but valid analysis', () => {
    for (const raw of [null, undefined, 'text', 42, [], { title: 7, keywords: 'not-a-list', metrics: [null, {}] }]) {
      const out = sanitizeOutsideAnalysis(raw, 2026);
      expect(out).toMatchObject({ title: null, keywords: [], metrics: [], outcomes: [] });
    }
  });

  it('clamps lengths and list sizes, and de-duplicates case-insensitively', () => {
    const out = sanitizeOutsideAnalysis({
      title: 'x'.repeat(1000), clientDescriptor: 'y'.repeat(500),
      keywords: [...Array.from({ length: 50 }, (_, i) => `k${i}`), 'K1'],
      techStack: ['AWS', 'aws', ' AWS '],
    }, 2026);
    expect(out.title).toHaveLength(280);
    expect(out.clientDescriptor).toHaveLength(160);
    expect(out.keywords).toHaveLength(30);
    expect(out.techStack).toEqual(['AWS']);
  });
});

describe('analyzeOutsideDocument (LLM mocked)', () => {
  it('returns a sanitized analysis and fences the document text as untrusted', async () => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: okJson } }] });
    mocked.mockReturnValue(clientReturning(create));
    const res = await analyzeOutsideDocument(input);
    expect(res.error).toBeNull();
    expect(res.analysis?.title).toBe('Advanced Econometric Pricing Model');
    expect(res.analysis?.metrics.every((m) => m.verified === false)).toBe(true);
    expect(mocked).toHaveBeenCalledWith({ workflow_id: 'case_study_outside_intake' }, { timeout: 90_000, maxRetries: 1 });
    const { messages } = create.mock.calls[0][0];
    expect(messages[0].content).toMatch(/untrusted document text/);
    expect(messages[1].content).toMatch(/<solicitation-[0-9a-f]+>\nColaberry built/);
  });

  it('serves identical text from the content-hash cache without a second LLM call', async () => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: okJson } }] });
    mocked.mockReturnValue(clientReturning(create));
    await analyzeOutsideDocument(input);
    const second = await analyzeOutsideDocument({ ...input, fileName: 'renamed.pdf' });
    expect(second.cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('fails soft with no API key, never calling the client', async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await analyzeOutsideDocument(input);
    expect(res).toMatchObject({ analysis: null, errorClass: 'NoApiKey' });
    expect(mocked).not.toHaveBeenCalled();
  });

  it('fails soft on empty text', async () => {
    const res = await analyzeOutsideDocument({ ...input, text: '   ' });
    expect(res).toMatchObject({ analysis: null, errorClass: 'EmptyDocument' });
  });

  it('fails soft (never throws) when the upstream errors or times out, and logs an error_class', async () => {
    mocked.mockReturnValue(clientReturning(jest.fn().mockRejectedValue(Object.assign(new Error('Request timed out.'), { status: 429 }))));
    const res = await analyzeOutsideDocument(input);
    expect(res).toMatchObject({ analysis: null, errorClass: 'UpstreamError' });
    expect(JSON.parse(String(errSpy.mock.calls[0][0]))).toMatchObject({ event: 'case_study_outside_analysis_failed', error_class: 'UpstreamError' });
  });

  it('fails soft on non-JSON and on JSON with no usable fields, and does not cache a failure', async () => {
    const create = jest.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: 'not json' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"keywords":["x"]}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: okJson } }] });
    mocked.mockReturnValue(clientReturning(create));
    expect((await analyzeOutsideDocument(input)).errorClass).toBe('MalformedOutput');
    expect((await analyzeOutsideDocument(input)).errorClass).toBe('MalformedOutput');
    expect((await analyzeOutsideDocument(input)).analysis?.title).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('caps the document text sent to the model', async () => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: okJson } }] });
    mocked.mockReturnValue(clientReturning(create));
    await analyzeOutsideDocument({ ...input, text: 'z'.repeat(MAX_ANALYSIS_CHARS + 5000) });
    const userMsg: string = create.mock.calls[0][0].messages[1].content;
    expect((userMsg.match(/z/g) || []).length).toBe(MAX_ANALYSIS_CHARS);
  });
});
