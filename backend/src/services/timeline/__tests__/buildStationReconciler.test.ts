/**
 * duplicateBuildStationIds — the invariant "one published build station per week":
 * keep the implementation_task, archive the paired artifact_submission; never
 * orphan a lone build station.
 */
import { duplicateBuildStationIds } from '../buildStationReconciler';

const pub = (id: string, type: string) => ({ id, type, visibility: 'published', status: 'active' });

describe('duplicateBuildStationIds', () => {
  it('archives the artifact_submission when a paired implementation_task is published (happy path)', () => {
    const ids = duplicateBuildStationIds([pub('impl', 'implementation_task'), pub('art', 'artifact_submission')]);
    expect(ids).toEqual(['art']);
  });

  it('keeps a LONE artifact_submission (no implementation_task) — never orphan the only station', () => {
    expect(duplicateBuildStationIds([pub('art', 'artifact_submission')])).toEqual([]);
  });

  it('keeps a lone implementation_task', () => {
    expect(duplicateBuildStationIds([pub('impl', 'implementation_task')])).toEqual([]);
  });

  it('archives ALL published artifact_submissions when an impl exists (multiple dupes)', () => {
    const ids = duplicateBuildStationIds([pub('impl', 'implementation_task'), pub('a1', 'artifact_submission'), pub('a2', 'artifact_submission')]);
    expect(ids.sort()).toEqual(['a1', 'a2']);
  });

  it('ignores already-archived / inactive cards (idempotent — no re-archive)', () => {
    const ids = duplicateBuildStationIds([
      pub('impl', 'implementation_task'),
      { id: 'art', type: 'artifact_submission', visibility: 'archived', status: 'active' },
    ]);
    expect(ids).toEqual([]);
  });

  it('returns nothing for an empty group (boundary)', () => {
    expect(duplicateBuildStationIds([])).toEqual([]);
  });
});
