import { validateArtifactContract } from '../storyArtifactContract';
import { artifactTreeFrom, matchStoryArtifacts, type ArtifactTreeEntry } from '../storyArtifactMatch';
import { decideStoryCompletion } from '../storyCompletionGate';

/**
 * THE ONLY MODULE IN THIS WORKSTREAM THAT WITHHOLDS SOMETHING FROM A PERSON.
 *
 * Every rule is tested in both directions, because each one is a decision about someone's
 * completion and their XP. The two that matter most, and the reason they point opposite ways:
 *
 *   NOTHING EARNED IS REVOKED. A story already latched stays complete whatever the repository
 *   says today, and it is checked first so no later rule can reach past it.
 *
 *   NOTHING IS GRANTED ON ABSENCE OF EVIDENCE. An unreadable tree leaves the story open, which
 *   is the OPPOSITE of `criterionPaths`, where an unreadable tree enforces nothing so a timeout
 *   never costs a student a criterion. Both are cautious; the costs are not symmetric. There,
 *   being wrong takes something away. Here, being wrong hands out a completion nobody verified.
 */

const blob = (path: string, size = 1024): ArtifactTreeEntry =>
  ({ path, sha: 'a'.repeat(40), size });

const REPORT = { key: 'ART-001', name: 'Churn report', type: 'analysis_report', repo_path: 'docs/a.pdf' };
const PAGE = { key: 'ART-002', name: 'Portfolio page', type: 'portfolio' };

const resolve = (raw: unknown) => {
  const r = validateArtifactContract(raw, { storyId: 'S-001' });
  if (!r.ok) throw new Error(`fixture does not validate: ${r.refusals.map((x) => x.code).join(',')}`);
  return r.artifacts;
};

/** Build the real inputs the service builds, rather than hand-written summaries. */
const inputs = (opts: {
  raw?: unknown;
  tree?: ArtifactTreeEntry[] | null;
  alreadyComplete?: boolean;
}) => {
  const raw = 'raw' in opts ? opts.raw : [REPORT];
  const artifacts = raw === undefined || raw === null ? null : resolve(raw);
  const tree = opts.tree === undefined ? [blob('docs/a.pdf')] : opts.tree;
  return {
    alreadyComplete: opts.alreadyComplete ?? false,
    artifactCount: artifacts ? artifacts.length : null,
    match: artifacts ? matchStoryArtifacts(artifacts, artifactTreeFrom(tree)) : null,
  };
};

describe('the completion gate', () => {
  it('lets a story complete when every artifact it can see is handed over', () => {
    const d = decideStoryCompletion(inputs({}));
    expect(d.verdict).toBe('artifacts_satisfied');
    expect(d.may_complete).toBe(true);
    expect(d.is_transition).toBe(true);
    expect(d.satisfied).toEqual(['ART-001']);
    expect(d.reason).toContain('ART-001');
  });

  it('NEVER revokes a completion, whatever the repository holds now', () => {
    // The file is gone and the story was already latched. It stays complete.
    const d = decideStoryCompletion(inputs({ tree: [], alreadyComplete: true }));
    expect(d.verdict).toBe('already_complete');
    expect(d.may_complete).toBe(true);
    expect(d.reason).toContain('revoked');

    // And the same tree on a story NOT yet complete is refused, so the rule above is doing the
    // work rather than the matcher being lenient.
    const fresh = decideStoryCompletion(inputs({ tree: [] }));
    expect(fresh.may_complete).toBe(false);
  });

  it('does not re-fire on a story that was already complete', () => {
    // is_transition is what the celebration keys on. A re-sync must not produce another one.
    const d = decideStoryCompletion(inputs({ alreadyComplete: true }));
    expect(d.may_complete).toBe(true);
    expect(d.is_transition).toBe(false);
  });

  it('has no opinion at all on a story with no contract', () => {
    // 0 of 67 published plans carry a contract today, so any other answer would freeze every
    // live board the moment the flag is switched on.
    const d = decideStoryCompletion(inputs({ raw: null }));
    expect(d.verdict).toBe('no_contract');
    expect(d.may_complete).toBe(true);
    expect(d.reason).toContain('no opinion');
  });

  it('refuses an EMPTY contract, which is not the same as an absent one', () => {
    // Absent is not empty, carried from A0: declaring zero artifacts claims everything is handed
    // over and hands over nothing.
    const d = decideStoryCompletion({ alreadyComplete: false, artifactCount: 0, match: null });
    expect(d.verdict).toBe('contract_empty');
    expect(d.may_complete).toBe(false);
    expect(d.reason).toContain('hands over nothing');

    // The control: absent, same call shape, opposite answer.
    expect(decideStoryCompletion({ alreadyComplete: false, artifactCount: null, match: null })
      .may_complete).toBe(true);
  });

  it('leaves the story open when the repository could not be read', () => {
    const d = decideStoryCompletion(inputs({ tree: null }));
    expect(d.verdict).toBe('unverifiable');
    expect(d.may_complete).toBe(false);
    expect(d.is_transition).toBe(false);
    expect(d.reason).toContain('could not be read');
    expect(d.reason).toContain('stays open');

    // The control, and the asymmetry: an EMPTY tree is a real answer, and it also refuses, but
    // for the different reason that the artifact is genuinely missing.
    const empty = decideStoryCompletion(inputs({ tree: [] }));
    expect(empty.verdict).toBe('artifacts_outstanding');
  });

  it('names what is still owed, and where it was expected', () => {
    const d = decideStoryCompletion(inputs({ tree: [] }));
    expect(d.verdict).toBe('artifacts_outstanding');
    expect(d.may_complete).toBe(false);
    expect(d.outstanding).toEqual(['ART-001']);
    expect(d.reason).toContain('ART-001');
    expect(d.reason).toContain('docs/a.pdf');
    // Not scolding: no judgement about the person, just the fact and the path.
    expect(d.reason).not.toMatch(/fail|should have|did not bother/i);
  });

  it('does not let a platform artifact block completion, and still names it', () => {
    // Counting it against the story would make every story that declares one permanently
    // incompletable by a verifier that cannot see it.
    const d = decideStoryCompletion(inputs({ raw: [REPORT, PAGE] }));
    expect(d.verdict).toBe('artifacts_satisfied');
    expect(d.may_complete).toBe(true);
    expect(d.unverifiable).toEqual(['ART-002']);
    expect(d.reason).toContain('ART-002');
    expect(d.reason).toContain('on the platform');
  });

  it('refuses when one of several is missing, and accepts when all arrive', () => {
    const two = [REPORT, { key: 'ART-003', name: 'The workbook', type: 'data_workbook', repo_path: 'data/b.xlsx' }];
    const partial = decideStoryCompletion(inputs({ raw: two, tree: [blob('docs/a.pdf')] }));
    expect(partial.may_complete).toBe(false);
    expect(partial.outstanding).toEqual(['ART-003']);

    const complete = decideStoryCompletion(inputs({
      raw: two, tree: [blob('docs/a.pdf'), blob('data/b.xlsx')],
    }));
    expect(complete.may_complete).toBe(true);
    expect(complete.satisfied).toEqual(['ART-001', 'ART-003']);
  });

  it('counts an artifact whose contents were not read as handed over', () => {
    // It still COUNTS, so a story is not blocked on a check this phase does not run, and the
    // celebration says separately that the contents were not read.
    const d = decideStoryCompletion(inputs({
      raw: [{ ...REPORT, must_contain: ['confusion matrix'] }],
    }));
    expect(d.verdict).toBe('artifacts_satisfied');
    expect(d.may_complete).toBe(true);
    expect(d.satisfied).toEqual(['ART-001']);
  });

  it('is_transition is false on every refusal, so nothing can celebrate a refusal', () => {
    for (const d of [
      decideStoryCompletion(inputs({ tree: [] })),
      decideStoryCompletion(inputs({ tree: null })),
      decideStoryCompletion({ alreadyComplete: false, artifactCount: 0, match: null }),
    ]) {
      expect(d.may_complete).toBe(false);
      expect(d.is_transition).toBe(false);
    }
  });
});
