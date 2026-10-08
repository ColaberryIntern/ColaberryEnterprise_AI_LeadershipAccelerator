import { generateRiskNarrative, generateProposalSummary, __clearGovNarrativeCache, type RiskNarrativeFacts } from '../govBidNarrative';

jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockClient = (content: string) => ({
  chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) } },
});

const facts: RiskNarrativeFacts = {
  band: 'bid_with_conditions', pwin: 55, preliminary: true, expectedValue: 275000, daysLeft: 13,
  knockouts: [{ category: 'Mandatory certification', text: 'Provide current SOC 2 Type II certification', status: 'conditional' }],
  factors: [{ label: 'Customer relationship', score: 1, weight: 0.2 }],
  buyer: 'City of Fort Worth', title: 'IVR',
};

describe('govBidNarrative (advisory AI, downstream of the deterministic engine)', () => {
  const OLD = process.env.OPENAI_API_KEY;
  beforeEach(() => { __clearGovNarrativeCache(); (getInstrumentedOpenAI as jest.Mock).mockReset(); process.env.OPENAI_API_KEY = 'test-key'; });
  afterAll(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD; });

  it('risk narrative: returns an error (never throws) when no API key is configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await generateRiskNarrative(facts);
    expect(r.error).toBeTruthy();
    expect(r.narrative).toBe('');
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('risk narrative: generates text, sends a no-fabrication system prompt and the real facts', async () => {
    const client = mockClient('Bid with conditions because SOC 2 is an open gap.');
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    const r = await generateRiskNarrative(facts);
    expect(r.narrative).toContain('SOC 2');
    expect(r.cached).toBe(false);
    const call = client.chat.completions.create.mock.calls[0][0];
    expect(call.messages[0].content).toMatch(/never invent/i);     // the no-fabrication rail
    expect(call.messages[1].content).toContain('SOC 2 Type II');    // the knockout fact is passed in
    expect(call.messages[1].content).toContain('BID WITH CONDITIONS');
  });

  it('risk narrative: caches by input hash — a second identical call does not re-call the model', async () => {
    const client = mockClient('cached narrative');
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    expect((await generateRiskNarrative(facts)).cached).toBe(false);
    expect((await generateRiskNarrative(facts)).cached).toBe(true);
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('risk narrative: an upstream error returns an error field, not a throw', async () => {
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue({ chat: { completions: { create: jest.fn().mockRejectedValue(new Error('boom')) } } });
    const r = await generateRiskNarrative({ ...facts, pwin: 99 }); // different facts to dodge the cache
    expect(r.error).toBeTruthy();
    expect(r.narrative).toBe('');
  });

  it('proposal summary: errors (no throw) with no requirements, and never calls the model', async () => {
    const r = await generateProposalSummary({ requirements: [] });
    expect(r.error).toBeTruthy();
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('proposal summary: parses JSON and grounds the prompt only in the requirements', async () => {
    const client = mockClient(JSON.stringify({ whatTheyWant: 'An IVR system.', whatWedBuild: 'We build an IVR.' }));
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    const r = await generateProposalSummary({ requirements: [{ id: 'R1', text: 'Provide an AI IVR solution' }], title: 'IVR', buyer: 'FW' });
    expect(r.whatTheyWant).toContain('IVR');
    expect(r.whatWedBuild).toContain('IVR');
    const call = client.chat.completions.create.mock.calls[0][0];
    expect(call.response_format).toEqual({ type: 'json_object' });
    expect(call.messages[0].content).toMatch(/ONLY from the requirement/i);
    expect(call.messages[1].content).toContain('Provide an AI IVR solution');
  });
});
