/**
 * DARA_PERSONA_BLOCK — pins the two non-negotiable, verbatim lines every
 * agent built through build-platform-agent/SKILL.md must carry (transplanted
 * from docs/CORY_PERSONA_SPEC.md's locked decisions, the same exact wording
 * Reese's own REESE_PERSONA_BLOCK uses — reeseSystemPrompt.ts:48-49,51),
 * plus the real content boundaries approved in PERSONALITY_PROFILE_v1.md.
 *
 * The prompt-ASSEMBLY mechanic itself (charter/directives/memory injection
 * on top of this block) is already covered generically by
 * agentManagerConversationPrompt.test.ts, which proves the function works
 * for ANY agent_name/system_prompt pair — no Dara-specific duplicate of that
 * test is needed. This file only pins Dara's own real persona CONTENT.
 */
import { DARA_PERSONA_BLOCK } from '../daraPersona';
import { REESE_PERSONA_BLOCK } from '../../reese/reeseSystemPrompt';

/** Both source files wrap these lines at different column widths for their
 * own surrounding prose — the "verbatim" requirement is about the real
 * wording, not incidental line-wrap position, so compare with whitespace
 * collapsed rather than requiring an exact line break match. */
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('DARA_PERSONA_BLOCK', () => {
  it('carries the AI-disclosure line verbatim, identical (whitespace-collapsed) to Reese\'s own', () => {
    const line = 'Never pretend to be human or hide that you are an AI — you are always openly AI, every time it\'s relevant, without being asked twice.';
    expect(normalize(DARA_PERSONA_BLOCK)).toContain(line);
    expect(normalize(REESE_PERSONA_BLOCK)).toContain(line);
  });

  it('carries the neutral-pronoun line verbatim, identical (whitespace-collapsed) to Reese\'s own', () => {
    const line = 'Neutral pronouns — you are referred to as "they/them," never gendered.';
    expect(normalize(DARA_PERSONA_BLOCK)).toContain(line);
    expect(normalize(REESE_PERSONA_BLOCK)).toContain(line);
  });

  it('opens by naming the real role, not a generic placeholder', () => {
    expect(DARA_PERSONA_BLOCK).toMatch(/^You are Dara, the Curriculum, Learning & Certification Lead/);
  });

  it('has both a VOICE PRINCIPLES and a GUARDRAILS section, matching the locked structural pattern', () => {
    expect(DARA_PERSONA_BLOCK).toContain('VOICE PRINCIPLES (locked):');
    expect(DARA_PERSONA_BLOCK).toContain('GUARDRAILS (never do these):');
  });

  it('states the two real Boundaries this release enforces — no outbound communication, no LLM calls', () => {
    expect(DARA_PERSONA_BLOCK).toMatch(/Never send an email, DM, or any outbound message/);
    expect(DARA_PERSONA_BLOCK).toMatch(/zero LLM calls/);
  });

  it('never copies Reese\'s own opening line — a genuinely different persona, not a name-swap', () => {
    expect(DARA_PERSONA_BLOCK).not.toContain('AI Systems Architect mentor');
    expect(DARA_PERSONA_BLOCK).not.toContain('direct message thread');
  });
});
