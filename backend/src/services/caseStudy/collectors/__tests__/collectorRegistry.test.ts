import { CASE_STUDY_COLLECTOR_KEYS } from '../../../../types/caseStudy';
import { allCollectors, findCollector, hashPayload, needsCommitLog, runCollector } from '../index';
import { SMALL_SERVICE, treeInput } from './fixtureTree';

describe('collector registry', () => {
  it('registers exactly the keys the manifest schema allows, each declaring its own shape', () => {
    expect(allCollectors().map((c) => c.key)).toEqual([...CASE_STUDY_COLLECTOR_KEYS]);
    expect(allCollectors().map((c) => c.shape)).toEqual(['share', 'ratio', 'count', 'span', 'series']);
  });

  it('is a lookup, never a loop: an unknown key runs nothing', () => {
    // These routines run against a checkout of somebody else's repository. An
    // open registry would let a manifest name an arbitrary routine.
    expect(findCollector('rm_minus_rf')).toBeNull();
    expect(runCollector('rm_minus_rf', treeInput(SMALL_SERVICE))).toBeNull();
  });

  it('only fetches a commit log when a registered collector needs one', () => {
    expect(needsCommitLog(['test_files', 'decision_records'])).toBe(false);
    expect(needsCommitLog(['test_files', 'commit_span'])).toBe(true);
    expect(needsCommitLog([])).toBe(false);
  });

  it('hashes the payload, so a re-run at the same sha is identical', () => {
    const first = runCollector('test_files', treeInput(SMALL_SERVICE));
    const second = runCollector('test_files', treeInput([...SMALL_SERVICE].reverse()));
    expect(first?.outputHash).toBeTruthy();
    expect(second?.outputHash).toBe(first?.outputHash);
  });

  it('hashes structure, not key order, so a refactor cannot read as drift', () => {
    expect(hashPayload({ shape: 'ratio', numerator: 4, denominator: 7 }))
      .toBe(hashPayload({ denominator: 7, shape: 'ratio', numerator: 4 }));
  });

  it('changes the hash when the figure changes, which is what drift is', () => {
    expect(hashPayload({ shape: 'ratio', numerator: 4, denominator: 7 }))
      .not.toBe(hashPayload({ shape: 'ratio', numerator: 5, denominator: 7 }));
  });

  it('carries no hash when a collector declined, because there is no figure', () => {
    const declined = runCollector('decision_records', treeInput(['src/index.ts']));
    expect(declined?.result.ok).toBe(false);
    expect(declined?.outputHash).toBeUndefined();
  });
});
