import { generateBuildSpec, __clearGovBuildSpecCache, type BuildSpecRequest } from '../govBuildSpec';

jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockClient = (content: string) => ({
  chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) } },
});

const req: BuildSpecRequest = {
  requirements: [
    { id: 'REQ-001', text: 'Connect to the agency maintenance management system to exchange work orders' },
    { id: 'REQ-002', text: 'Provide an operator dashboard with role-based access' },
  ],
  title: 'Maintenance Integration Platform',
  buyer: 'TxDOT',
  daysLeft: 10,
};

describe('govBuildSpec (advisory AI, downstream of the deterministic build projection)', () => {
  const OLD = process.env.OPENAI_API_KEY;
  beforeEach(() => { __clearGovBuildSpecCache(); (getInstrumentedOpenAI as jest.Mock).mockReset(); process.env.OPENAI_API_KEY = 'test-key'; });
  afterAll(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD; });

  it('returns an error (never throws) when no API key is configured, and never calls the model', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await generateBuildSpec(req);
    expect(r.error).toBeTruthy();
    expect(r.spec).toBe('');
    expect(r.research).toBe('');
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('errors (no throw) with no requirements, and never calls the model', async () => {
    const r = await generateBuildSpec({ ...req, requirements: [] });
    expect(r.error).toBeTruthy();
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('parses JSON, grounds the prompt only in the requirements, and asks the model to verify buyer research', async () => {
    const client = mockClient(JSON.stringify({ spec: 'Capability: work-order exchange (REQ-001).', research: 'TxDOT likely runs a maintenance management system. Verify: confirm the exact platform.' }));
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    const r = await generateBuildSpec(req);
    expect(r.spec).toContain('REQ-001');
    expect(r.research.toLowerCase()).toContain('verify');
    expect(r.cached).toBe(false);
    const call = client.chat.completions.create.mock.calls[0][0];
    expect(call.response_format).toEqual({ type: 'json_object' });
    expect(call.messages[0].content).toMatch(/NEVER invent/i);          // the no-fabrication rail
    expect(call.messages[0].content).toMatch(/advisory/i);              // research is labelled advisory
    expect(call.messages[1].content).toContain('REQ-001');              // the real requirement is passed in
    expect(call.messages[1].content).toContain('TxDOT');                // the buyer is passed in
  });

  it('caches by input hash — a second identical call does not re-call the model', async () => {
    const client = mockClient(JSON.stringify({ spec: 'cached spec', research: 'cached research' }));
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    expect((await generateBuildSpec(req)).cached).toBe(false);
    expect((await generateBuildSpec(req)).cached).toBe(true);
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('an upstream error returns an error field, not a throw (fails soft)', async () => {
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue({ chat: { completions: { create: jest.fn().mockRejectedValue(new Error('boom')) } } });
    const r = await generateBuildSpec({ ...req, daysLeft: 99 }); // different input to dodge the cache
    expect(r.error).toBeTruthy();
    expect(r.spec).toBe('');
    expect(r.research).toBe('');
  });
});
