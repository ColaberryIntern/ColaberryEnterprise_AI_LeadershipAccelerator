import { toTitleCase } from '../titleCase';

describe('toTitleCase', () => {
  it('title-cases plain words', () => {
    expect(toTitleCase('prompting basics')).toBe('Prompting Basics');
    expect(toTitleCase('quick check: ai foundations')).toBe('Quick Check: AI Foundations');
  });
  it('preserves acronyms and brand casing', () => {
    expect(toTitleCase('claude API + workflow assistant')).toBe('Claude API + Workflow Assistant');
    expect(toTitleCase('intro to MCP and GitHub')).toBe('Intro to MCP and GitHub');
    expect(toTitleCase('AI foundations')).toBe('AI Foundations');
  });
  it('lowercases small connecting words (except first)', () => {
    expect(toTitleCase('the path to becoming an architect')).toBe('The Path to Becoming an Architect');
    expect(toTitleCase('of mice and men')).toBe('Of Mice and Men'); // first word capitalized even if small
  });
  it('leaves em-dash titles intact', () => {
    expect(toTitleCase('Week 1 Feedback — claude code foundations'))
      .toBe('Week 1 Feedback — Claude Code Foundations');
  });
  it('is empty/null safe', () => {
    expect(toTitleCase('')).toBe('');
    expect(toTitleCase(null)).toBe('');
    expect(toTitleCase(undefined)).toBe('');
  });
});
