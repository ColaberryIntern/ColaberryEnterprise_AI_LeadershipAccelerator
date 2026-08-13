/**
 * weekTopicLabel — the deterministic "This Week — {topic}" label derived from the
 * blueprint's primary competency (competencies[0]). The kickoff announcement names
 * the week's SUBJECT, not its ROLE (blueprint title). Acronyms (AI/API/MCP) stay
 * uppercase; falls back to the role when there is no competency.
 */
import { weekTopicLabel } from '../cardContentService';

describe('weekTopicLabel', () => {
  it('title-cases a multi-word competency slug (happy path)', () => {
    expect(weekTopicLabel({ competencies: ['prompt_engineering'], title: 'Software Engineer' })).toBe('Prompt Engineering');
    expect(weekTopicLabel({ competencies: ['reliability_engineering'] })).toBe('Reliability Engineering');
    expect(weekTopicLabel({ competencies: ['claude_code'] })).toBe('Claude Code');
  });

  it('keeps known acronyms uppercase', () => {
    expect(weekTopicLabel({ competencies: ['mcp'] })).toBe('MCP');
    expect(weekTopicLabel({ competencies: ['mcp_advanced'] })).toBe('MCP Advanced');
    expect(weekTopicLabel({ competencies: ['claude_api'] })).toBe('Claude API');
    expect(weekTopicLabel({ competencies: ['ai_foundations'] })).toBe('AI Foundations');
  });

  it('reads only the FIRST competency (the primary topic)', () => {
    expect(weekTopicLabel({ competencies: ['subagents', 'orchestration', 'delegation'] })).toBe('Subagents');
  });

  it('falls back to the role (title) when there is no competency', () => {
    expect(weekTopicLabel({ competencies: [], title: 'Governance Lead' })).toBe('Governance Lead');
    expect(weekTopicLabel({ title: 'AI Engineer' })).toBe('AI Engineer');
  });

  it('is safe on null/empty input (boundary)', () => {
    expect(weekTopicLabel(null)).toBe('');
    expect(weekTopicLabel(undefined)).toBe('');
    expect(weekTopicLabel({})).toBe('');
  });
});
