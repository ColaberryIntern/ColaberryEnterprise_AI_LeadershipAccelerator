import { sanitizeDraft, generateProposalDraftAI, __clearGovProposalDraftCache } from '../govProposalDraftAI';

afterEach(() => __clearGovProposalDraftCache());

describe('sanitizeDraft (PURE guardrail — the AI can ask, never answer)', () => {
  it('extracts content and gaps, forces every gap to open with a stable id', () => {
    const { content, gaps } = sanitizeDraft({
      content: 'We comply with the requirement...',
      gaps: [
        { question: 'Which agency was the reference project for?', suggestions: ['City of Dallas', 'TWC'], resolution: 'answered', answer: 'SNEAKY' },
        { question: 'What was the measured uptime?', suggestions: [] },
      ],
    }, 'R1');
    expect(content).toBe('We comply with the requirement...');
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({ id: 'GAP-R1-1', question: 'Which agency was the reference project for?', suggestions: ['City of Dallas', 'TWC'], resolution: 'open' });
    expect(gaps[0].resolution).toBe('open'); // the model may NOT pre-answer a gap
    expect(JSON.stringify(gaps)).not.toContain('SNEAKY'); // and its answer attempt is discarded
  });

  it('drops a gap with no question, and caps gaps/suggestions', () => {
    const raw = { content: 'x', gaps: [{ question: '' }, ...Array.from({ length: 20 }, (_, i) => ({ question: `q${i}`, suggestions: Array.from({ length: 10 }, (_, j) => `s${j}`) }))] };
    const { gaps } = sanitizeDraft(raw, 'R2');
    expect(gaps.length).toBeLessThanOrEqual(12);          // capped
    expect(gaps.every((g) => g.question)).toBe(true);     // the empty-question gap dropped
    expect(gaps[0].suggestions.length).toBeLessThanOrEqual(6); // suggestions capped
  });

  it('is total on garbage', () => {
    expect(sanitizeDraft(undefined, 'R3')).toEqual({ content: '', gaps: [] });
    expect(sanitizeDraft({ gaps: 'nope' }, 'R3')).toEqual({ content: '', gaps: [] });
  });
});

describe('generateProposalDraftAI (fail-soft, no network in these cases)', () => {
  const saved = process.env.OPENAI_API_KEY;
  afterEach(() => { if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; });

  it('returns an error (never throws) when no API key is configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await generateProposalDraftAI({ requirementId: 'R1', requirementText: 'Provide a search database.' });
    expect(r.error).toContain('no API key');
    expect(r.content).toBe('');
  });

  it('returns an error on empty requirement text', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const r = await generateProposalDraftAI({ requirementId: 'R1', requirementText: '   ' });
    expect(r.error).toContain('No requirement text');
  });
});
