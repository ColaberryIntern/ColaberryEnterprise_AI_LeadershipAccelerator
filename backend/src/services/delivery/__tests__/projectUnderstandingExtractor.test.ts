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
  buildQuoteIndex,
  quoteViolation,
  groundednessRatio,
  groundItem,
  MIN_GROUNDED_RATIO,
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

/**
 * Quotes are now checked against the conversation, so the fixture conversation has to
 * actually contain what the fixture payload quotes.
 */
const CONVO = ['bot: tell me about the workflow', 'human: we re-key every invoice by hand every morning'].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockChatJson.mockResolvedValue(ok(validPayload));
});

describe('extractUnderstanding', () => {
  it('returns a validated understanding on the happy path', async () => {
    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

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

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

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

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

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

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

    // It was the only item, so refusing it leaves nothing and the document fails. The
    // point being asserted is that `pm_confirmed` never survives a transcript run.
    expect(result).toMatchObject({ ok: false, error_class: 'ContractViolation' });
    if (result.ok) return;
    expect(result.error).toContain('pm_confirmed');
    expect(result.error).toContain('not available to a voice_transcript extraction');
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

/**
 * Model drift on an enum key is normal, and it cost a real extraction in production: the
 * first live run against a 245-second call failed entirely because ONE item carried an
 * invented dimension, while a rerun of the same transcript produced eleven valid ones.
 * Losing a customer's whole interview to that is a worse failure than dropping the item.
 */
describe('one bad item does not discard the call', () => {
  const good = validPayload.items[0];
  const bad = { ...good, dimension: 'budget' };

  it('keeps the valid items and reports the refused one', async () => {
    mockChatJson.mockResolvedValue(ok({ ...validPayload, items: [good, bad, good] }));

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.understanding.items).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].index).toBe(1);
  });

  it('names the value that arrived, not only the ones expected', async () => {
    mockChatJson.mockResolvedValue(ok({ ...validPayload, items: [good, bad] }));

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0].reason).toContain('budget');
  });

  it('keeps the raw refused item so nothing vanishes silently', async () => {
    mockChatJson.mockResolvedValue(ok({ ...validPayload, items: [good, bad] }));

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0].raw).toEqual(bad);
  });

  it('refuses an item that breaks the fact firewall, and keeps the rest', async () => {
    const lying = { ...good, provenance: 'ai_inferred', classification: 'FACT', source_quote: undefined };
    mockChatJson.mockResolvedValue(ok({ ...validPayload, items: [good, lying] }));

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.understanding.items).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('cannot support one');
  });

  it('reports a clean run as clean', async () => {
    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([]);
  });

  it('still fails when EVERY item is refused — an understanding of nothing is not one', async () => {
    mockChatJson.mockResolvedValue(ok({ ...validPayload, items: [bad, bad] }));

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });

    expect(result).toMatchObject({ ok: false, error_class: 'ContractViolation' });
    if (result.ok) return;
    expect(result.error).toContain('every item was refused');
  });

  it('still fails when the document itself has no title', async () => {
    mockChatJson.mockResolvedValue(ok({ ...validPayload, title: '  ', items: [good] }));

    const result = await extractUnderstanding({ conversation: CONVO, source: 'voice_transcript' });
    expect(result).toMatchObject({ ok: false, error_class: 'ContractViolation' });
  });
});

/**
 * Both of these failures happened on the FIRST real call this ran against, which is why
 * they are enforced rather than trusted to the prompt: the model attributed a pain point
 * to the AGENT's own sentence, and nothing at all stopped it from inventing a quote.
 */
describe('a quote must be real, and it must be theirs', () => {
  const TRANSCRIPT = [
    'bot: Hi, can you walk me through how that workflow works today?',
    'human: Ralph usually is the keeper of the spreadsheet, our project manager.',
    'bot: Makes sense. So Ralph has the sheet, and Johnny needs to stay in the loop.',
    'human: We need an automated process that sends us a email report.',
  ].join('\n');

  const withQuote = (quote: string) => ({
    ...validPayload,
    items: [{ ...validPayload.items[0], source_quote: quote }],
  });

  const run = () => extractUnderstanding({ conversation: TRANSCRIPT, source: 'voice_transcript' });

  it('accepts a verbatim quote from the customer', async () => {
    mockChatJson.mockResolvedValue(ok(withQuote('Ralph usually is the keeper of the spreadsheet')));

    const result = await run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([]);
  });

  it('refuses a quote that is the agent talking', async () => {
    mockChatJson.mockResolvedValue(ok(withQuote('Ralph has the sheet, and Johnny needs to stay in the loop')));

    const result = await run();
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.violations?.join(' ')).toContain('agent speaking, not the customer');
  });

  it('refuses a quote that appears nowhere in the conversation', async () => {
    mockChatJson.mockResolvedValue(ok(withQuote('We process about four hundred invoices a week')));

    const result = await run();
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.violations?.join(' ')).toContain('does not appear in the conversation');
  });

  it('does not punish straightened punctuation or collapsed whitespace', async () => {
    const curly = 'bot: hi\nhuman: We\u2019re rebuilding   it every morning.';
    mockChatJson.mockResolvedValue(
      ok({ ...validPayload, items: [{ ...validPayload.items[0], source_quote: "We're rebuilding it every morning." }] }),
    );

    const result = await extractUnderstanding({ conversation: curly, source: 'voice_transcript' });
    expect(result.ok).toBe(true);
  });
});

describe('buildQuoteIndex', () => {
  it('separates the customer from the agent', () => {
    const index = buildQuoteIndex('bot: what happens?\nhuman: ralph owns it', 'voice_transcript');
    expect(index.has_turns).toBe(true);
    expect(index.customer_text).toContain('ralph owns it');
    expect(index.customer_text).not.toContain('what happens');
  });

  it('treats a wrapped line as part of the same turn, not a new one', () => {
    const index = buildQuoteIndex('human: ralph owns it\nand rebuilds it daily', 'voice_transcript');
    expect(index.customer_text).toContain('ralph owns it and rebuilds it daily');
  });

  it('falls back to verbatim-only when a source has no speakers', () => {
    const index = buildQuoteIndex('A requirements document with no turns.', 'document');
    expect(index.has_turns).toBe(false);
    expect(quoteViolation('requirements document', index)).toBeNull();
  });

  it('still catches a fabricated quote when there are no speakers', () => {
    const index = buildQuoteIndex('A requirements document with no turns.', 'document');
    expect(quoteViolation('a budget of two million', index)).toContain('does not appear');
  });
});

/**
 * The hole this closes, stated precisely so the test does not overclaim.
 *
 * `source_message` does not require a `source_quote` — only `voice_transcript` and
 * `source_document` do. So a model can file its own synthesis as something the customer
 * said and every existing check passes: the provenance is allowed for the source, and
 * `quoteViolation` never runs because there is no quote to run it against.
 *
 * Measured on the real extractions before this shipped: the model volunteered a genuine,
 * verified quote for ALL of them, so this demotes nothing today. It is a guard against a
 * run that does not, not a fix for a fire.
 */
describe('groundedness — a sourced claim with no quote is measured, not taken', () => {
  const CUSTOMER = [
    'agent: what happens now?',
    'customer: Marta writes every loan on a paper sign-out sheet and I chase overdue tools on WhatsApp.',
  ].join('\n');

  const index = buildQuoteIndex(CUSTOMER, 'chat');

  const item = (over: any) => ({
    dimension: 'current_workflow',
    value: 'Marta writes loans on a paper sign-out sheet and overdue tools are chased on WhatsApp.',
    classification: 'FACT',
    provenance: 'source_message',
    ...over,
  });

  it('scores a close paraphrase of what they said as grounded', () => {
    expect(groundednessRatio(item({}).value, index)).toBeGreaterThanOrEqual(MIN_GROUNDED_RATIO);
    expect(groundItem(item({}), index).demoted).toBe(false);
  });

  it('scores our own vocabulary as ungrounded', () => {
    const synthesis = 'Success is defined by real-time visibility and automated notification workflows.';
    expect(groundednessRatio(synthesis, index)).toBeLessThan(MIN_GROUNDED_RATIO);
  });

  it('demotes an ungrounded claim rather than rejecting it', () => {
    // The statement may well be true and worth showing. It just stops being presented as
    // something they said.
    const out = groundItem(item({ value: 'Success is defined by real-time visibility and automated notification workflows.' }), index);

    expect(out.demoted).toBe(true);
    expect(out.item.provenance).toBe('ai_inferred');
    // FACT cannot sit on ai_inferred, so the demotion has to carry through the
    // classification or it would produce an item findIntegrityViolations refuses.
    expect(out.item.classification).toBe('ASSUMPTION');
  });

  it('leaves an item with a verified quote alone', () => {
    // quoteViolation has already proved those words are the customer's; measuring the
    // paraphrase again would demote honest items for rewording.
    const out = groundItem(
      item({ value: 'Anything at all, in our words.', source_quote: 'Marta writes every loan on a paper sign-out sheet' }),
      index,
    );
    expect(out.demoted).toBe(false);
  });

  it('leaves an inference alone, because it is already labelled one', () => {
    expect(groundItem(item({ provenance: 'ai_inferred', classification: 'ASSUMPTION' }), index).demoted).toBe(false);
  });

  it('stems, so a faithful paraphrase is not punished for plurals', () => {
    // "messages"/"message" and "members"/"member" have to match or honest items demote.
    expect(groundednessRatio('Marta messages members about overdue loans on WhatsApp', index)).toBeGreaterThanOrEqual(
      MIN_GROUNDED_RATIO,
    );
  });

  it('does not demote a statement with no content words to weigh', () => {
    expect(groundItem(item({ value: 'It is what it is.' }), index).demoted).toBe(false);
  });
});
