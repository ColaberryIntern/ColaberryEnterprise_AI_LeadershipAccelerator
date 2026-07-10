import { PROMPT_KINDS, FIELD, resolvePrompt, PromptKind } from '../../services/components/promptTesterService';

/**
 * Locks the Experience Studio prompt-stage contract. The Sandbox/Pipeline
 * "Invalid input" bug happened because the HTTP allow-list and the service's
 * stage map drifted — the Design stage existed in the UI but was rejected at the
 * boundary. PROMPT_KINDS is now the single source of truth both derive from;
 * these tests fail loudly if a stage is ever added to one side and not the other.
 */
describe('prompt-stage contract', () => {
  it('includes every testable stage, Design first', () => {
    expect(PROMPT_KINDS).toEqual(['design', 'generation', 'renderer', 'evaluation', 'reflection', 'github', 'improvement']);
  });

  it('maps every kind to a real *_prompt column (no drift)', () => {
    for (const kind of PROMPT_KINDS) {
      expect(FIELD[kind]).toBe(`${kind}_prompt`);
    }
    // FIELD has no keys beyond PROMPT_KINDS
    expect(Object.keys(FIELD).sort()).toEqual([...PROMPT_KINDS].sort());
  });

  it('regression: Design is a first-class, testable stage', () => {
    const design: PromptKind = 'design';
    expect(PROMPT_KINDS).toContain(design);
    expect(FIELD.design).toBe('design_prompt');
  });

  it('resolvePrompt substitutes {{var}} and {var}, leaving unknowns visible', () => {
    expect(resolvePrompt('Teach {{topic}} in week {week}.', { topic: 'RAG', week: '3' })).toBe('Teach RAG in week 3.');
    expect(resolvePrompt('Hello {{missing}}', {})).toBe('Hello {{missing}}');
  });
});
