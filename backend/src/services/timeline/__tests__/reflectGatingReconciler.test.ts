/**
 * reflectGateDrift — given one (program, week) group of reflect-bucket cards,
 * decide which ones' stored unlock_rules don't match the computed chain and
 * need a repair write. This is the pure decision the boot-time reconciler
 * acts on; the DB read/write wrapper is not unit-tested (same convention as
 * buildStationReconciler).
 */
import { reflectGateDrift } from '../reflectGatingReconciler';
import { LEARN_GATE, EVAL_GATE, SURVEY_GATE } from '../reflectGating';

const card = (id: string, type: string, unlock_rules: any) => ({ id, type, unlock_rules });

describe('reflectGateDrift', () => {
  it('reports no drift when every card already carries its correct chain rule', () => {
    const group = [
      card('eval', 'evaluation', LEARN_GATE),
      card('survey', 'survey', EVAL_GATE),
      card('reflect', 'reflection', SURVEY_GATE),
    ];
    expect(reflectGateDrift(group)).toEqual([]);
  });

  it('flags an evaluation whose unlock_rules were wiped back to empty (the Week 6/10 prod incident)', () => {
    const group = [card('eval', 'evaluation', [])];
    expect(reflectGateDrift(group)).toEqual([{ id: 'eval', rules: LEARN_GATE }]);
  });

  it('flags a survey still gated on Learn after an evaluation was added later that week', () => {
    const group = [
      card('eval', 'evaluation', LEARN_GATE),
      card('survey', 'survey', LEARN_GATE), // stale — created before the eval existed
    ];
    expect(reflectGateDrift(group)).toEqual([{ id: 'survey', rules: EVAL_GATE }]);
  });

  it('ignores a null/non-array unlock_rules value (treated as empty, same as [])', () => {
    expect(reflectGateDrift([card('eval', 'evaluation', null)])).toEqual([{ id: 'eval', rules: LEARN_GATE }]);
  });

  it('returns nothing for an empty group (boundary)', () => {
    expect(reflectGateDrift([])).toEqual([]);
  });
});
