import { buildRecapInput, parseRecapContent } from '../sessionRecapService';

// Live Sessions build-out Phase 4 (Session CC-20260721-s7h4).
// Pure helpers for AI recap generation.

describe('buildRecapInput', () => {
  it('includes session number, title, description, and curriculum', () => {
    const input = buildRecapInput({
      session_number: 3,
      title: 'Enterprise Architecture Deep-Dive',
      description: 'Mapping the reference architecture.',
      curriculum_json: { topics: ['RAG', 'agents'] },
    });
    expect(input).toContain('Session 3: Enterprise Architecture Deep-Dive');
    expect(input).toContain('Description: Mapping the reference architecture.');
    expect(input).toContain('RAG');
  });

  it('works with only a title (missing fields omitted)', () => {
    const input = buildRecapInput({ title: 'Kickoff' });
    expect(input).toContain('Kickoff');
    expect(input).not.toContain('Description:');
    expect(input).not.toContain('Curriculum:');
  });

  it('truncates a huge curriculum blob', () => {
    const big = { notes: 'x'.repeat(10000) };
    const input = buildRecapInput({ title: 'T', curriculum_json: big });
    expect(input.length).toBeLessThan(4200);
  });
});

describe('parseRecapContent', () => {
  it('parses a well-formed JSON recap', () => {
    const r = parseRecapContent('{"summary":"We covered RAG.","takeaways":["Chunking","Eval"]}');
    expect(r.summary).toBe('We covered RAG.');
    expect(r.takeaways).toEqual(['Chunking', 'Eval']);
  });

  it('caps takeaways at 6 and drops non-strings/blanks', () => {
    const r = parseRecapContent(
      JSON.stringify({ summary: 's', takeaways: ['a', '', 'b', 2, 'c', 'd', 'e', 'f', 'g'] })
    );
    expect(r.takeaways).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('tolerates a missing takeaways field', () => {
    const r = parseRecapContent('{"summary":"only summary"}');
    expect(r.summary).toBe('only summary');
    expect(r.takeaways).toEqual([]);
  });

  it('falls back to raw text as summary when not valid JSON', () => {
    const r = parseRecapContent('The session covered agents.');
    expect(r.summary).toBe('The session covered agents.');
    expect(r.takeaways).toEqual([]);
  });

  it('returns empty for null/empty input', () => {
    expect(parseRecapContent(null)).toEqual({ summary: '', takeaways: [] });
    expect(parseRecapContent('')).toEqual({ summary: '', takeaways: [] });
  });
});
