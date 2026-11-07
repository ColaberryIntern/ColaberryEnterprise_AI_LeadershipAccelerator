import { resumeAfterEdit, applyHumanEditCore } from '../humanEdit';
import type { CheckRunResult } from '../proposalReviewTypes';

const result = (passes: boolean): CheckRunResult => ({ scores: { coverage: 90, format: 90, fact: 90, evaluator: 90, proof: 90, clarity: 90 }, findings: [], fatal: [], passes, pageCount: 1 });

describe('resumeAfterEdit', () => {
  it('resumes only when below bar', () => {
    expect(resumeAfterEdit(result(false))).toBe(true);
    expect(resumeAfterEdit(result(true))).toBe(false);
    expect(resumeAfterEdit(null)).toBe(false);
    expect(resumeAfterEdit(undefined)).toBe(false);
  });
});

describe('applyHumanEditCore', () => {
  it('saves the edit, re-judges, and resumes the agent when the edit is still below bar', async () => {
    const saved: string[] = [];
    let resumed = 0;
    const r = await applyHumanEditCore('<p>edited</p>', {
      save: async (h) => { saved.push(h); },
      recheck: async () => result(false),
      resume: () => { resumed++; },
    });
    expect(saved).toEqual(['<p>edited</p>']);
    expect(r).toEqual({ saved: true, passes: false, resumed: true });
    expect(resumed).toBe(1);
  });

  it('saves + re-judges but does NOT resume when the human edit already passes', async () => {
    let resumed = 0;
    const r = await applyHumanEditCore('<p>good</p>', {
      save: async () => {},
      recheck: async () => result(true),
      resume: () => { resumed++; },
    });
    expect(r).toEqual({ saved: true, passes: true, resumed: false });
    expect(resumed).toBe(0);
  });

  it('does not resume when there is nothing to score', async () => {
    let resumed = 0;
    const r = await applyHumanEditCore('<p>x</p>', { save: async () => {}, recheck: async () => null, resume: () => { resumed++; } });
    expect(r).toEqual({ saved: true, passes: false, resumed: false });
    expect(resumed).toBe(0);
  });
});
