import fs from 'fs';
import path from 'path';
import corpus from './fixtures/artifactContracts.cases.json';
import {
  pathExtension as tsPathExtension,
  validateArtifactContract as tsValidate,
  validateStoryPlanArtifacts as tsValidatePlan,
} from '../storyArtifactContract';

/**
 * THE ANTI-DRIFT CONTROL FOR THE TWO CONTRACT VALIDATORS.
 *
 * The artifact contract schema has two implementations, because the story publisher is plain
 * CommonJS run from `.claude/skills/story-build/scripts` and the platform is TypeScript:
 *
 *   backend/src/services/artifacts/storyArtifactContract.ts        the platform
 *   .claude/skills/story-build/scripts/lib/artifactContract.js     the publisher
 *
 * Two implementations of one rule drift. The usual mitigations are a comment asking people to
 * keep them in step, which fails silently, or a single implementation reached through a
 * compile step or `ts-node`, which this repository cannot rely on: `ts-node` is not a declared
 * dependency of either workspace and only exists here hoisted from somewhere else.
 *
 * So the drift is tested. Both implementations run over the SAME corpus and must agree on every
 * case's refusal codes and on what they resolve. Add a refusal to one side and this suite names
 * the case that disagrees. The DATA is not duplicated at all: both read the same catalog file,
 * `storyArtifactTypes.json`, so the types, their extensions and their evidence sources are
 * physically incapable of diverging.
 */

const PUBLISHER_VALIDATOR = path.resolve(
  __dirname,
  '../../../../../.claude/skills/story-build/scripts/lib/artifactContract.js',
);

interface Case {
  name: string;
  story_id: string;
  artifacts?: unknown;
  expect_codes: string[];
  expect_resolved: number;
}

const CASES = (corpus as { cases: Case[] }).cases;

/* eslint-disable @typescript-eslint/no-var-requires, global-require */

interface PublisherValidator {
  CATALOG_PATH: string;
  pathExtension: (p: string) => string;
  validateArtifactContract: (raw: unknown, ctx?: { storyId?: string }) => {
    ok: boolean; artifacts: unknown[]; refusals: { code: string }[];
  };
  validateStoryPlanArtifacts: (stories: unknown[], overrides?: Record<string, unknown>) => {
    ok: boolean; byStory: unknown; refusals: unknown[];
    storiesWithContract: number; storiesTotal: number;
  };
}

/**
 * Loaded inside the tests, not at collection time. A `require` in a describe body that throws
 * takes the whole suite with it, including the test whose job is to report the missing file.
 */
let cached: PublisherValidator | null = null;
function publisher(): PublisherValidator {
  if (!cached) cached = require(PUBLISHER_VALIDATOR) as PublisherValidator;
  return cached;
}

describe('publisher and platform contract validators agree', () => {
  it('the publisher implementation is where this test expects it', () => {
    // A missing file must fail loudly. A parity suite that silently skips because it could not
    // find one side is the worst outcome available: a green tick over an empty comparison.
    expect(fs.existsSync(PUBLISHER_VALIDATOR)).toBe(true);
  });

  it('the publisher reads the same catalog file the platform does', () => {
    const js = publisher();
    expect(fs.existsSync(js.CATALOG_PATH)).toBe(true);
    expect(path.resolve(js.CATALOG_PATH)).toBe(
      path.resolve(__dirname, '../storyArtifactTypes.json'),
    );
  });

  it.each(CASES.map((c) => [c.name, c] as const))('agree on: %s', (_name, c) => {
    const ts = tsValidate(c.artifacts, { storyId: c.story_id });
    const alt = publisher().validateArtifactContract(c.artifacts, { storyId: c.story_id });

    const codes = (r: { refusals: { code: string }[] }) =>
      r.refusals.map((x) => x.code).sort();
    expect(codes(alt)).toEqual(codes(ts));
    expect(alt.ok).toBe(ts.ok);
    expect(alt.artifacts).toEqual(ts.artifacts);
  });

  it('agree on the refusal detail, not only the code', () => {
    const raw = [{ key: 'ART-014', name: 'Report', type: 'analysis_report' }];
    const ts = tsValidate(raw, { storyId: 'S-014' });
    const alt = publisher().validateArtifactContract(raw, { storyId: 'S-014' });
    expect(alt.refusals).toEqual(ts.refusals);
  });

  it('agree across a whole plan, including the override rules', () => {
    const stories = [
      { id: 'S-001' },
      { id: 'S-002', artifacts: [{ key: 'ART-001', name: 'G', type: 'field_guide' }] },
      { id: 'S-003', artifacts: [{ key: 'ART-002', name: 'Report', type: 'analysis_report' }] },
    ];
    const overrides = {
      'S-001': [{ key: 'ART-003', name: 'Deck', type: 'presentation' }],
      'S-404': [{ key: 'ART-004', name: 'Orphan', type: 'field_guide' }],
    };
    const ts = tsValidatePlan(stories, overrides);
    const alt = publisher().validateStoryPlanArtifacts(stories, overrides);
    expect(alt.ok).toBe(ts.ok);
    expect(alt.refusals).toEqual(ts.refusals);
    expect(alt.byStory).toEqual(ts.byStory);
    expect(alt.storiesWithContract).toBe(ts.storiesWithContract);
    expect(alt.storiesTotal).toBe(ts.storiesTotal);
  });

  it('agree on the extension reader', () => {
    for (const p of ['docs/a.PDF', 'docs/a.tar.gz', 'docs/report', 'docs/.gitignore', 'docs/a.']) {
      expect(publisher().pathExtension(p)).toBe(tsPathExtension(p));
    }
  });
});
