import {
  CANDIDATE_THRESHOLD, buildStudentMessage, pointsAvailable, pointsEarned, rankedGaps,
} from '../CaseStudyReadinessModal';
import type { Readiness, ReadinessComponent } from '../CaseStudyKpi';

/**
 * The readiness popup exists to answer one question — "what does this student do next" —
 * and to put that answer in words that can be sent to them.
 *
 * The failure that matters is not a rendering bug. It is telling a student to work on the
 * wrong thing: ordering the list by a component's WEIGHT rather than by the points still
 * available puts the finished 40-point build at the top of a to-do list, above the 15-point
 * gap that would actually move the score.
 */

const comp = (over: Partial<ReadinessComponent>): ReadinessComponent => ({
  key: 'k', label: 'L', score: 0, weight: 0.1, ...over,
});

const readiness = (over: Partial<Readiness>): Readiness => ({
  score: 0, ready: false, components: [], gaps: [], ...over,
});

// Mirrors the real model in projectDeliveryService: build .40, repo .20, artifacts .15,
// narrative .15, stage .10.
const REAL = readiness({
  score: 40,
  components: [
    comp({ key: 'build', label: 'Build progress', score: 1, weight: 0.40 }),
    comp({ key: 'repo', label: 'Repository', score: 0, weight: 0.20, gap: 'no repo' }),
    comp({ key: 'artifacts', label: 'Artifacts', score: 0, weight: 0.15, gap: 'no artifacts' }),
    comp({ key: 'narrative', label: 'Narrative', score: 0, weight: 0.15, gap: 'no executive summary' }),
    comp({ key: 'stage', label: 'Stage', score: 0, weight: 0.10, gap: 'stage is discovery' }),
  ],
  gaps: ['no repo', 'no artifacts', 'no executive summary', 'stage is discovery'],
});

describe('points arithmetic', () => {
  it('reports what a component has earned out of its weight', () => {
    expect(pointsEarned(comp({ score: 1, weight: 0.4 }))).toBe(40);
    expect(pointsEarned(comp({ score: 0.5, weight: 0.2 }))).toBe(10);
  });

  it('reports what is still on the table', () => {
    expect(pointsAvailable(comp({ score: 0, weight: 0.2 }))).toBe(20);
    expect(pointsAvailable(comp({ score: 1, weight: 0.4 }))).toBe(0);
    expect(pointsAvailable(comp({ score: 0.5, weight: 0.2 }))).toBe(10);
  });
});

describe('rankedGaps', () => {
  it('drops components that are already complete', () => {
    // The 40-point build is done. A to-do list containing finished work is not a to-do list.
    expect(rankedGaps(REAL).map((c) => c.key)).not.toContain('build');
  });

  it('orders by points AVAILABLE, not by weight', () => {
    // THE LOAD-BEARING ASSERTION. Sorting by weight would lead with 'build' (0.40) even
    // though it offers nothing, and would tell the student to redo work they finished.
    expect(rankedGaps(REAL).map((c) => c.key)).toEqual(['repo', 'artifacts', 'narrative', 'stage']);
  });

  it('returns nothing when every component is complete', () => {
    const done = readiness({
      score: 100,
      components: [comp({ key: 'build', score: 1, weight: 0.4 }), comp({ key: 'repo', score: 1, weight: 0.6 })],
    });
    expect(rankedGaps(done)).toEqual([]);
  });
});

describe('buildStudentMessage', () => {
  it('states the score and the exact shortfall against the candidate bar', () => {
    const m = buildStudentMessage('CoreOps', 'Quincy Nkwain Ninying', readiness({
      score: 31,
      components: [comp({ key: 'repo', label: 'Repository', score: 0, weight: 0.2, gap: 'no repo' })],
      gaps: ['no repo'],
    }));
    expect(m).toContain('CoreOps is at 31/100');
    expect(m).toContain(`needs ${CANDIDATE_THRESHOLD - 31} more points to reach ${CANDIDATE_THRESHOLD}`);
  });

  it('lists the gaps in the order that pays best, with the points each is worth', () => {
    const m = buildStudentMessage('Ambit', 'Quincy', REAL);
    expect(m.indexOf('no repo')).toBeLessThan(m.indexOf('no artifacts'));
    expect(m.indexOf('no artifacts')).toBeLessThan(m.indexOf('stage is discovery'));
    expect(m).toContain('worth up to 20 points');
  });

  it('does not tell a student who already clears the bar that they are short', () => {
    const m = buildStudentMessage('Ambit', 'Quincy', REAL); // score 40, bar 35
    expect(m).toContain('already clears');
    expect(m).not.toContain('more point');
  });

  it('greets by first name, and stays civil without one', () => {
    expect(buildStudentMessage('P', 'Farhat Beig', REAL)).toContain('Hi Farhat,');
    expect(buildStudentMessage('P', null, REAL)).toContain('Hi,');
  });

  it('says the work is done rather than inventing a task list', () => {
    const done = readiness({ score: 100, components: [comp({ score: 1, weight: 1 })] });
    const m = buildStudentMessage('Finished', 'Sam', done);
    expect(m).toContain('nothing');
    expect(m).not.toContain('worth up to');
  });

  it('never claims the case study will be published — only that candidacy unlocks', () => {
    // The score measures candidacy. Promising publication is a promise this number
    // cannot keep, and it would be read as one.
    const m = buildStudentMessage('CoreOps', 'Q', REAL).toLowerCase();
    expect(m).not.toContain('will be published');
    expect(m).not.toContain('guarantee');
  });
});
