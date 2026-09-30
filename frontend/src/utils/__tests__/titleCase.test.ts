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

  /**
   * Reported by Swati Raman 2026-08-24: a Knowledge Check rendered its topic as
   * the raw slug "Ai_foundations" instead of "AI Foundations".
   *
   * Root cause: the token split was whitespace-only (`/(\s+)/`), so an
   * underscore slug arrived as ONE token. The preserve-casing guard did not
   * fire, `bare` stripped the underscore to "aifoundations" (missing the
   * ACRONYMS set), and the final `replace(/[a-z]/, …)` — no `g` flag —
   * capitalized only the first letter. Result: "Ai_foundations".
   *
   * Competency slugs reach card titles verbatim from backend/src/data/
   * weekBlueprints.ts, so this affected all ~100 of them, not just this one.
   */
  describe('underscore slugs (competency ids reaching the UI verbatim)', () => {
    it('renders the reported slug as readable text with the acronym intact', () => {
      expect(toTitleCase('ai_foundations')).toBe('AI Foundations');
    });

    it('handles the rest of the competency vocabulary', () => {
      expect(toTitleCase('claude_code')).toBe('Claude Code');
      expect(toTitleCase('mcp_server')).toBe('MCP Server');
      expect(toTitleCase('api_authentication')).toBe('API Authentication');
      expect(toTitleCase('prompt_engineering')).toBe('Prompt Engineering');
      expect(toTitleCase('explore_plan_code_commit')).toBe('Explore Plan Code Commit');
    });

    it('still lowercases small connecting words across an underscore boundary', () => {
      expect(toTitleCase('the_request_is_not_the_requirement'))
        .toBe('The Request Is Not the Requirement');
    });

    /**
     * Guard rail. Hyphens must NOT be treated as separators: real titles carry
     * meaningful hyphens ("GPT-Red", "non-technical", "Deep Dive - Business
     * Analyst") and splitting on them would silently re-case authored copy.
     */
    it('leaves hyphenated titles exactly as they are today', () => {
      expect(toTitleCase('GPT-Red: Unlocking Self-Improvement'))
        .toBe('GPT-Red: Unlocking Self-Improvement');
      expect(toTitleCase('Deep Dive - Business Analyst')).toBe('Deep Dive - Business Analyst');
      expect(toTitleCase('non-technical person')).toBe('Non-technical Person');
    });
  });
});
