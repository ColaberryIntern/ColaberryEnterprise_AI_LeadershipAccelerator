/**
 * reflectGateFor — the reflect-chain decision: Evaluation gates on Learn,
 * Survey gates on Evaluation (or Learn if none exists that week), Reflection
 * gates on Survey (falling back to Evaluation, then Learn).
 */
import { LEARN_GATE, EVAL_GATE, SURVEY_GATE, reflectGateFor, reflectSiblingFlags, rulesEqual } from '../reflectGating';

describe('reflectGateFor', () => {
  it('evaluation always gates on Learn, regardless of siblings', () => {
    expect(reflectGateFor('evaluation', { hasEval: false, hasSurvey: false })).toEqual(LEARN_GATE);
    expect(reflectGateFor('evaluation', { hasEval: true, hasSurvey: true })).toEqual(LEARN_GATE);
  });

  it('survey gates on the evaluation when one exists that week', () => {
    expect(reflectGateFor('survey', { hasEval: true, hasSurvey: false })).toEqual(EVAL_GATE);
  });

  it('survey falls back to Learn when the week has no evaluation (e.g. Week 0)', () => {
    expect(reflectGateFor('survey', { hasEval: false, hasSurvey: false })).toEqual(LEARN_GATE);
  });

  it('reflection gates on the survey when one exists that week', () => {
    expect(reflectGateFor('reflection', { hasEval: true, hasSurvey: true })).toEqual(SURVEY_GATE);
  });

  it('reflection falls back to the evaluation when the week has a survey-less evaluation', () => {
    expect(reflectGateFor('reflection', { hasEval: true, hasSurvey: false })).toEqual(EVAL_GATE);
  });

  it('reflection falls back all the way to Learn when the week has neither', () => {
    expect(reflectGateFor('reflection', { hasEval: false, hasSurvey: false })).toEqual(LEARN_GATE);
  });

  it('returns null for a type outside the reflect chain (caller leaves unlock_rules untouched)', () => {
    expect(reflectGateFor('blog', { hasEval: true, hasSurvey: true })).toBeNull();
  });
});

describe('reflectSiblingFlags', () => {
  it('reports both flags false for an empty week', () => {
    expect(reflectSiblingFlags([])).toEqual({ hasEval: false, hasSurvey: false });
  });

  it('detects an evaluation and survey among mixed siblings', () => {
    expect(reflectSiblingFlags([{ type: 'evaluation' }, { type: 'reflection' }, { type: 'survey' }]))
      .toEqual({ hasEval: true, hasSurvey: true });
  });
});

describe('rulesEqual', () => {
  it('is true for structurally identical rule arrays', () => {
    expect(rulesEqual(LEARN_GATE, [{ kind: 'section_complete', bucket: 'learn', scope: 'week', label: 'the Learn section' }])).toBe(true);
  });

  it('is false when the target chain differs', () => {
    expect(rulesEqual(LEARN_GATE, EVAL_GATE)).toBe(false);
  });

  it('is false for an empty vs a populated chain (the drift this whole module exists to catch)', () => {
    expect(rulesEqual([], LEARN_GATE)).toBe(false);
  });
});
