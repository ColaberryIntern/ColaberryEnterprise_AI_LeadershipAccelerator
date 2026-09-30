/**
 * The worked sample is the proof the Phase-1 contracts hold together: it must pass the gate
 * with ZERO errors, carry both tracks, and exercise the hard case (an agent performer with a
 * human accountable). Deterministic, so building it twice is identical (idempotent by construction).
 */
import { buildSampleContractProject } from '../sampleContractProject';
import { factoryErrors, factoryValidate } from '../../factoryValidate';

describe('the sample contract project', () => {
  it('passes factoryValidate with zero errors', () => {
    const errors = factoryErrors(buildSampleContractProject());
    expect(errors).toEqual([]);
  });

  it('carries both tracks (proposal + solution_build), the build linked to a student project', () => {
    const p = buildSampleContractProject();
    const types = p.tracks.map((t) => t.track_type).sort();
    expect(types).toEqual(['proposal', 'solution_build']);
    const build = p.tracks.find((t) => t.track_type === 'solution_build')!;
    expect(build.solution_student_project_id).toBeTruthy();
  });

  it('exercises the OVERSIGHT case: an agent performer with a human ACCOUNTABLE on the same task', () => {
    const p = buildSampleContractProject();
    const extractAssignments = p.assignments.filter((a) => a.task_id === 't-extract');
    expect(extractAssignments.some((a) => a.executor?.type === 'agent' && a.responsibility === 'PERFORMER')).toBe(true);
    expect(extractAssignments.some((a) => a.executor?.type === 'person' && a.responsibility === 'ACCOUNTABLE')).toBe(true);
    // And the gate is satisfied precisely because that human accountable exists.
    expect(factoryValidate(p).filter((i) => i.code === 'OVERSIGHT')).toEqual([]);
  });

  it('covers every requirement block with a task citation (SOURCE_COVERAGE clean)', () => {
    const p = buildSampleContractProject();
    expect(factoryValidate(p).filter((i) => i.code === 'SOURCE_COVERAGE')).toEqual([]);
  });

  it('is deterministic — building it twice is deeply equal (idempotent)', () => {
    expect(buildSampleContractProject()).toEqual(buildSampleContractProject());
  });
});
