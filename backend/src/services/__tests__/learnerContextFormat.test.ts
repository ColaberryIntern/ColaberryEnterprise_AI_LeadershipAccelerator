/**
 * learnerContextFormat — unit tests for the pure Learner-360 serializer.
 * Hermetic (no DB): covers the compact render, the two cross-cutting rules
 * (token budget + PII redaction), the empty/partial-data paths, and the
 * assessment rollup.
 */
import {
  LearnerContext, emptyLearnerContext, renderLearnerContext, redactPII, rollupAssessments,
} from '../learnerContextFormat';

function full(): LearnerContext {
  return {
    identity: { full_name: 'Sofia Chen', status: 'active', cohort: 'July 2026', readiness: 42 },
    persona: { company: 'Acme', industry: 'FinTech', role: 'VP Product', goal: 'ship an AI copilot', ai_maturity: 2, use_case: 'support triage' },
    competency: { proficiency_pct: 38, skills_mastered: 3, total_skills: 40, top_gaps: ['prompt_design', 'eval_methods', 'rag_basics'] },
    assessments: { evals_taken: 4, evals_passed: 2, avg_eval_pct: 68, weak_competencies: ['prompting', 'agents'] },
    project: { name: 'Support Copilot', stage: 'implementation', requirements_pct: 55 },
  };
}

describe('renderLearnerContext', () => {
  it('renders every section of a full 360 compactly', () => {
    const out = renderLearnerContext(full());
    expect(out).toContain('STUDENT PROFILE');
    expect(out).toContain('Sofia Chen');
    expect(out).toContain('cohort "July 2026"');
    expect(out).toContain('readiness 42/100');
    expect(out).toContain('Persona: Acme; FinTech; VP Product; goal "ship an AI copilot"; AI maturity 2/5; use case "support triage"');
    expect(out).toContain('38% overall proficiency, 3/40 skills mastered');
    expect(out).toContain('Weakest: Prompt Design, Eval Methods, Rag Basics'); // slugs prettified
    expect(out).toContain('4 evaluations taken, 2 passed (avg 68%)');
    expect(out).toContain('Project "Support Copilot", stage: Implementation, requirements 55% complete');
  });

  it('returns empty string when nothing is known yet (new enrollment)', () => {
    expect(renderLearnerContext(emptyLearnerContext())).toBe('');
  });

  it('renders only the sections that have data', () => {
    const ctx = emptyLearnerContext();
    ctx.persona = { role: 'Analyst' };
    const out = renderLearnerContext(ctx);
    expect(out).toContain('Persona: Analyst');
    expect(out).not.toContain('Competency:');
    expect(out).not.toContain('Assessments:');
    expect(out).not.toContain('Project');
  });

  it('redacts PII that slips into persona free-text', () => {
    const ctx = emptyLearnerContext();
    ctx.persona = { goal: 'email me at sofia@acme.com or call 415-555-0199' };
    const out = renderLearnerContext(ctx);
    expect(out).toContain('[redacted-email]');
    expect(out).toContain('[redacted-phone]');
    expect(out).not.toContain('sofia@acme.com');
    expect(out).not.toContain('415-555-0199');
  });

  it('respects the token budget cap', () => {
    const ctx = full();
    ctx.persona.goal = 'x'.repeat(5000);
    const out = renderLearnerContext(ctx, 300);
    expect(out.length).toBeLessThanOrEqual(300);
  });
});

describe('redactPII', () => {
  it('strips emails and phone numbers, leaves other text', () => {
    expect(redactPII('reach a@b.co')).toBe('reach [redacted-email]');
    expect(redactPII('call +1 (415) 555-0199 now')).toBe('call [redacted-phone] now');
    expect(redactPII('no pii here')).toBe('no pii here');
  });
});

describe('rollupAssessments', () => {
  it('counts evals, averages score, and finds the weakest competencies', () => {
    const r = rollupAssessments([
      { kind: 'evaluation', score: 0.8, passed: true, competency_scores: { prompting: { correct: 8, total: 10 }, agents: { correct: 3, total: 10 } } },
      { kind: 'evaluation', score: 0.6, passed: false, competency_scores: { prompting: { correct: 6, total: 10 }, rag: { correct: 5, total: 10 } } },
      { kind: 'quiz', score: 0.5, passed: null, competency_scores: { agents: { correct: 1, total: 10 } } },
    ]);
    expect(r.evals_taken).toBe(2);      // quiz excluded
    expect(r.evals_passed).toBe(1);
    expect(r.avg_eval_pct).toBeCloseTo(70);
    // agents: (3+1)/20 = 0.20 weakest; rag 0.50; prompting (8+6)/20 = 0.70
    expect(r.weak_competencies[0]).toBe('agents');
  });

  it('handles no attempts', () => {
    const r = rollupAssessments([]);
    expect(r).toEqual({ evals_taken: 0, evals_passed: 0, avg_eval_pct: null, weak_competencies: [] });
  });
});
