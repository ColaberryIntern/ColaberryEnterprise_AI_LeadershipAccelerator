import { buildCelebration } from '../storyCelebration';
import type { ArtifactMatch } from '../storyArtifactMatch';

/**
 * THE SENTENCE A PERSON READS.
 *
 * Two properties matter more than the grammar, and both are easy to lose in a refactor:
 *
 *   IT NAMES THE THING, NOT THE KEY. "Your churn model evaluation report is in your repository"
 *   is a sentence about something that exists. "ART-014 satisfied" is a status change. The key is
 *   how the platform cites the artifact and has no business in the sentence.
 *
 *   IT NEVER CLAIMS MORE THAN WAS CHECKED. An artifact whose declared contents were not read is
 *   said to be in place, not to be right, and one handed over on the platform is named separately
 *   because this check never saw it. Flattening either into "verified" would be the overclaim the
 *   artifact contract exists to stop, arriving in friendlier language.
 */

const m = (over: Partial<ArtifactMatch> = {}): ArtifactMatch => ({
  key: 'ART-014',
  verdict: 'satisfied',
  repo_path: 'docs/churn.pdf',
  blob_sha: 'a'.repeat(40),
  size_bytes: 2048,
  reason: 'committed',
  ...over,
});

const NAMES = {
  'ART-014': 'churn model evaluation report',
  'ART-015': 'portfolio page',
  'ART-016': 'decision record',
};

describe('the celebration', () => {
  it('names the artifact, and never prints the key', () => {
    const c = buildCelebration([m()], NAMES);
    expect(c.headline).toBe('Your churn model evaluation report is in your repository.');
    expect(c.headline).not.toContain('ART-014');
    // The key is still carried, for a link.
    expect(c.artifacts[0].key).toBe('ART-014');
  });

  it('says where each artifact went, and groups repo from platform', () => {
    const c = buildCelebration(
      [m(), m({ key: 'ART-015', repo_path: null, blob_sha: null, size_bytes: null })],
      NAMES,
    );
    expect(c.headline).toContain('churn model evaluation report is in your repository');
    expect(c.headline).toContain('portfolio page is on your profile');
    expect(c.artifacts.map((a) => a.where)).toEqual(['repo', 'platform']);
  });

  it('reads as a sentence with two and with three artifacts', () => {
    const two = buildCelebration([m(), m({ key: 'ART-016', repo_path: 'docs/adr.md' })], NAMES);
    expect(two.headline).toBe(
      'Your churn model evaluation report and decision record are in your repository.',
    );

    const three = buildCelebration([
      m(), m({ key: 'ART-016', repo_path: 'docs/adr.md' }),
      m({ key: 'ART-017', repo_path: 'docs/z.pdf' }),
    ], { ...NAMES, 'ART-017': 'handover note' });
    expect(three.headline).toBe(
      'Your churn model evaluation report, decision record and handover note are in your repository.',
    );
  });

  it('says the contents were not read, rather than folding that into the headline', () => {
    const c = buildCelebration([m({ verdict: 'present_content_unchecked' })], NAMES);
    // The headline stays a clean statement about what exists...
    expect(c.headline).toBe('Your churn model evaluation report is in your repository.');
    // ...and the thing that was not checked is said out loud, not dropped.
    expect(c.caveat).toContain('churn model evaluation report');
    expect(c.caveat).toContain('contents were not read');
    expect(c.artifacts[0].content_unchecked).toBe(true);
  });

  it('has no caveat when there is nothing unconfirmed', () => {
    const c = buildCelebration([m()], NAMES);
    expect(c.caveat).toBeNull();
    expect(c.artifacts[0].content_unchecked).toBe(false);
  });

  it('falls back to the key when a name is missing, rather than to an empty sentence', () => {
    // Annotated, because the inferred union of these three literals is not a Record<string,
    // string> and ts-jest transpiles rather than typechecks, so jest would not have said so.
    const cases: Record<string, string>[] = [{}, { 'ART-014': '' }, { 'ART-014': '   ' }];
    for (const names of cases) {
      const c = buildCelebration([m()], names);
      expect(c.headline).toBe('Your ART-014 is in your repository.');
      expect(c.artifacts[0].name).toBe('ART-014');
    }
  });

  it('never claims an artifact was verified, in any wording', () => {
    // The word is the overclaim. The check proves a file of the right kind is at the right path.
    for (const c of [
      buildCelebration([m()], NAMES),
      buildCelebration([m({ verdict: 'present_content_unchecked' })], NAMES),
      buildCelebration([m({ repo_path: null })], NAMES),
    ]) {
      const all = `${c.headline} ${c.caveat ?? ''}`;
      expect(all).not.toMatch(/verified|validated|approved|correct|passed/i);
    }
  });

  it('says something harmless when there is nothing to name', () => {
    const c = buildCelebration([], NAMES);
    expect(c.headline).toBe('This story is complete.');
    expect(c.caveat).toBeNull();
    expect(c.artifacts).toEqual([]);
  });

  it('is pure: the same input gives the same sentence', () => {
    // The stored headline is compared against a rebuilt one elsewhere, which only works if this
    // has no clock and no randomness in it.
    const a = buildCelebration([m(), m({ key: 'ART-015', repo_path: null })], NAMES);
    const b = buildCelebration([m(), m({ key: 'ART-015', repo_path: null })], NAMES);
    expect(a).toEqual(b);
  });
});
