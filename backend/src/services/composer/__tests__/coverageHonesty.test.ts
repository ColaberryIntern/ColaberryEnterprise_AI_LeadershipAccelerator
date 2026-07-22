/**
 * Coverage-honesty tests — the Phase-0 gauge fix. Proves that competency coverage
 * reflects what is actually taught (cards + live/Academy sessions), that the
 * architect-domain bar is no longer stuck at 0%, and that the gap analyzer finds
 * exactly the untaught competencies. All deterministic, no LLM.
 */
import { normalizeCompetency, resolveCompetency, domainTouched } from '../competencyDictionary';
import { validateCurriculum } from '../validationEngine';
import { coverageGaps } from '../coverageGapEngine';
import { PlanCard } from '../types';

const card = (type: string, competencies: string[] = []): PlanCard => ({
  type, title: type, bucket: 'learn', week: 1, difficulty: 'core',
  estimated_time: 30, points: { learning: 0, builder: 0, community: 0 }, competencies,
});

// A Week-1-shaped blueprint: rich Claude Code vocabulary that the type registry
// mostly does NOT tag (only setup_lab tags `claude_code`).
const WEEK1 = {
  competencies: ['claude_code', 'agentic_loop', 'context_management', 'plan_mode'],
  architect_domains: ['build_discipline', 'ai_systems_architecture'],
};

describe('competencyDictionary', () => {
  it('normalizes spelling / casing / spacing', () => {
    expect(normalizeCompetency('Agentic Loop')).toBe('agentic_loop');
    expect(normalizeCompetency('  Context-Management ')).toBe('context_management');
    expect(normalizeCompetency('claude.md')).toBe('claude_md');
  });
  it('canonicalizes true synonyms and passes unknowns through', () => {
    expect(resolveCompetency('agentic_loop')).toBe('agentic_loops');
    expect(resolveCompetency('Agentic Loop')).toBe('agentic_loops');
    expect(resolveCompetency('prompting_basics')).toBe('prompt_engineering');
    expect(resolveCompetency('totally_new_skill')).toBe('totally_new_skill'); // counted, not dropped
  });
  it('domainTouched: covered by a constituent competency OR its own id, not by string equality', () => {
    expect(domainTouched('build_discipline', new Set(['claude_code']))).toBe(true);
    expect(domainTouched('build_discipline', new Set(['build_discipline']))).toBe(true);
    expect(domainTouched('ai_systems_architecture', new Set(['claude_code']))).toBe(false);
  });
});

describe('validationEngine — non-card (live/Academy) coverage', () => {
  it('a lone Setup Lab covers only claude_code (25%)', () => {
    const v = validateCurriculum([card('setup_lab')], WEEK1);
    expect(v.competency_coverage).toBe(0.25);
  });

  it('coverage rises to 100% from session_competencies with ZERO card change', () => {
    const cards = [card('setup_lab')];
    const before = validateCurriculum(cards, WEEK1).competency_coverage;
    // Same cards. Only declare what Claude Code 101 + the live session teach.
    const after = validateCurriculum(cards, {
      ...WEEK1,
      session_competencies: ['agentic_loop', 'context_management', 'plan_mode'],
    }).competency_coverage;
    expect(before).toBe(0.25);
    expect(after).toBe(1);
  });

  it('architect-domain coverage is no longer stuck at 0%', () => {
    // build_discipline is touched via claude_code even though no card/blueprint
    // string literally equals "build_discipline".
    const v = validateCurriculum([card('setup_lab')], WEEK1);
    expect(v.domain_coverage).toBeGreaterThan(0);
  });

  it('is deterministic — same inputs, identical scores', () => {
    const cards = [card('setup_lab'), card('deep_dive')];
    const a = validateCurriculum(cards, WEEK1);
    const b = validateCurriculum(cards, WEEK1);
    expect(a).toEqual(b);
  });
});

describe('coverageGapEngine', () => {
  it('returns the competencies taught by neither a card nor a session', () => {
    const gaps = coverageGaps(WEEK1, [card('setup_lab')]);
    expect(gaps.map((g) => g.competency)).toEqual(['agentic_loops', 'context_management', 'plan_mode']);
    expect(gaps[0].label).toBe('Agentic Loop'); // human label from the blueprint's own wording
  });
  it('is empty when sessions cover the rest', () => {
    const gaps = coverageGaps(
      { ...WEEK1, session_competencies: ['agentic_loop', 'context_management', 'plan_mode'] },
      [card('setup_lab')],
    );
    expect(gaps).toEqual([]);
  });
  it('order is stable (blueprint declaration order)', () => {
    const gaps = coverageGaps(WEEK1, []);
    expect(gaps.map((g) => g.competency)).toEqual(['claude_code', 'agentic_loops', 'context_management', 'plan_mode']);
  });
});
