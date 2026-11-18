import { validateArtifactContract } from '../storyArtifactContract';
import type { ResolvedArtifact } from '../storyArtifactContract';
import {
  artifactTreeFrom,
  matchStoryArtifacts,
  SATISFYING_VERDICTS,
  UNVERIFIABLE_VERDICTS,
  type ArtifactTreeEntry,
} from '../storyArtifactMatch';

/**
 * THE MATCHER, AND THE FIVE CHEAPEST WAYS TO TICK ITS BOX WITHOUT DOING THE WORK.
 *
 * Every rule in `storyArtifactMatch` exists because the dishonest implementation is easier to
 * write, so every rule is tested IN BOTH DIRECTIONS. A matcher only ever seen to accept proves
 * nothing, and a matcher only ever seen to reject proves less: the failure this guards against
 * is a check that returns the same answer whatever it is given.
 *
 * The contracts are built through `validateArtifactContract` rather than hand-written as
 * resolved objects, so a drift between what A0 resolves and what A2 matches fails here.
 */

const resolve = (raw: unknown): ResolvedArtifact[] => {
  const r = validateArtifactContract(raw, { storyId: 'S-001' });
  if (!r.ok) throw new Error(`fixture does not validate: ${r.refusals.map((x) => x.code).join(',')}`);
  return r.artifacts;
};

const blob = (path: string, size = 2048, sha = 'a'.repeat(40)): ArtifactTreeEntry =>
  ({ path, sha, size });

const REPORT = { key: 'ART-001', name: 'Churn report', type: 'analysis_report', repo_path: 'docs/a.pdf' };
const PAGE = { key: 'ART-002', name: 'Portfolio page', type: 'portfolio' };

describe('the artifact matcher', () => {
  it('accepts a declared artifact that is committed at its path as the right type', () => {
    const tree = artifactTreeFrom([blob('docs/a.pdf')]);
    const s = matchStoryArtifacts(resolve([REPORT]), tree);
    expect(s.matches[0].verdict).toBe('satisfied');
    expect(s.satisfied).toEqual(['ART-001']);
    expect(s.outstanding).toEqual([]);
    expect(s.matches[0].blob_sha).toBe('a'.repeat(40));
    expect(s.matches[0].size_bytes).toBe(2048);
  });

  it('reports a declared artifact that is not committed', () => {
    const tree = artifactTreeFrom([blob('docs/something-else.pdf')]);
    const s = matchStoryArtifacts(resolve([REPORT]), tree);
    expect(s.matches[0].verdict).toBe('missing');
    expect(s.outstanding).toEqual(['ART-001']);
    expect(s.satisfied).toEqual([]);
    expect(s.matches[0].reason).toContain('docs/a.pdf');
    // A row must not be offered a sha for a file that was never found.
    expect(s.matches[0].blob_sha).toBeNull();
  });

  it('does not need to check the file type, and this is why', () => {
    // The matcher has NO type check, because it cannot fire: A0 refuses a contract whose
    // repo_path extension the artifact does not accept, so by the time anything is matched the
    // file at the declared path has an accepted extension by definition. The first draft of the
    // matcher had the branch anyway and no test could reach it.
    //
    // This asserts the invariant that makes it unreachable. If A0 ever stops refusing the
    // mismatch, this fails, and the matcher needs the branch back.
    const txtOnAPdfType = validateArtifactContract(
      [{ ...REPORT, repo_path: 'docs/a.txt' }], { storyId: 'S-001' },
    );
    expect(txtOnAPdfType.ok).toBe(false);
    expect(txtOnAPdfType.refusals.map((r) => r.code)).toContain('repo_path_extension_not_declared');

    // And the same path WITH an accepted extension validates, so the refusal above is about the
    // extension rather than about the fixture being broken some other way.
    expect(validateArtifactContract([REPORT], { storyId: 'S-001' }).ok).toBe(true);
  });

  it('refuses an empty file, and accepts the same path with bytes in it', () => {
    const empty = matchStoryArtifacts(resolve([REPORT]), artifactTreeFrom([blob('docs/a.pdf', 0)]));
    expect(empty.matches[0].verdict).toBe('empty_file');
    expect(empty.outstanding).toEqual(['ART-001']);

    const full = matchStoryArtifacts(resolve([REPORT]), artifactTreeFrom([blob('docs/a.pdf', 1)]));
    expect(full.matches[0].verdict).toBe('satisfied');
  });

  it('will not call an artifact satisfied when its contract names content nobody read', () => {
    const withPhrases = resolve([{ ...REPORT, must_contain: ['confusion matrix'] }]);
    const s = matchStoryArtifacts(withPhrases, artifactTreeFrom([blob('docs/a.pdf')]));
    expect(s.matches[0].verdict).toBe('present_content_unchecked');
    // It still COUNTS as handed over, so the story is not blocked on a check we do not run,
    // but the row says what was not read.
    expect(s.satisfied).toEqual(['ART-001']);
    expect(s.matches[0].reason).toContain('confusion matrix');
    expect(s.matches[0].reason).toContain('does not read');

    // The other direction: no phrases declared, so the plain verdict.
    const plain = matchStoryArtifacts(resolve([REPORT]), artifactTreeFrom([blob('docs/a.pdf')]));
    expect(plain.matches[0].verdict).toBe('satisfied');
  });

  it('treats a platform artifact as unverifiable here, not as outstanding', () => {
    // Counting it outstanding would leave every story that declares one permanently
    // unsatisfiable by a verifier that cannot see it.
    const s = matchStoryArtifacts(resolve([PAGE]), artifactTreeFrom([]));
    expect(s.matches[0].verdict).toBe('not_repo_evidence');
    expect(s.unverifiable).toEqual(['ART-002']);
    expect(s.outstanding).toEqual([]);
    expect(s.satisfied).toEqual([]);
    expect(s.matches[0].repo_path).toBeNull();
  });

  it('asserts NOTHING when the tree could not be read', () => {
    // The load-bearing inversion. An empty tree means "we looked and it is not there"; null
    // means "we did not find out". Reporting a student's finished work as missing because
    // GitHub hiccuped is the failure this prevents.
    const unreadable = matchStoryArtifacts(resolve([REPORT, PAGE]), null);
    expect(unreadable.matches.map((m) => m.verdict)).toEqual(['tree_unreadable', 'tree_unreadable']);
    expect(unreadable.outstanding).toEqual([]);
    expect(unreadable.satisfied).toEqual([]);
    expect(unreadable.unverifiable).toEqual(['ART-001', 'ART-002']);
    expect(unreadable.tree_unreadable).toBe(true);

    // And the control: an EMPTY tree is a real answer and does report the artifact missing.
    const emptyTree = matchStoryArtifacts(resolve([REPORT]), artifactTreeFrom([]));
    expect(emptyTree.matches[0].verdict).toBe('missing');
    expect(emptyTree.outstanding).toEqual(['ART-001']);
    expect(emptyTree.tree_unreadable).toBe(false);
  });

  it('accepts any file type for the one catalog type that declares a wildcard', () => {
    const wild = resolve([{ key: 'ART-003', name: 'The build', type: 'build_artifact', repo_path: 'src/app.ts' }]);
    expect(wild[0].file_types).toEqual(['*']);
    const s = matchStoryArtifacts(wild, artifactTreeFrom([blob('src/app.ts')]));
    expect(s.matches[0].verdict).toBe('satisfied');

    // A wildcard still does not excuse an empty file or a missing one.
    expect(matchStoryArtifacts(wild, artifactTreeFrom([blob('src/app.ts', 0)])).matches[0].verdict)
      .toBe('empty_file');
    expect(matchStoryArtifacts(wild, artifactTreeFrom([])).matches[0].verdict).toBe('missing');
  });

  it('honours a contract that narrows the catalog, and A0 enforces the narrowing', () => {
    // analysis_report accepts pdf, html and xlsx in the catalog. A contract narrowed to pdf
    // matches a committed pdf...
    const narrowed = resolve([{ ...REPORT, file_types: ['pdf'] }]);
    expect(matchStoryArtifacts(narrowed, artifactTreeFrom([blob('docs/a.pdf')])).matches[0].verdict)
      .toBe('satisfied');

    // ...and the narrowing is what makes an html path on that same contract unauthorable, which
    // is again A0's job rather than the matcher's.
    const asHtml = validateArtifactContract(
      [{ ...REPORT, repo_path: 'docs/a.html', file_types: ['pdf'] }], { storyId: 'S-001' },
    );
    expect(asHtml.ok).toBe(false);
    expect(asHtml.refusals.map((r) => r.code)).toContain('repo_path_extension_not_declared');
  });

  it('buckets every artifact exactly once, whatever the verdict', () => {
    // The structural control: a key that falls into no bucket would be silently unreported, and
    // a key in two would be double counted. Covers all three buckets at once.
    const contract = resolve([
      REPORT,                                                                      // satisfied
      { key: 'ART-004', name: 'Deck', type: 'presentation', repo_path: 'd/x.pdf' }, // missing
      PAGE,                                                                      // unverifiable
    ]);
    const s = matchStoryArtifacts(contract, artifactTreeFrom([blob('docs/a.pdf')]));
    const bucketed = [...s.satisfied, ...s.outstanding, ...s.unverifiable].sort();
    expect(bucketed).toEqual(['ART-001', 'ART-002', 'ART-004']);
    expect(bucketed.length).toBe(contract.length);
    expect(s.matches.length).toBe(contract.length);
  });

  it('declares no verdict that belongs to two buckets at once', () => {
    const overlap = SATISFYING_VERDICTS.filter((v) => UNVERIFIABLE_VERDICTS.indexOf(v) !== -1);
    expect(overlap).toEqual([]);
  });

  it('drops a tree entry with no path rather than indexing it under an empty string', () => {
    const tree = artifactTreeFrom([
      { path: '', sha: 'x', size: 1 } as ArtifactTreeEntry,
      blob('docs/a.pdf'),
    ]);
    expect(tree!.size).toBe(1);
    expect(matchStoryArtifacts(resolve([REPORT]), tree).matches[0].verdict).toBe('satisfied');
  });

  it('returns empty buckets for a story that declares nothing', () => {
    const s = matchStoryArtifacts([], artifactTreeFrom([blob('docs/a.pdf')]));
    expect(s.matches).toEqual([]);
    expect(s.satisfied).toEqual([]);
    expect(s.outstanding).toEqual([]);
    // Not "tree unreadable" just because there was nothing to look for.
    expect(s.tree_unreadable).toBe(false);
  });
});
