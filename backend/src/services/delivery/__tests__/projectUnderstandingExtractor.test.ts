/**
 * The extractor's safety property is that it cannot claim to have seen what it did not see.
 *
 * A model asked to fill in a "provenance" field will reach for the most agreeable value in
 * the list, and `client_confirmed` on every item would make the whole provenance trail
 * worthless while looking like a complete result. So the narrowing is enforced after the
 * model returns, and these tests hold that enforcement in place.
 */

const mockChatJson = jest.fn();
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: (...a: any[]) => mockChatJson(...a) }));

import {
  extractUnderstanding,
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  provenanceViolations,
  PROVENANCE_BY_SOURCE,
} from '../projectUnderstandingExtractor';

const validPayload = {
  title: 'Property Operations AI',
  proposed_surfaces: ['Operations Command Center'],
  items: [
    {
      dimension: 'problem',
      value: 'Invoices are re-keyed by hand every morning',
      classification: 'FACT',
      provenance: 'voice_transcript',
      source_quote: 'we re-key every invoice by hand',
    },
  ],
};

const ok = (parsed: any) => ({ parsed, runtime_ms: 120, cost_usd: 0.004 });

beforeEach(() => {
  jest.clearAllMocks();
  mockChatJson.mockResolvedValue(ok(validPayload));
});

describe('extractUnderstanding', () => {
  it('returns a validated understanding on the happy path', async () => {
    const result = await extractUnderstanding({ conversation: 'a real call', source: 'voice_transcript' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.understanding.title).toBe('Property Operations AI');
    expect(result.cost_usd).toBe(0.004);
  });

  it('refuses to call the model at all with nothing to read', async () => {
    const result = await extractUnderstanding({ conversation: '   ', source: 'voice_transcript' });

    expect(result).toMatchObject({ ok: false, error_class: 'EmptyInput' });
    expect(mockChatJson).not.toHaveBeenCalled();
  });

  it('names an unparseable model response as such, not as a missing title', async () => {
    // chatJson swallows JSON.parse failures and returns {} — the case this guards.
    mockChatJson.mockResolvedValue(ok({}));

    const result = await extractUnderstanding({ conversation: 'a real call', source: 'voice_transcript' });

    expect(result).toMatchObject({ ok: false, error_class: 'EmptyModelResponse' });
    if (result.ok) return;
    expect(result.error).toContain('nothing parseable');
  });

  it('rejects a contract violation and reports what was violated', async () => {
    mockChatJson.mockResolvedValue(
      ok({
        ...validPayload,
        items: [{ ...validPayload.items[0], provenance: 'ai_inferred', classification: 'FACT', source_quote: undefined }],
      }),
    );

    const result = await extractUnderstanding({ conversation: 'a real call', source: 'voice_transcript' });

    expect(result).toMatchObject({ ok: false, error_class: 'ContractViolation' });
    if (result.ok) return;
    expect(result.violations?.join(' ')).toContain('cannot support one');
  });

  it('rejects provenance the source could not have produced', async () => {
    mockChatJson.mockResolvedValue(
      ok({
        ...validPayload,
        items: [{ ...validPayload.items[0], provenance: 'pm_confirmed' }],
      }),
    );

    const result = await extractUnderstanding({ conversation: 'a real call', source: 'voice_transcript' });

    expect(result).toMatchObject({ ok: false, error_class: 'ContractViolation' });
    if (result.ok) return;
    expect(result.error).toContain('could not have');
    expect(result.error).toContain('pm_confirmed');
  });

  it('passes the conversation and the known facts to the model', async () => {
    await extractUnderstanding({
      conversation: 'they described a maintenance workflow',
      source: 'voice_transcript',
      facts: { name: 'Ali Muwwakkil', company: 'Colaberry' },
    });

    const [, , user] = mockChatJson.mock.calls[0];
    expect(user).toContain('they described a maintenance workflow');
    expect(user).toContain('Ali Muwwakkil');
    expect(user).toContain('Colaberry');
  });
});

describe('provenanceViolations', () => {
  it.each([
    ['voice_transcript', 'source_message'],
    ['chat', 'voice_transcript'],
    ['document', 'client_confirmed'],
  ] as const)('a %s extraction cannot produce %s', (source, forbidden) => {
    const violations = provenanceViolations(
      { title: 't', proposed_surfaces: [], items: [{ ...validPayload.items[0], provenance: forbidden } as any] },
      source,
    );
    expect(violations).toHaveLength(1);
  });

  it('every source can still infer', () => {
    (Object.keys(PROVENANCE_BY_SOURCE) as Array<keyof typeof PROVENANCE_BY_SOURCE>).forEach((source) => {
      expect(PROVENANCE_BY_SOURCE[source]).toContain('ai_inferred');
    });
  });
});

describe('the prompt', () => {
  it('offers the model only the provenances its source allows', () => {
    const prompt = buildExtractionSystemPrompt('voice_transcript');
    expect(prompt).toContain('voice_transcript');
    expect(prompt).toContain('ai_inferred');
    expect(prompt).not.toContain('pm_confirmed');
  });

  it('states the rule the whole contract turns on', () => {
    expect(buildExtractionSystemPrompt('chat')).toContain('NEVER present an assumption as a fact');
  });

  it('lists every dimension, so coverage is not left to the model to imagine', () => {
    const prompt = buildExtractionSystemPrompt('chat');
    ['problem', 'approval_points', 'human_only_decisions', 'delivery_profile'].forEach((d) => {
      expect(prompt).toContain(d);
    });
  });

  it('is deterministic', () => {
    expect(buildExtractionSystemPrompt('chat')).toBe(buildExtractionSystemPrompt('chat'));
    expect(buildExtractionUserPrompt('x', { name: 'A' })).toBe(buildExtractionUserPrompt('x', { name: 'A' }));
  });

  it('omits the preamble entirely when nothing is known about them', () => {
    expect(buildExtractionUserPrompt('just the call')).not.toContain('WHAT WE ALREADY KNEW');
  });
});
