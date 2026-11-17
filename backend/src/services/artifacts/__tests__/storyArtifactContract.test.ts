import corpus from './fixtures/artifactContracts.cases.json';
import {
  ARTIFACT_GATES,
  ARTIFACT_KEY_PATTERN,
  pathExtension,
  validateArtifactContract,
  validateStoryPlanArtifacts,
} from '../storyArtifactContract';
import { artifactType } from '../storyArtifactTypes';

/**
 * The artifact contract schema (phase A0).
 *
 * The corpus in `fixtures/artifactContracts.cases.json` is shared with
 * `contractValidatorParity.test.ts`, which runs the publisher's CommonJS implementation over the
 * same cases. One corpus, two readers, so a refusal added to one implementation and not the other
 * fails a test rather than quietly diverging.
 *
 * ## CONTROLS IN BOTH DIRECTIONS
 *
 * Every refusal below is paired with a case that passes for the opposite reason, because a
 * validator that refuses everything would satisfy a suite made only of refusals. The suite also
 * asserts that the corpus covers every declared refusal code: a code that is never exercised is a
 * refusal nobody has seen work.
 */

interface Case {
  name: string;
  story_id: string;
  artifacts?: unknown;
  expect_codes: string[];
  expect_resolved: number;
}

const CASES = (corpus as { cases: Case[] }).cases;

describe('the shared corpus, against the TypeScript implementation', () => {
  it('has cases at all, so a pass below is not an empty loop', () => {
    expect(CASES.length).toBeGreaterThan(30);
    expect(CASES.filter((c) => c.expect_codes.length === 0).length).toBeGreaterThan(5);
    expect(CASES.filter((c) => c.expect_codes.length > 0).length).toBeGreaterThan(20);
  });

  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = validateArtifactContract(c.artifacts, { storyId: c.story_id });
    expect([...new Set(result.refusals.map((r) => r.code))].sort()).toEqual(c.expect_codes);
    expect(result.ok).toBe(c.expect_codes.length === 0);
    expect(result.artifacts).toHaveLength(c.expect_resolved);
  });
});

describe('what the contract resolves, not just whether it passes', () => {
  it('takes file types and the judging sentence from the catalog when the entry omits them', () => {
    const type = artifactType('analysis_report')!;
    const { artifacts } = validateArtifactContract([
      { key: 'ART-001', name: 'Churn evaluation', type: 'analysis_report', repo_path: 'docs/a.pdf' },
    ]);
    expect(artifacts[0].file_types).toEqual(type.file_types);
    expect(artifacts[0].evaluation_criteria).toBe(type.evaluation_criteria);
    expect(artifacts[0].gates).toEqual(['story_complete']);
    expect(artifacts[0].evidence_source).toBe('repo');
    expect(artifacts[0].requires_screenshot).toBe(false);
  });

  it('carries requires_screenshot across from the type rather than from the entry', () => {
    const { artifacts } = validateArtifactContract([
      { key: 'ART-001', name: 'Importer', type: 'build_artifact', repo_path: 'src/run.ts' },
    ]);
    expect(artifacts[0].requires_screenshot).toBe(true);
  });

  it('resolves an either-type by whether a repo path was named', () => {
    const platform = validateArtifactContract([
      { key: 'ART-001', name: 'Deck', type: 'presentation' },
    ]);
    const repo = validateArtifactContract([
      { key: 'ART-001', name: 'Deck', type: 'presentation', repo_path: 'docs/deck.pdf' },
    ]);
    expect(platform.artifacts[0].evidence_source).toBe('platform');
    expect(platform.artifacts[0].repo_path).toBeNull();
    expect(repo.artifacts[0].evidence_source).toBe('repo');
    expect(repo.artifacts[0].repo_path).toBe('docs/deck.pdf');
  });

  it('deduplicates gates and trims the strings it keeps', () => {
    const { artifacts } = validateArtifactContract([
      {
        key: 'ART-001',
        name: '  Churn evaluation  ',
        type: 'analysis_report',
        repo_path: '  docs/a.pdf  ',
        must_contain: ['  confusion matrix  '],
        gates: ['story_complete', 'story_complete', 'release_demo'],
      },
    ]);
    expect(artifacts[0].name).toBe('Churn evaluation');
    expect(artifacts[0].repo_path).toBe('docs/a.pdf');
    expect(artifacts[0].must_contain).toEqual(['confusion matrix']);
    expect(artifacts[0].gates).toEqual(['story_complete', 'release_demo']);
  });

  it('never resolves an entry that produced a refusal, even a refusal about another field', () => {
    // The entry is otherwise perfectly usable. An unknown field alone must stop it, or the gate
    // would later measure a contract its author did not write.
    const result = validateArtifactContract([
      { key: 'ART-001', name: 'G', type: 'field_guide', notes: 'remember to upload' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.artifacts).toHaveLength(0);
  });

  it('names the story, the key and the field on a refusal, so a ticket can quote it', () => {
    const { refusals } = validateArtifactContract(
      [{ key: 'ART-014', name: 'Report', type: 'analysis_report' }],
      { storyId: 'S-014' },
    );
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({
      code: 'repo_path_missing',
      storyId: 'S-014',
      key: 'ART-014',
      field: 'artifacts[0].repo_path',
    });
  });
});

describe('requires_github_validation is now a field something reads', () => {
  it('requires a repo path for every catalog type that declares repo evidence, and for no other', () => {
    const repoTypes: string[] = [];
    const platformTypes: string[] = [];
    for (const t of ['analysis_report', 'build_artifact', 'data_workbook', 'architecture_decision',
      'prompt_library', 'field_guide', 'portfolio', 'demo_capture']) {
      const result = validateArtifactContract([{ key: 'ART-001', name: 'X', type: t }]);
      const missing = result.refusals.some((r) => r.code === 'repo_path_missing');
      (missing ? repoTypes : platformTypes).push(t);
      expect(missing).toBe(artifactType(t)!.requires_github_validation);
    }
    // Both buckets non-empty: a test where every type landed on one side would prove nothing.
    expect(repoTypes.length).toBeGreaterThan(0);
    expect(platformTypes.length).toBeGreaterThan(0);
  });
});

describe('across a whole plan', () => {
  const story = (id: string, artifacts?: unknown) => (artifacts === undefined ? { id } : { id, artifacts });

  it('counts stories with a contract and does not require one in A0', () => {
    const result = validateStoryPlanArtifacts([
      story('S-001'),
      story('S-002', [{ key: 'ART-001', name: 'G', type: 'field_guide' }]),
      story('S-003'),
    ]);
    expect(result.ok).toBe(true);
    expect(result.storiesWithContract).toBe(1);
    expect(result.storiesTotal).toBe(3);
    expect(Object.keys(result.byStory)).toEqual(['S-002']);
  });

  it("lets the story's own contract win over the config override", () => {
    const result = validateStoryPlanArtifacts(
      [story('S-001', [{ key: 'ART-999', name: 'From the plan', type: 'field_guide' }])],
      { 'S-001': [{ key: 'ART-001', name: 'From the config', type: 'field_guide' }] },
    );
    expect(result.byStory['S-001'][0].key).toBe('ART-999');
  });

  it('applies the config override when the story carries no contract', () => {
    const result = validateStoryPlanArtifacts(
      [story('S-001')],
      { 'S-001': [{ key: 'ART-001', name: 'From the config', type: 'field_guide' }] },
    );
    expect(result.byStory['S-001'][0].name).toBe('From the config');
    expect(result.storiesWithContract).toBe(1);
  });

  it('refuses an override aimed at a story the plan does not contain', () => {
    const result = validateStoryPlanArtifacts(
      [story('S-001')],
      { 'S-404': [{ key: 'ART-001', name: 'Orphan', type: 'field_guide' }] },
    );
    expect(result.ok).toBe(false);
    expect(result.refusals.map((r) => r.code)).toEqual(['override_story_unknown']);
  });

  it('allows the same key on two different stories', () => {
    const result = validateStoryPlanArtifacts([
      story('S-001', [{ key: 'ART-001', name: 'G', type: 'field_guide' }]),
      story('S-002', [{ key: 'ART-001', name: 'G', type: 'field_guide' }]),
    ]);
    // Global uniqueness would make inserting a story renumber the whole board.
    expect(result.ok).toBe(true);
  });
});

describe('the corpus covers every refusal the schema can produce', () => {
  it('exercises each declared refusal code at least once', () => {
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '../storyArtifactContract.ts'),
      'utf8',
    ) as string;
    const union = source.slice(
      source.indexOf('export type ContractRefusalCode'),
      source.indexOf(';', source.indexOf('export type ContractRefusalCode')),
    );
    const declared = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(declared.length).toBeGreaterThan(25);

    const exercised = new Set<string>();
    for (const c of CASES) {
      for (const code of validateArtifactContract(c.artifacts, { storyId: c.story_id }).refusals) {
        exercised.add(code.code);
      }
    }
    // override_story_unknown is plan-level, so it cannot appear in a single-story corpus; it is
    // covered by the plan suite above.
    exercised.add('override_story_unknown');
    expect(declared.filter((d) => !exercised.has(d))).toEqual([]);
  });
});

describe('the small pieces', () => {
  it('reads the extension of a path, and nothing when there is none', () => {
    expect(pathExtension('docs/a.PDF')).toBe('pdf');
    expect(pathExtension('docs/a.tar.gz')).toBe('gz');
    expect(pathExtension('docs/report')).toBe('');
    expect(pathExtension('docs/.gitignore')).toBe('');
    expect(pathExtension('docs/a.')).toBe('');
  });

  it('accepts the documented key shape and rejects near misses', () => {
    for (const good of ['ART-014', 'A1-1', 'ABCDEFGH-9999']) {
      expect(ARTIFACT_KEY_PATTERN.test(good)).toBe(true);
    }
    for (const bad of ['art-014', 'A-014', 'ART014', 'ART-', 'ART-12345', 'ABCDEFGHI-1']) {
      expect(ARTIFACT_KEY_PATTERN.test(bad)).toBe(false);
    }
  });

  it('keeps the gate set closed', () => {
    expect([...ARTIFACT_GATES]).toEqual(['story_complete', 'release_demo', 'project_close']);
  });
});
