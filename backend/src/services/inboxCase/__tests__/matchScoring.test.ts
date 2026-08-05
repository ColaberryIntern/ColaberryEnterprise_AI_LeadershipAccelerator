import { scoreCandidate, buildReason, combineReasons } from '../matchScoring';
import { MATCH_THRESHOLD_AUTO_INCLUDE, MATCH_THRESHOLD_CANDIDATE } from '../../../types/inboxCase';

describe('scoreCandidate — thresholds', () => {
  it('a single exact thread id auto-includes', () => {
    const { score, inclusionStatus } = scoreCandidate([buildReason('exact_thread_id', 'thread abc123')]);
    expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_AUTO_INCLUDE);
    expect(inclusionStatus).toBe('INCLUDED');
  });

  it('a single exact basecamp url auto-includes', () => {
    const { inclusionStatus } = scoreCandidate([buildReason('exact_basecamp_url', 'https://3.basecamp.com/.../todos/123')]);
    expect(inclusionStatus).toBe('INCLUDED');
  });

  it('same participants + same normalized subject together cross candidate but not always auto-include', () => {
    const { score, inclusionStatus } = scoreCandidate([
      buildReason('same_participants', 'shared sender'),
      buildReason('same_normalized_subject', 'subject match'),
    ]);
    expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_CANDIDATE);
    expect(['CANDIDATE', 'INCLUDED']).toContain(inclusionStatus);
  });

  it('a lone exact_email_address (strong signal per directive) auto-includes', () => {
    const { score, inclusionStatus } = scoreCandidate([buildReason('exact_email_address', 'kes@colaberry.com')]);
    expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_AUTO_INCLUDE);
    expect(inclusionStatus).toBe('INCLUDED');
  });

  it('a lone medium signal (e.g. same_basecamp_project) alone stays below auto-include', () => {
    const { score, inclusionStatus } = scoreCandidate([buildReason('same_basecamp_project', 'shared BC project')]);
    expect(score).toBeLessThan(MATCH_THRESHOLD_AUTO_INCLUDE);
    expect(inclusionStatus).not.toBe('INCLUDED');
  });

  it('semantic similarity alone never reaches the candidate floor', () => {
    const { score, inclusionStatus } = scoreCandidate([buildReason('semantic_similarity', 'topical overlap')]);
    expect(score).toBeLessThan(MATCH_THRESHOLD_CANDIDATE);
    expect(inclusionStatus).toBe('EXCLUDED');
  });

  it('generic terminology alone never reaches the candidate floor', () => {
    const { score, inclusionStatus } = scoreCandidate([buildReason('generic_terminology', 'the word "contract"')]);
    expect(score).toBeLessThan(MATCH_THRESHOLD_CANDIDATE);
    expect(inclusionStatus).toBe('EXCLUDED');
  });

  it('stacking three weak signals still stays below auto-include (weak evidence should never silently promote)', () => {
    const { score, inclusionStatus } = scoreCandidate([
      buildReason('semantic_similarity', 'a'),
      buildReason('generic_terminology', 'b'),
      buildReason('ambiguous_first_name_only', 'c'),
    ]);
    expect(score).toBeLessThan(MATCH_THRESHOLD_AUTO_INCLUDE);
    expect(inclusionStatus).not.toBe('INCLUDED');
  });

  it('no reasons scores zero and excludes', () => {
    const { score, inclusionStatus } = scoreCandidate([]);
    expect(score).toBe(0);
    expect(inclusionStatus).toBe('EXCLUDED');
  });

  it('score is monotonic: adding another positive reason never decreases the score', () => {
    const base = combineReasons([buildReason('same_participants', 'x')]);
    const withMore = combineReasons([buildReason('same_participants', 'x'), buildReason('close_date', 'y')]);
    expect(withMore).toBeGreaterThanOrEqual(base);
  });

  it('score is always clamped to [0, 1]', () => {
    const { score } = scoreCandidate([
      buildReason('exact_thread_id', 'a'),
      buildReason('exact_basecamp_url', 'b'),
      buildReason('exact_email_address', 'c'),
    ]);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
