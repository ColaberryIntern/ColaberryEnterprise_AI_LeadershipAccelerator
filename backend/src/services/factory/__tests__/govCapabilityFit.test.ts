import { assessCapabilityFit, sanitizeCapabilities, __clearGovCapabilityFitCache, type CapabilityFitRequest } from '../govCapabilityFit';

jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockClient = (content: string) => ({
  chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) } },
});

const req: CapabilityFitRequest = {
  requirements: [
    { id: 'REQ-001', text: 'Provide a work order management system integrated with the City GIS' },
    { id: 'REQ-002', text: 'Provide an operator dashboard with role-based access' },
  ],
  services: [
    { id: 'SVC-1', name: 'Operator dashboards', category: 'software', description: 'Role-based dashboards', keywords: ['dashboard', 'rbac'] },
  ],
  title: 'Work Order System',
  buyer: 'Herriman City',
};

describe('sanitizeCapabilities (pure guardrail)', () => {
  const ids = ['SVC-1', 'SVC-2'];
  it('keeps a valid have with a real matched service id', () => {
    const out = sanitizeCapabilities([{ id: 'CAP-01', name: 'Dashboards', assessment: 'have', matchedServiceId: 'SVC-1', rationale: 'covered' }], ids);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ assessment: 'have', matchedServiceId: 'SVC-1' });
  });
  it('drops an invented/growth service id to null AND demotes have -> new (cannot "have" with no service)', () => {
    const out = sanitizeCapabilities([{ id: 'CAP-02', name: 'GIS', assessment: 'have', matchedServiceId: 'SVC-HALLUCINATED', rationale: 'x' }], ids);
    expect(out[0].matchedServiceId).toBeNull();
    expect(out[0].assessment).toBe('new');
  });
  it('demotes a partial with no valid match to new', () => {
    const out = sanitizeCapabilities([{ id: 'CAP-03', name: 'X', assessment: 'partial', matchedServiceId: null, rationale: 'x' }], ids);
    expect(out[0].assessment).toBe('new');
  });
  it('clamps an unknown assessment to new and fills partial/new detail only', () => {
    const out = sanitizeCapabilities([{ id: 'CAP-04', name: 'Y', assessment: 'maybe', whatItIs: 'a thing', whatThisBidGivesUs: 'experience', toDeliver: 'a plan' }], ids);
    expect(out[0].assessment).toBe('new');
    expect(out[0].whatItIs).toBe('a thing');
  });
  it('omits partial/new detail on a have', () => {
    const out = sanitizeCapabilities([{ id: 'CAP-05', name: 'Z', assessment: 'have', matchedServiceId: 'SVC-2', whatItIs: 'ignored' }], ids);
    expect(out[0].whatItIs).toBeUndefined();
  });
  it('drops nameless rows, caps at 12, and is total on garbage', () => {
    expect(sanitizeCapabilities([{ assessment: 'have' }], ids)).toHaveLength(0);
    expect(sanitizeCapabilities(Array.from({ length: 20 }, (_, i) => ({ name: 'c' + i, assessment: 'new' })), ids)).toHaveLength(12);
    expect(sanitizeCapabilities(undefined as any, ids)).toEqual([]);
  });
});

describe('assessCapabilityFit (advisory AI, fails soft, growth excluded)', () => {
  const OLD = process.env.OPENAI_API_KEY;
  beforeEach(() => { __clearGovCapabilityFitCache(); (getInstrumentedOpenAI as jest.Mock).mockReset(); process.env.OPENAI_API_KEY = 'test-key'; });
  afterAll(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD; });

  it('errors (never throws) with no API key, and never calls the model', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await assessCapabilityFit(req);
    expect(r.error).toBeTruthy();
    expect(r.capabilities).toEqual([]);
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('errors with no requirements, and never calls the model', async () => {
    const r = await assessCapabilityFit({ ...req, requirements: [] });
    expect(r.error).toMatch(/No established/);
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('grounds the prompt in the requirements + the real service ids, and sanitizes a hallucinated match', async () => {
    const client = mockClient(JSON.stringify({ capabilities: [
      { id: 'CAP-01', name: 'Operator dashboard', why: 'needed', assessment: 'have', matchedServiceId: 'SVC-1', rationale: 'covered' },
      { id: 'CAP-02', name: 'GIS integration', why: 'needed', assessment: 'have', matchedServiceId: 'SVC-GHOST', rationale: 'x' },
    ] }));
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    const r = await assessCapabilityFit(req);
    expect(r.capabilities).toHaveLength(2);
    expect(r.capabilities.find((c) => c.id === 'CAP-01')).toMatchObject({ assessment: 'have', matchedServiceId: 'SVC-1' });
    const ghost = r.capabilities.find((c) => c.id === 'CAP-02')!;
    expect(ghost.matchedServiceId).toBeNull();   // hallucinated id dropped
    expect(ghost.assessment).toBe('new');        // demoted
    const call = client.chat.completions.create.mock.calls[0][0];
    expect(call.response_format).toEqual({ type: 'json_object' });
    expect(call.messages[0].content).toMatch(/never invent/i);
    expect(call.messages[1].content).toContain('REQ-001');
    expect(call.messages[1].content).toContain('SVC-1');  // the real catalog id is passed in
  });

  it('caches by input hash — a second identical call does not re-call the model', async () => {
    const client = mockClient(JSON.stringify({ capabilities: [{ id: 'CAP-01', name: 'X', assessment: 'new' }] }));
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    expect((await assessCapabilityFit(req)).cached).toBe(false);
    expect((await assessCapabilityFit(req)).cached).toBe(true);
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('an upstream error returns an error field, not a throw', async () => {
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue({ chat: { completions: { create: jest.fn().mockRejectedValue(new Error('boom')) } } });
    const r = await assessCapabilityFit({ ...req, buyer: 'Different City' });
    expect(r.error).toBeTruthy();
    expect(r.capabilities).toEqual([]);
  });
});
